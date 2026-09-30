import { parseSync } from 'oxc-parser';

import type { FarmerInfo } from './farmer.ts';
import { pyFunctionName, pyIdent } from './naming.ts';
import * as py from './py.ts';
import type { PyNode } from './py.ts';

// The AST is walked structurally, so nodes are deliberately loosely typed.
// oxlint-disable-next-line typescript/no-explicit-any
export type Node = { type: string; start: number; end: number; [key: string]: any };

export interface SourceFile {
  /** The module name, i.e. the file name without its extension. */
  name: string;
  /** Used in error messages. */
  path: string;
  source: string;
}

export interface OutputFile {
  name: string;
  code: string;
}

export interface TranspileResult {
  outputs: OutputFile[];
  errors: TranspileError[];
}

export class TranspileError extends Error {
  file: string;
  line: number;
  column: number;

  constructor(message: string, file: string, line: number, column: number) {
    super(`${file}:${line}:${column}: ${message}`);
    this.name = 'TranspileError';
    this.file = file;
    this.line = line;
    this.column = column;
  }
}

type Kind = 'dict' | 'list' | 'set';
type ExportKind = 'function' | 'variable';

interface Declaration {
  kind: ExportKind;
  exported: boolean;
  valueKind?: Kind;
  returnKind?: Kind;
}

interface ModuleInfo {
  decls: Map<string, Declaration>;
}

type Binding =
  | { type: 'local'; name: string }
  | { type: 'function'; name: string; returnKind?: Kind }
  | { type: 'variable'; name: string; valueKind?: Kind }
  | { type: 'farmerFunction'; name: string }
  | { type: 'farmerEnum'; name: string }
  | { type: 'farmerClass'; name: string }
  | { type: 'farmerNamespace' }
  | { type: 'moduleNamespace'; module: string }
  | { type: 'moduleMember'; module: string; name: string; decl: Declaration };

interface Ctx {
  locals: Map<string, Kind | undefined>;
  globals: Set<string>;
  parent: Ctx | null;
  isModule: boolean;
}

const KIND_BY_CLASS: Record<string, Kind> = { Dict: 'dict', List: 'list', HashSet: 'set' };

const TYPE_ONLY_STATEMENTS = new Set([
  'TSInterfaceDeclaration',
  'TSTypeAliasDeclaration',
  'TSDeclareFunction',
  'EmptyStatement',
]);

const ASSIGN_OPERATORS: Record<string, py.ArithmeticOperator | '='> = {
  '=': '=',
  '+=': 'Add',
  '-=': 'Sub',
  '*=': 'Mult',
  '/=': 'Div',
  '%=': 'Mod',
  '**=': 'Pow',
};

const COMPARE_OPERATORS: Record<string, py.CompareOperator> = {
  '===': 'Eq',
  '==': 'Eq',
  '!==': 'NotEq',
  '!=': 'NotEq',
  '<': 'Lt',
  '<=': 'LtE',
  '>': 'Gt',
  '>=': 'GtE',
  in: 'In',
};

const ARITHMETIC_OPERATORS: Record<string, py.ArithmeticOperator> = {
  '+': 'Add',
  '-': 'Sub',
  '*': 'Mult',
  '/': 'Div',
  '%': 'Mod',
  '**': 'Pow',
};

function unwrap(node: Node): Node {
  let current = node;
  while (
    current.type === 'ParenthesizedExpression' ||
    current.type === 'TSAsExpression' ||
    current.type === 'TSSatisfiesExpression' ||
    current.type === 'TSNonNullExpression' ||
    current.type === 'TSTypeAssertion'
  ) {
    current = current.expression;
  }
  return current;
}

/**
 * Finds every descendant node for which `visit` returns true. Doesn't cross into nested functions.
 */
function someNode(
  node: unknown,
  visit: (node: Node) => boolean,
  skip?: (node: Node) => boolean,
): boolean {
  if (Array.isArray(node)) {
    return node.some(child => someNode(child, visit, skip));
  }
  if (node === null || typeof node !== 'object') {
    return false;
  }
  const current = node as Node;
  if (typeof current.type === 'string') {
    if (visit(current)) {
      return true;
    }
    if (
      current.type === 'FunctionDeclaration' ||
      current.type === 'FunctionExpression' ||
      current.type === 'ArrowFunctionExpression' ||
      skip?.(current)
    ) {
      return false;
    }
  }
  return Object.values(current).some(child => someNode(child, visit, skip));
}

function kindFromType(annotation: Node | null | undefined): Kind | undefined {
  if (!annotation) {
    return undefined;
  }
  const type = annotation.type === 'TSTypeAnnotation' ? annotation.typeAnnotation : annotation;
  if (type.type === 'TSTypeReference' && type.typeName.type === 'Identifier') {
    const name = type.typeName.name;
    if (name === 'Record') {
      return 'dict';
    }
    return KIND_BY_CLASS[name];
  }
  if (type.type === 'TSArrayType') {
    return 'list';
  }
  if (type.type === 'TSTypeLiteral') {
    return 'dict';
  }
  if (type.type === 'TSUnionType') {
    for (const member of type.types) {
      const kind = kindFromType(member);
      if (kind) {
        return kind;
      }
    }
  }
  return undefined;
}

function isFunctionValue(node: Node | null | undefined): boolean {
  if (!node) {
    return false;
  }
  const value = unwrap(node);
  return value.type === 'ArrowFunctionExpression' || value.type === 'FunctionExpression';
}

function simpleKind(node: Node | null | undefined): Kind | undefined {
  if (!node) {
    return undefined;
  }
  const value = unwrap(node);
  if (value.type === 'NewExpression' && value.callee.type === 'Identifier') {
    return KIND_BY_CLASS[value.callee.name];
  }
  if (value.type === 'ObjectExpression') {
    return 'dict';
  }
  if (value.type === 'ArrayExpression') {
    return 'list';
  }
  return undefined;
}

/**
 * Collects the top level declarations of a module.
 */
function collectDeclarations(program: Node): Map<string, Declaration> {
  const decls = new Map<string, Declaration>();

  const addVariable = (declaration: Node, exported: boolean) => {
    for (const declarator of declaration.declarations) {
      const names = patternNames(declarator.id);
      if (declarator.id.type === 'Identifier' && isFunctionValue(declarator.init)) {
        decls.set(declarator.id.name, {
          kind: 'function',
          exported,
          returnKind: kindFromType(unwrap(declarator.init).returnType),
        });
        continue;
      }
      const valueKind =
        declarator.id.type === 'Identifier'
          ? (kindFromType(declarator.id.typeAnnotation) ?? simpleKind(declarator.init))
          : undefined;
      for (const name of names) {
        decls.set(name, { kind: 'variable', exported, valueKind });
      }
    }
  };

  const addDeclaration = (statement: Node, exported: boolean) => {
    if (statement.type === 'FunctionDeclaration') {
      decls.set(statement.id.name, {
        kind: 'function',
        exported,
        returnKind: kindFromType(statement.returnType),
      });
    } else if (statement.type === 'VariableDeclaration') {
      addVariable(statement, exported);
    }
  };

  for (const statement of program.body as Node[]) {
    if (statement.type === 'ExportNamedDeclaration') {
      if (statement.declaration) {
        addDeclaration(statement.declaration, true);
      }
    } else {
      addDeclaration(statement, false);
    }
  }
  for (const statement of program.body as Node[]) {
    if (statement.type === 'ExportNamedDeclaration' && !statement.declaration) {
      for (const specifier of statement.specifiers) {
        const decl = decls.get(specifier.local.name);
        if (decl) {
          decl.exported = true;
        }
      }
    }
  }
  return decls;
}

function patternNames(pattern: Node | null): string[] {
  if (!pattern) {
    return [];
  }
  switch (pattern.type) {
    case 'Identifier':
      return [pattern.name];
    case 'ArrayPattern':
      return (pattern.elements as (Node | null)[]).flatMap(patternNames);
    case 'AssignmentPattern':
      return patternNames(pattern.left);
    case 'RestElement':
      return patternNames(pattern.argument);
    case 'ObjectPattern':
      return (pattern.properties as Node[]).flatMap(property =>
        property.type === 'RestElement'
          ? patternNames(property.argument)
          : patternNames(property.value),
      );
    default:
      return [];
  }
}

function locate(source: string, offset: number): { line: number; column: number } {
  const before = source.slice(0, offset);
  const line = before.split('\n').length;
  const column = offset - before.lastIndexOf('\n');
  return { line, column };
}

class FileTranspiler {
  private readonly bindings = new Map<string, Binding>();
  private readonly importedModules: string[] = [];
  private readonly hoisted: PyNode[] = [];
  private arrowCount = 0;
  private keyCount = 0;
  private guards: PyNode[] | null = null;
  private pre: PyNode[] = [];
  private tempCount = 0;

  private readonly file: SourceFile;
  private readonly program: Node;
  private readonly modules: Map<string, ModuleInfo>;
  private readonly farmer: FarmerInfo;

  constructor(
    file: SourceFile,
    program: Node,
    modules: Map<string, ModuleInfo>,
    farmer: FarmerInfo,
  ) {
    this.file = file;
    this.program = program;
    this.modules = modules;
    this.farmer = farmer;
  }

  private fail(node: Node, message: string): never {
    const { line, column } = locate(this.file.source, node.start);
    throw new TranspileError(message, this.file.path, line, column);
  }

  // ---------------------------------------------------------------------------
  // Module level
  // ---------------------------------------------------------------------------

  transpile(): PyNode {
    const decls = this.modules.get(this.file.name)!.decls;
    for (const [name, decl] of decls) {
      this.bindings.set(
        name,
        decl.kind === 'function'
          ? { type: 'function', name: pyFunctionName(name), returnKind: decl.returnKind }
          : { type: 'variable', name: pyIdent(name), valueKind: decl.valueKind },
      );
    }
    for (const statement of this.program.body as Node[]) {
      if (statement.type === 'ImportDeclaration') {
        this.registerImport(statement);
      }
    }

    const ctx: Ctx = { locals: new Map(), globals: new Set(), parent: null, isModule: true };
    const statements = this.program.body as Node[];
    for (const statement of statements) {
      const body = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
      if (body && !this.isModuleLevelDeclaration(body)) {
        this.declareLocals([body], ctx, [new Set()]);
      }
    }

    const functions: PyNode[] = [];
    const rest: PyNode[] = [];
    for (const statement of statements) {
      const node = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
      if (statement.type === 'ImportDeclaration' || !node) {
        continue;
      }
      if (
        statement.type === 'ExportDefaultDeclaration' ||
        statement.type === 'ExportAllDeclaration'
      ) {
        this.fail(statement, 'Default and re-exports are not supported');
      }
      if (node.type === 'FunctionDeclaration') {
        functions.push(this.emitFunction(node.id.name, node, ctx));
      } else if (
        node.type === 'VariableDeclaration' &&
        node.declarations.every((d: Node) => d.id.type === 'Identifier' && isFunctionValue(d.init))
      ) {
        for (const declarator of node.declarations) {
          functions.push(this.emitFunction(declarator.id.name, unwrap(declarator.init), ctx));
        }
      } else if (TYPE_ONLY_STATEMENTS.has(node.type) || node.declare) {
        continue;
      } else {
        rest.push(...this.emitStatement(node, ctx));
      }
    }

    // Functions are hoisted in TypeScript, so they are defined before anything runs.
    return py.moduleNode([
      ...this.importedModules.map(module => py.importStatement(module)),
      ...this.hoisted,
      ...functions,
      ...rest,
    ]);
  }

  private isModuleLevelDeclaration(node: Node): boolean {
    return (
      node.type === 'FunctionDeclaration' ||
      node.type === 'VariableDeclaration' ||
      node.type === 'ImportDeclaration'
    );
  }

  private registerImport(node: Node): void {
    const source: string = node.source.value;
    if (node.importKind === 'type') {
      return;
    }
    if (source === 'farmer') {
      for (const specifier of node.specifiers as Node[]) {
        if (specifier.type === 'ImportNamespaceSpecifier') {
          this.bindings.set(specifier.local.name, { type: 'farmerNamespace' });
        } else if (specifier.type === 'ImportSpecifier') {
          if (specifier.importKind === 'type') {
            continue;
          }
          const binding = this.farmerBinding(specifier.imported.name);
          if (binding) {
            this.bindings.set(specifier.local.name, binding);
          }
        } else {
          this.fail(specifier, 'Default imports are not supported');
        }
      }
      return;
    }
    if (source.startsWith('./')) {
      const moduleName = source.slice(2).replace(/\.ts$/, '');
      const info = this.modules.get(moduleName);
      if (!info || moduleName.includes('/')) {
        this.fail(node, `Cannot find the module '${source}'`);
      }
      if (!this.importedModules.includes(moduleName)) {
        this.importedModules.push(moduleName);
      }
      for (const specifier of node.specifiers as Node[]) {
        if (specifier.type === 'ImportNamespaceSpecifier') {
          this.bindings.set(specifier.local.name, { type: 'moduleNamespace', module: moduleName });
        } else if (specifier.type === 'ImportSpecifier') {
          if (specifier.importKind === 'type') {
            continue;
          }
          const decl = info.decls.get(specifier.imported.name);
          if (!decl?.exported) {
            this.fail(specifier, `'${moduleName}' does not export '${specifier.imported.name}'`);
          }
          this.bindings.set(specifier.local.name, {
            type: 'moduleMember',
            module: moduleName,
            name: specifier.imported.name,
            decl,
          });
        } else {
          this.fail(specifier, 'Default imports are not supported');
        }
      }
      return;
    }
    this.fail(node, `Cannot import '${source}'. Only 'farmer' and relative modules are supported`);
  }

  private farmerBinding(name: string): Binding | null {
    if (this.farmer.functions.has(name)) {
      return { type: 'farmerFunction', name: pyFunctionName(name) };
    }
    if (this.farmer.enums.has(name)) {
      return { type: 'farmerEnum', name };
    }
    if (this.farmer.classes.has(name)) {
      return { type: 'farmerClass', name };
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Scopes
  // ---------------------------------------------------------------------------

  /**
   * Python has function level scoping, so every declaration in a function is a local of that function.
   * Declarations that would shadow one from an enclosing block would silently merge, so they are rejected.
   */
  private declareLocals(statements: Node[], ctx: Ctx, scopes: Set<string>[]): void {
    const declare = (pattern: Node) => {
      for (const name of patternNames(pattern)) {
        if (scopes.some(scope => scope.has(name))) {
          this.fail(
            pattern,
            `'${name}' shadows another variable. Python scopes are per function, so use a different name`,
          );
        }
        scopes.at(-1)!.add(name);
        if (!ctx.locals.has(name)) {
          ctx.locals.set(name, undefined);
        }
      }
    };
    const inScope = (fn: () => void) => {
      scopes.push(new Set());
      fn();
      scopes.pop();
    };
    const visit = (node: Node | null | undefined): void => {
      if (!node) {
        return;
      }
      switch (node.type) {
        case 'VariableDeclaration':
          for (const declarator of node.declarations) {
            declare(declarator.id);
          }
          break;
        case 'BlockStatement':
          inScope(() => (node.body as Node[]).forEach(visit));
          break;
        case 'IfStatement':
          visit(node.consequent);
          visit(node.alternate);
          break;
        case 'ForStatement':
          inScope(() => {
            visit(node.init);
            visit(node.body);
          });
          break;
        case 'ForOfStatement':
        case 'ForInStatement':
          inScope(() => {
            visit(node.left);
            visit(node.body);
          });
          break;
        case 'WhileStatement':
        case 'DoWhileStatement':
          visit(node.body);
          break;
        default:
          break;
      }
    };
    statements.forEach(visit);
  }

  private resolveIdent(name: string, ctx: Ctx, node: Node): Binding | null {
    for (let current: Ctx | null = ctx; current; current = current.parent) {
      if (current.locals.has(name)) {
        if (current !== ctx && !current.isModule) {
          this.fail(
            node,
            `The function uses '${name}' from an enclosing function. Closures aren't supported, so pass it in as an argument`,
          );
        }
        return { type: 'local', name: pyIdent(name) };
      }
    }
    return this.bindings.get(name) ?? null;
  }

  /**
   * Resolves identifiers and namespace member accesses (`world.getEdge`) that refer to something declared statically.
   */
  private resolveStatic(node: Node, ctx: Ctx): Binding | null {
    const value = unwrap(node);
    if (value.type === 'Identifier') {
      return this.resolveIdent(value.name, ctx, value);
    }
    if (value.type === 'MemberExpression' && !value.computed && !value.optional) {
      const object = this.resolveStatic(value.object, ctx);
      const name: string = value.property.name;
      if (object?.type === 'moduleNamespace') {
        const decl = this.modules.get(object.module)?.decls.get(name);
        if (!decl?.exported) {
          this.fail(value, `'${object.module}' does not export '${name}'`);
        }
        return { type: 'moduleMember', module: object.module, name, decl };
      }
      if (object?.type === 'farmerNamespace') {
        const binding = this.farmerBinding(name);
        if (!binding) {
          this.fail(value, `'${name}' is not provided by the game`);
        }
        return binding;
      }
    }
    return null;
  }

  private emitBinding(binding: Binding, node: Node): PyNode {
    switch (binding.type) {
      case 'local':
      case 'function':
      case 'variable':
      case 'farmerFunction':
        return py.name(binding.name);
      case 'farmerEnum':
        return py.name(binding.name);
      case 'moduleMember':
        return py.attribute(
          py.name(binding.module),
          binding.decl.kind === 'function' ? pyFunctionName(binding.name) : pyIdent(binding.name),
        );
      default:
        return this.fail(node, 'This can only be used to access its members or construct a value');
    }
  }

  // ---------------------------------------------------------------------------
  // Kinds (list / set / dict)
  // ---------------------------------------------------------------------------

  private inferKind(node: Node | null | undefined, ctx: Ctx): Kind | undefined {
    if (!node) {
      return undefined;
    }
    const value = unwrap(node);
    const simple = simpleKind(value);
    if (simple) {
      return simple;
    }
    if (value.type === 'TSAsExpression') {
      return kindFromType(value.typeAnnotation);
    }
    switch (value.type) {
      case 'ChainExpression':
        return this.inferKind(value.expression, ctx);
      case 'Identifier': {
        for (let current: Ctx | null = ctx; current; current = current.parent) {
          if (current.locals.has(value.name)) {
            return current.locals.get(value.name);
          }
        }
        const binding = this.bindings.get(value.name);
        return binding?.type === 'variable' ? binding.valueKind : undefined;
      }
      case 'MemberExpression': {
        const binding = this.resolveStatic(value, ctx);
        if (binding?.type === 'moduleMember') {
          return binding.decl.valueKind;
        }
        return undefined;
      }
      case 'CallExpression': {
        const callee = unwrap(value.callee);
        const binding = this.resolveStatic(callee, ctx);
        if (binding?.type === 'function') {
          return binding.returnKind;
        }
        if (binding?.type === 'moduleMember') {
          return binding.decl.returnKind;
        }
        if (callee.type === 'MemberExpression' && !callee.computed && !binding) {
          if (['keys', 'values', 'entries'].includes(callee.property.name)) {
            return 'list';
          }
        }
        return undefined;
      }
      default:
        return undefined;
    }
  }

  // ---------------------------------------------------------------------------
  // Functions
  // ---------------------------------------------------------------------------

  private emitFunction(name: string, fn: Node, parent: Ctx): PyNode {
    if (fn.async || fn.generator) {
      this.fail(fn, 'Async and generator functions are not supported');
    }
    const ctx: Ctx = { locals: new Map(), globals: new Set(), parent, isModule: false };
    const params: py.Parameter[] = [];
    const prologue: { name: string; node: Node }[] = [];
    const paramNames = new Set<string>();
    let rest: string | null = null;
    let sawDefault = false;

    for (const param of fn.params as Node[]) {
      let target = param;
      let fallback: Node | null = null;
      if (param.type === 'AssignmentPattern') {
        target = param.left;
        fallback = param.right;
      }
      if (param.type === 'RestElement') {
        if (param.argument.type !== 'Identifier') {
          this.fail(param, 'Destructured parameters are not supported');
        }
        ctx.locals.set(param.argument.name, 'list');
        paramNames.add(param.argument.name);
        rest = pyIdent(param.argument.name);
        continue;
      }
      if (target.type !== 'Identifier') {
        this.fail(param, 'Destructured parameters are not supported');
      }
      const paramName = pyIdent(target.name);
      ctx.locals.set(target.name, kindFromType(target.typeAnnotation));
      paramNames.add(target.name);
      if (fallback) {
        sawDefault = true;
        const literal = this.literalDefault(fallback);
        if (literal) {
          params.push({ name: paramName, fallback: literal });
        } else {
          params.push({ name: paramName, fallback: py.none() });
          prologue.push({ name: target.name, node: fallback });
        }
      } else if (target.optional) {
        sawDefault = true;
        params.push({ name: paramName, fallback: py.none() });
      } else {
        if (sawDefault) {
          this.fail(param, 'A required parameter cannot follow an optional one in Python');
        }
        params.push({ name: paramName });
      }
    }

    const body: PyNode[] = [];
    if (fn.body.type === 'BlockStatement') {
      this.declareLocals(fn.body.body, ctx, [paramNames, new Set()]);
    }
    for (const item of prologue) {
      const local = pyIdent(item.name);
      const fallback = this.withPre(() => this.emitExpr(item.node, ctx));
      body.push(
        py.ifStatement(py.compare(py.name(local), 'Eq', py.none()), [
          ...fallback.pre,
          py.assign(py.name(local, true), fallback.value),
        ]),
      );
    }
    if (fn.body.type === 'BlockStatement') {
      body.push(...this.emitStatements(fn.body.body, ctx));
    } else {
      body.push(
        ...this.emitStatement(
          { type: 'ReturnStatement', start: fn.body.start, end: fn.body.end, argument: fn.body },
          ctx,
        ),
      );
    }
    if (ctx.globals.size) {
      body.unshift(py.globalStatement([...ctx.globals]));
    }
    return py.functionDef(pyFunctionName(name), params, rest, body.length ? body : [py.pass()]);
  }

  private literalDefault(node: Node): PyNode | null {
    const value = unwrap(node);
    if (value.type === 'Literal' && !value.regex && value.bigint === undefined) {
      return this.emitLiteral(value);
    }
    if (
      value.type === 'UnaryExpression' &&
      value.operator === '-' &&
      value.argument.type === 'Literal' &&
      typeof value.argument.value === 'number'
    ) {
      return py.negate(py.constant(value.argument.value));
    }
    if (value.type === 'Identifier' && value.name === 'undefined') {
      return py.none();
    }
    return null;
  }

  private hoistArrow(fn: Node, ctx: Ctx): PyNode {
    this.arrowCount += 1;
    const name = `_arrow_${this.arrowCount}`;
    // pyFunctionName leaves these names unchanged.
    this.hoisted.push(this.emitFunction(name, fn, ctx));
    return py.name(name);
  }

  // ---------------------------------------------------------------------------
  // Statements
  // ---------------------------------------------------------------------------

  private newTemp(): string {
    this.tempCount += 1;
    return `_tmp_${this.tempCount}`;
  }

  /**
   * Runs `fn`, collecting the statements it needs to have run before the expression it returns can be used.
   * The game has no conditional expressions, so anything that would need one is written as statements.
   */
  private withPre<T>(fn: () => T): { value: T; pre: PyNode[] } {
    const saved = this.pre;
    this.pre = [];
    try {
      const value = fn();
      return { value, pre: this.pre };
    } finally {
      this.pre = saved;
    }
  }

  private emitStatements(nodes: Node[], ctx: Ctx): PyNode[] {
    return nodes.flatMap(node => this.emitStatement(node, ctx));
  }

  private emitBlock(node: Node, ctx: Ctx): PyNode[] {
    const lines =
      node.type === 'BlockStatement'
        ? this.emitStatements(node.body, ctx)
        : this.emitStatement(node, ctx);
    return lines.length ? lines : [py.pass()];
  }

  private emitStatement(node: Node, ctx: Ctx): PyNode[] {
    const { value, pre } = this.withPre(() => this.emitStatementInner(node, ctx));
    return [...pre, ...value];
  }

  private emitExpressionAsStatement(expression: Node, ctx: Ctx): PyNode[] {
    return this.emitStatement(
      { type: 'ExpressionStatement', start: expression.start, end: expression.end, expression },
      ctx,
    );
  }

  private emitStatementInner(node: Node, ctx: Ctx): PyNode[] {
    switch (node.type) {
      case 'ExpressionStatement':
        return this.emitExpressionStatement(node.expression, ctx);
      case 'VariableDeclaration':
        return this.emitVariableDeclaration(node, ctx);
      case 'FunctionDeclaration':
        return this.fail(
          node,
          'Nested functions are not supported. Move the function to the top level',
        );
      case 'ReturnStatement': {
        if (!node.argument) {
          return [py.returnStatement()];
        }
        const value = unwrap(node.argument);
        if (value.type === 'ConditionalExpression') {
          return this.emitConditionalStatement(value, ctx, result => py.returnStatement(result));
        }
        return [py.returnStatement(this.emitExpr(value, ctx))];
      }
      case 'IfStatement':
        return [this.emitIf(node, ctx, this.emitExpr(node.test, ctx))];
      case 'WhileStatement':
        return this.emitWhile(node.test, node.body, ctx);
      case 'DoWhileStatement':
        return this.emitDoWhile(node, ctx);
      case 'ForStatement':
        return this.emitFor(node, ctx);
      case 'ForOfStatement':
        return this.emitForOf(node, ctx);
      case 'ForInStatement': {
        const { target, prefix } = this.emitLoopTarget(node.left, ctx);
        return [
          py.forStatement(target, this.emitExpr(node.right, ctx), [
            ...prefix,
            ...this.emitBlock(node.body, ctx),
          ]),
        ];
      }
      case 'BlockStatement':
        return this.emitStatements(node.body, ctx);
      case 'BreakStatement':
        if (node.label) {
          this.fail(node, 'Labels are not supported');
        }
        return [py.breakStatement()];
      case 'ContinueStatement':
        if (node.label) {
          this.fail(node, 'Labels are not supported');
        }
        return [py.continueStatement()];
      case 'EmptyStatement':
      case 'TSInterfaceDeclaration':
      case 'TSTypeAliasDeclaration':
      case 'TSDeclareFunction':
        return [];
      default:
        return this.fail(node, `${node.type} is not supported`);
    }
  }

  private emitIf(node: Node, ctx: Ctx, test: PyNode): PyNode {
    const body = this.emitBlock(node.consequent, ctx);
    const alternate: Node | null = node.alternate;
    if (!alternate) {
      return py.ifStatement(test, body);
    }
    if (alternate.type === 'IfStatement') {
      // A condition that needs statements of its own can only run once the earlier conditions failed.
      const next = this.withPre(() => this.emitExpr(alternate.test, ctx));
      return py.ifStatement(test, body, [...next.pre, this.emitIf(alternate, ctx, next.value)]);
    }
    return py.ifStatement(test, body, this.emitBlock(alternate, ctx));
  }

  /**
   * A loop whose condition needs statements is written as `while True:` with the condition checked inside.
   */
  private emitWhile(
    testNode: Node | null,
    bodyNode: Node,
    ctx: Ctx,
    afterBody: PyNode[] = [],
  ): PyNode[] {
    const test = testNode ? this.withPre(() => this.emitExpr(testNode, ctx)) : null;
    const body = this.emitBlock(bodyNode, ctx);
    if (!test || !test.pre.length) {
      return [py.whileStatement(test ? test.value : py.constant(true), [...body, ...afterBody])];
    }
    return [
      py.whileStatement(py.constant(true), [
        ...test.pre,
        py.ifStatement(py.not(test.value), [py.breakStatement()]),
        ...body,
        ...afterBody,
      ]),
    ];
  }

  /**
   * Writes `target = a ? b : c` (or `return a ? b : c`) as an if statement.
   */
  private emitConditionalStatement(
    node: Node,
    ctx: Ctx,
    assign: (value: PyNode) => PyNode,
  ): PyNode[] {
    return [this.emitConditionalChain(node, this.emitExpr(node.test, ctx), ctx, assign)];
  }

  private emitConditionalChain(
    node: Node,
    test: PyNode,
    ctx: Ctx,
    assign: (value: PyNode) => PyNode,
  ): PyNode {
    const body = this.emitBranch(node.consequent, ctx, assign);
    const alternate = unwrap(node.alternate);
    if (alternate.type === 'ConditionalExpression') {
      const next = this.withPre(() => this.emitExpr(alternate.test, ctx));
      return py.ifStatement(test, body, [
        ...next.pre,
        this.emitConditionalChain(alternate, next.value, ctx, assign),
      ]);
    }
    return py.ifStatement(test, body, this.emitBranch(alternate, ctx, assign));
  }

  private emitBranch(node: Node, ctx: Ctx, assign: (value: PyNode) => PyNode): PyNode[] {
    const value = this.withPre(() => this.emitExpr(node, ctx));
    return [...value.pre, assign(value.value)];
  }

  private containsContinue(body: Node): boolean {
    return someNode(
      body,
      node => node.type === 'ContinueStatement',
      node =>
        node.type === 'ForStatement' ||
        node.type === 'ForOfStatement' ||
        node.type === 'ForInStatement' ||
        node.type === 'WhileStatement' ||
        node.type === 'DoWhileStatement',
    );
  }

  private emitDoWhile(node: Node, ctx: Ctx): PyNode[] {
    if (this.containsContinue(node.body)) {
      this.fail(node, "'continue' inside a do...while loop is not supported");
    }
    const body = this.emitStatement(node.body, ctx);
    const test = this.withPre(() => this.emitExpr(node.test, ctx));
    return [
      py.whileStatement(py.constant(true), [
        ...body,
        ...test.pre,
        py.ifStatement(py.not(test.value), [py.breakStatement()]),
      ]),
    ];
  }

  private assignsTo(body: Node, name: string): boolean {
    return someNode(
      body,
      node =>
        (node.type === 'AssignmentExpression' && patternNames(node.left).includes(name)) ||
        (node.type === 'UpdateExpression' &&
          node.argument.type === 'Identifier' &&
          node.argument.name === name),
    );
  }

  /**
   * Recognises `for (let i = a; i < b; i++)` style loops so they can be written as `for i in range(...)`.
   */
  private tryRange(node: Node, ctx: Ctx): { target: PyNode; iter: PyNode } | null {
    const { init, test, update } = node;
    if (
      init?.type !== 'VariableDeclaration' ||
      init.declarations.length !== 1 ||
      init.declarations[0].id.type !== 'Identifier' ||
      !init.declarations[0].init ||
      test?.type !== 'BinaryExpression' ||
      !update
    ) {
      return null;
    }
    const name: string = init.declarations[0].id.name;
    if (test.left.type !== 'Identifier' || test.left.name !== name) {
      return null;
    }

    let step: number | null = null;
    if (
      update.type === 'UpdateExpression' &&
      update.argument.type === 'Identifier' &&
      update.argument.name === name
    ) {
      step = update.operator === '++' ? 1 : -1;
    } else if (
      update.type === 'AssignmentExpression' &&
      (update.operator === '+=' || update.operator === '-=') &&
      update.left.type === 'Identifier' &&
      update.left.name === name &&
      update.right.type === 'Literal' &&
      typeof update.right.value === 'number' &&
      update.right.value > 0
    ) {
      step = update.operator === '+=' ? update.right.value : -update.right.value;
    }
    if (step === null || this.assignsTo(node.body, name)) {
      return null;
    }
    const ascending = step > 0;
    const operator: string = test.operator;
    if (ascending ? operator !== '<' && operator !== '<=' : operator !== '>' && operator !== '>=') {
      return null;
    }

    const start = this.emitExpr(init.declarations[0].init, ctx);
    const limit = this.emitExpr(test.right, ctx);
    let stop = limit;
    if (operator === '<=' || operator === '>=') {
      const delta = operator === '<=' ? 1 : -1;
      const literal = unwrap(test.right);
      stop =
        literal.type === 'Literal' && typeof literal.value === 'number'
          ? py.constant(literal.value + delta)
          : py.binary(limit, delta > 0 ? 'Add' : 'Sub', py.constant(1));
    }
    const args: PyNode[] = [];
    const startIsZero = start.nodeType === 'Constant' && start.value === 0;
    if (!startIsZero || step !== 1) {
      args.push(start);
    }
    args.push(stop);
    if (step !== 1) {
      args.push(step < 0 ? py.negate(py.constant(-step)) : py.constant(step));
    }
    ctx.locals.set(name, undefined);
    return { target: py.name(pyIdent(name), true), iter: py.call(py.name('range'), args) };
  }

  private emitFor(node: Node, ctx: Ctx): PyNode[] {
    const range = this.tryRange(node, ctx);
    if (range) {
      return [py.forStatement(range.target, range.iter, this.emitBlock(node.body, ctx))];
    }
    if (this.containsContinue(node.body)) {
      this.fail(
        node,
        "'continue' is only supported in for loops of the form `for (let i = a; i < b; i++)`",
      );
    }
    const lines: PyNode[] = [];
    if (node.init) {
      lines.push(
        ...(node.init.type === 'VariableDeclaration'
          ? this.emitStatement(node.init, ctx)
          : this.emitExpressionAsStatement(node.init, ctx)),
      );
    }
    const update = node.update ? this.emitExpressionAsStatement(node.update, ctx) : [];
    lines.push(...this.emitWhile(node.test, node.body, ctx, update));
    return lines;
  }

  /**
   * The variable of a loop. Destructuring patterns loop over a temporary and unpack it at the top of the body.
   */
  private emitLoopTarget(left: Node, ctx: Ctx): { target: PyNode; prefix: PyNode[] } {
    const isAssignment = left.type !== 'VariableDeclaration';
    const target = left.type === 'VariableDeclaration' ? left.declarations[0].id : left;
    if (target.type === 'Identifier') {
      return { target: this.emitTarget(target, ctx, isAssignment), prefix: [] };
    }
    if (target.type === 'ArrayPattern') {
      const temp = this.newTemp();
      return {
        target: py.name(temp, true),
        prefix: this.assignPattern(target, py.name(temp), ctx, isAssignment),
      };
    }
    return this.fail(left, 'Unsupported loop variable');
  }

  private isPure(node: Node): boolean {
    const value = unwrap(node);
    switch (value.type) {
      case 'Identifier':
      case 'Literal':
        return true;
      case 'ChainExpression':
        return this.isPure(value.expression);
      case 'MemberExpression':
        return this.isPure(value.object) && (!value.computed || this.isPure(value.property));
      case 'UnaryExpression':
        return value.operator !== 'delete' && this.isPure(value.argument);
      case 'BinaryExpression':
      case 'LogicalExpression':
        return this.isPure(value.left) && this.isPure(value.right);
      default:
        return false;
    }
  }

  private emitForOf(node: Node, ctx: Ctx): PyNode[] {
    const right = unwrap(node.right);
    const left: Node = node.left;
    const isAssignment = left.type !== 'VariableDeclaration';
    const target = left.type === 'VariableDeclaration' ? left.declarations[0].id : left;

    if (right.type === 'CallExpression') {
      const callee = unwrap(right.callee);
      if (
        callee.type === 'MemberExpression' &&
        !callee.computed &&
        !this.resolveStatic(callee, ctx) &&
        ['keys', 'values', 'entries'].includes(callee.property.name)
      ) {
        const method: string = callee.property.name;
        const kind = this.inferKind(callee.object, ctx);
        if (!kind) {
          this.fail(
            right,
            `Cannot tell whether this is a List, HashSet or Dict. Annotate its type so '${method}()' can be translated`,
          );
        }
        if (kind === 'dict' && method !== 'keys') {
          if (!this.isPure(callee.object)) {
            this.fail(
              right,
              `Store the dictionary in a variable before looping over its ${method}()`,
            );
          }
          const dict = this.emitExpr(callee.object, ctx);
          if (method === 'values') {
            this.keyCount += 1;
            const key = py.name(`_key_${this.keyCount}`);
            return [
              py.forStatement(py.toStore(key), dict, [
                ...this.assignPattern(target, py.subscript(dict, key), ctx, isAssignment),
                ...this.emitBlock(node.body, ctx),
              ]),
            ];
          }
          if (
            target.type !== 'ArrayPattern' ||
            target.elements.length !== 2 ||
            target.elements.some((element: Node | null) => element?.type !== 'Identifier')
          ) {
            this.fail(left, 'Loop over entries() with a pattern of the form [key, value]');
          }
          const keyTarget = this.emitTarget(target.elements[0], ctx, isAssignment);
          const valueTarget = this.emitTarget(target.elements[1], ctx, isAssignment);
          return [
            py.forStatement(keyTarget, dict, [
              py.assign(valueTarget, py.subscript(dict, py.name(keyTarget.id))),
              ...this.emitBlock(node.body, ctx),
            ]),
          ];
        }
        // keys() of a dict, or values() of a list or set, are just the iteration order of the collection.
        if (method !== 'entries') {
          const loop = this.emitLoopTarget(left, ctx);
          return [
            py.forStatement(loop.target, this.emitExpr(callee.object, ctx), [
              ...loop.prefix,
              ...this.emitBlock(node.body, ctx),
            ]),
          ];
        }
      }
    }
    const loop = this.emitLoopTarget(left, ctx);
    return [
      py.forStatement(loop.target, this.emitExpr(node.right, ctx), [
        ...loop.prefix,
        ...this.emitBlock(node.body, ctx),
      ]),
    ];
  }

  private emitVariableDeclaration(node: Node, ctx: Ctx): PyNode[] {
    if (node.declare) {
      return [];
    }
    const lines: PyNode[] = [];
    for (const declarator of node.declarations as Node[]) {
      const id: Node = declarator.id;
      if (id.type === 'Identifier' && isFunctionValue(declarator.init)) {
        this.fail(declarator, 'Function values can only be declared at the top level');
      }
      if (id.type === 'Identifier') {
        const kind = kindFromType(id.typeAnnotation) ?? this.inferKind(declarator.init, ctx);
        const init = declarator.init ? unwrap(declarator.init) : null;
        const target = this.emitTarget(id, ctx, false);
        if (init?.type === 'ConditionalExpression') {
          lines.push(
            ...this.emitConditionalStatement(init, ctx, value => py.assign(target, value)),
          );
        } else {
          lines.push(py.assign(target, init ? this.emitExpr(init, ctx) : py.none()));
        }
        if (ctx.locals.has(id.name)) {
          ctx.locals.set(id.name, kind);
        }
      } else if (id.type === 'ArrayPattern') {
        if (!declarator.init) {
          this.fail(declarator, 'A destructuring declaration needs a value');
        }
        lines.push(...this.emitDestructure(id, declarator.init, ctx, false));
      } else {
        this.fail(declarator, 'Object destructuring is not supported');
      }
    }
    return lines;
  }

  /**
   * Assigns `value` to a pattern by indexing it. Only single assignments are used, because the game's
   * support for unpacking tuples isn't known.
   */
  private assignPattern(pattern: Node, value: PyNode, ctx: Ctx, isAssignment: boolean): PyNode[] {
    if (pattern.type === 'ArrayPattern') {
      return (pattern.elements as (Node | null)[]).flatMap((element, index) => {
        if (!element) {
          return [];
        }
        if (element.type === 'RestElement' || element.type === 'AssignmentPattern') {
          return this.fail(element, 'Rest and default values in patterns are not supported');
        }
        return this.assignPattern(
          element,
          py.subscript(value, py.constant(index)),
          ctx,
          isAssignment,
        );
      });
    }
    return [py.assign(this.emitTarget(pattern, ctx, isAssignment), value)];
  }

  private emitDestructure(
    pattern: Node,
    valueNode: Node,
    ctx: Ctx,
    isAssignment: boolean,
  ): PyNode[] {
    const init = unwrap(valueNode);
    const targets = new Set(patternNames(pattern));
    const mentionsTarget = (node: Node) =>
      someNode(node, child => child.type === 'Identifier' && targets.has(child.name));

    if (
      init.type === 'ArrayExpression' &&
      init.elements.length === pattern.elements.length &&
      !init.elements.some((element: Node | null) => !element || element.type === 'SpreadElement')
    ) {
      const values = (init.elements as Node[]).map(element => this.emitExpr(element, ctx));
      const lines: PyNode[] = [];
      // `[a, b] = [b, a]` needs the values to be captured before anything is assigned.
      const capture = init.elements.some(mentionsTarget);
      const sources = capture
        ? values.map(value => {
            const temp = this.newTemp();
            lines.push(py.assign(py.name(temp, true), value));
            return py.name(temp);
          })
        : values;
      (pattern.elements as (Node | null)[]).forEach((element, index) => {
        if (!element) {
          lines.push(py.expression(sources[index]));
        } else {
          lines.push(...this.assignPattern(element, sources[index], ctx, isAssignment));
        }
      });
      return lines;
    }

    const value = this.emitExpr(init, ctx);
    const lines: PyNode[] = [];
    let source = value;
    if (init.type !== 'Identifier' || targets.has(init.name)) {
      const temp = this.newTemp();
      lines.push(py.assign(py.name(temp, true), value));
      source = py.name(temp);
    }
    return [...lines, ...this.assignPattern(pattern, source, ctx, isAssignment)];
  }

  /**
   * Emits something that can be assigned to.
   */
  private emitTarget(node: Node, ctx: Ctx, isAssignment: boolean): PyNode {
    switch (node.type) {
      case 'Identifier': {
        const binding = this.resolveIdent(node.name, ctx, node);
        if (isAssignment) {
          if (binding?.type === 'variable') {
            if (!ctx.isModule) {
              ctx.globals.add(binding.name);
            }
          } else if (binding?.type !== 'local') {
            this.fail(node, `Cannot assign to '${node.name}'`);
          }
        }
        const id =
          binding?.type === 'variable' || binding?.type === 'local'
            ? binding.name
            : pyIdent(node.name);
        return py.name(id, true);
      }
      case 'MemberExpression': {
        if (this.resolveStatic(node, ctx)) {
          this.fail(node, 'Cannot assign to an imported value');
        }
        if (!node.computed && (node.property.name === 'length' || node.property.name === 'size')) {
          this.fail(node, `Cannot assign to '${node.property.name}'`);
        }
        return py.toStore(this.emitMember(node, ctx));
      }
      default:
        return this.fail(node, `Cannot assign to a ${node.type}`);
    }
  }

  private emitExpressionStatement(expression: Node, ctx: Ctx): PyNode[] {
    const node = unwrap(expression);
    switch (node.type) {
      case 'Literal':
        return typeof node.value === 'string'
          ? []
          : this.fail(node, 'This expression has no effect');
      case 'AssignmentExpression': {
        const operator = ASSIGN_OPERATORS[node.operator];
        if (!operator) {
          this.fail(node, `The '${node.operator}' operator is not supported`);
        }
        if (unwrap(node.right).type === 'AssignmentExpression') {
          this.fail(node, 'Chained assignments are not supported');
        }
        if (node.operator === '=' && node.left.type === 'ArrayPattern') {
          return this.emitDestructure(node.left, node.right, ctx, true);
        }
        const target = this.emitTarget(node.left, ctx, true);
        const right = unwrap(node.right);
        if (node.operator === '=' && right.type === 'ConditionalExpression') {
          return this.emitConditionalStatement(right, ctx, value => py.assign(target, value));
        }
        const value = this.emitExpr(right, ctx);
        return [
          operator === '=' ? py.assign(target, value) : py.augAssign(target, operator, value),
        ];
      }
      case 'UpdateExpression': {
        const target = this.emitTarget(node.argument, ctx, true);
        return [py.augAssign(target, node.operator === '++' ? 'Add' : 'Sub', py.constant(1))];
      }
      case 'CallExpression':
      case 'ChainExpression': {
        const value = this.emitExpr(node, ctx);
        // A chain that was lowered to statements leaves nothing else to do.
        return value.nodeType === 'Name' ? [] : [py.expression(value)];
      }
      case 'UnaryExpression':
        if (node.operator === 'delete') {
          const target = unwrap(node.argument);
          if (target.type !== 'MemberExpression') {
            this.fail(node, 'Only properties can be deleted');
          }
          const key = target.computed
            ? this.emitExpr(target.property, ctx)
            : py.constant(target.property.name);
          return [
            py.expression(py.call(py.attribute(this.emitExpr(target.object, ctx), 'pop'), [key])),
          ];
        }
        return this.fail(node, 'This expression has no effect');
      default:
        return this.fail(node, `${node.type} cannot be used as a statement`);
    }
  }

  // ---------------------------------------------------------------------------
  // Expressions
  // ---------------------------------------------------------------------------

  private emitLiteral(node: Node): PyNode {
    if (node.regex) {
      this.fail(node, 'Regular expressions are not supported');
    }
    if (node.bigint !== undefined) {
      this.fail(node, 'BigInt is not supported');
    }
    return py.constant(node.value);
  }

  emitExpr(node: Node, ctx: Ctx): PyNode {
    const value = unwrap(node);
    switch (value.type) {
      case 'Literal':
        return this.emitLiteral(value);
      case 'Identifier': {
        if (value.name === 'undefined') {
          return py.none();
        }
        const binding = this.resolveIdent(value.name, ctx, value);
        if (!binding) {
          return this.fail(value, `'${value.name}' is not defined or not supported`);
        }
        return this.emitBinding(binding, value);
      }
      case 'TemplateLiteral':
        return this.emitTemplate(value, ctx);
      case 'ArrayExpression':
        return py.list((value.elements as (Node | null)[]).map(e => this.emitElement(e, ctx)));
      case 'ObjectExpression':
        return this.emitObject(value, ctx);
      case 'UnaryExpression':
        return this.emitUnary(value, ctx);
      case 'BinaryExpression':
        return this.emitBinary(value, ctx);
      case 'LogicalExpression':
        return this.emitLogical(value, ctx);
      case 'ConditionalExpression': {
        const temp = this.newTemp();
        this.pre.push(
          ...this.emitConditionalStatement(value, ctx, result =>
            py.assign(py.name(temp, true), result),
          ),
        );
        return py.name(temp);
      }
      case 'CallExpression':
        return this.emitCall(value, ctx);
      case 'NewExpression':
        return this.emitNew(value, ctx);
      case 'MemberExpression':
        return this.emitMember(value, ctx);
      case 'ChainExpression': {
        const previous = this.guards;
        this.guards = [];
        const inner = this.withPre(() => this.emitExpr(value.expression, ctx));
        const guards = this.guards;
        this.guards = previous;
        if (!guards.length) {
          this.pre.push(...inner.pre);
          return inner.value;
        }
        const temp = this.newTemp();
        const test = guards.reduce((all, guard) => py.boolOp('And', all, guard));
        this.pre.push(
          py.assign(py.name(temp, true), py.none()),
          py.ifStatement(test, [...inner.pre, py.assign(py.name(temp, true), inner.value)]),
        );
        return py.name(temp);
      }
      case 'ArrowFunctionExpression':
      case 'FunctionExpression':
        return this.hoistArrow(value, ctx);
      case 'AssignmentExpression':
      case 'UpdateExpression':
        return this.fail(value, 'Assignments can only be used as statements');
      default:
        return this.fail(value, `${value.type} is not supported`);
    }
  }

  private emitElement(element: Node | null, ctx: Ctx): PyNode {
    if (!element) {
      return this.fail(this.program, 'Array holes are not supported');
    }
    if (element.type === 'SpreadElement') {
      return this.fail(element, 'Spread is not supported in array literals');
    }
    return this.emitExpr(element, ctx);
  }

  private emitTemplate(node: Node, ctx: Ctx): PyNode {
    const parts: PyNode[] = [];
    (node.quasis as Node[]).forEach((quasi, index) => {
      if (quasi.value.cooked) {
        parts.push(py.constant(quasi.value.cooked));
      }
      const expression: Node | undefined = node.expressions[index];
      if (expression) {
        parts.push(py.call(py.name('str'), [this.emitExpr(expression, ctx)]));
      }
    });
    if (!parts.length) {
      return py.constant('');
    }
    return parts.reduce((all, part) => py.binary(all, 'Add', part));
  }

  private emitObject(node: Node, ctx: Ctx): PyNode {
    const keys: PyNode[] = [];
    const values: PyNode[] = [];
    for (const property of node.properties as Node[]) {
      if (property.type !== 'Property' || property.kind !== 'init' || property.method) {
        this.fail(property, 'Only plain key: value properties are supported in objects');
      }
      if (property.computed) {
        keys.push(this.emitExpr(property.key, ctx));
      } else if (property.key.type === 'Identifier') {
        keys.push(py.constant(property.key.name));
      } else {
        keys.push(this.emitLiteral(property.key));
      }
      values.push(this.emitExpr(property.value, ctx));
    }
    return py.dict(keys, values);
  }

  private emitUnary(node: Node, ctx: Ctx): PyNode {
    const argument = unwrap(node.argument);
    switch (node.operator) {
      case '!':
        if (argument.type === 'BinaryExpression' && argument.operator === 'in') {
          return py.compare(
            this.emitExpr(argument.left, ctx),
            'NotIn',
            this.emitExpr(argument.right, ctx),
          );
        }
        return py.not(this.emitExpr(argument, ctx));
      case '-':
        return py.negate(this.emitExpr(argument, ctx));
      case '+':
        return this.emitExpr(argument, ctx);
      default:
        return this.fail(node, `The '${node.operator}' operator is not supported`);
    }
  }

  private emitBinary(node: Node, ctx: Ctx): PyNode {
    const operator: string = node.operator;
    const left = this.emitExpr(node.left, ctx);
    const right = this.emitExpr(node.right, ctx);
    const comparison = COMPARE_OPERATORS[operator];
    if (comparison) {
      return py.compare(left, comparison, right);
    }
    const arithmetic = ARITHMETIC_OPERATORS[operator];
    if (arithmetic) {
      return py.binary(left, arithmetic, right);
    }
    return this.fail(node, `The '${operator}' operator is not supported`);
  }

  private emitLogical(node: Node, ctx: Ctx): PyNode {
    const left = this.emitExpr(node.left, ctx);
    const right = this.withPre(() => this.emitExpr(node.right, ctx));

    if (node.operator === '??') {
      const temp = this.newTemp();
      this.pre.push(
        py.assign(py.name(temp, true), left),
        py.ifStatement(py.compare(py.name(temp), 'Eq', py.none()), [
          ...right.pre,
          py.assign(py.name(temp, true), right.value),
        ]),
      );
      return py.name(temp);
    }

    const isAnd = node.operator === '&&';
    if (right.pre.length) {
      // The right side has to be skipped when the left side decides the result.
      const temp = this.newTemp();
      this.pre.push(
        py.assign(py.name(temp, true), left),
        py.ifStatement(isAnd ? py.name(temp) : py.not(py.name(temp)), [
          ...right.pre,
          py.assign(py.name(temp, true), right.value),
        ]),
      );
      return py.name(temp);
    }
    return py.boolOp(isAnd ? 'And' : 'Or', left, right.value);
  }

  private emitArguments(args: Node[], ctx: Ctx): PyNode[] {
    return args.map(arg =>
      arg.type === 'SpreadElement'
        ? py.starred(this.emitExpr(arg.argument, ctx))
        : this.emitExpr(arg, ctx),
    );
  }

  private emitNew(node: Node, ctx: Ctx): PyNode {
    const callee = this.resolveStatic(node.callee, ctx);
    if (callee?.type !== 'farmerClass') {
      return this.fail(node, 'Only List, HashSet and Dict can be constructed');
    }
    const args = node.arguments as Node[];
    const first = args[0] ? unwrap(args[0]) : null;
    if (args.length > 1) {
      this.fail(node, `${callee.name} takes at most one argument`);
    }
    switch (callee.name) {
      case 'List':
        if (!first) {
          return py.list([]);
        }
        return first.type === 'ArrayExpression'
          ? this.emitExpr(first, ctx)
          : py.call(py.name('list'), [this.emitExpr(first, ctx)]);
      case 'HashSet':
        if (!first || (first.type === 'ArrayExpression' && first.elements.length === 0)) {
          return py.call(py.name('set'));
        }
        if (first.type === 'ArrayExpression') {
          return py.set((first.elements as (Node | null)[]).map(e => this.emitElement(e, ctx)));
        }
        return py.call(py.name('set'), [this.emitExpr(first, ctx)]);
      default:
        if (!first) {
          return py.dict([], []);
        }
        return first.type === 'ObjectExpression'
          ? this.emitExpr(first, ctx)
          : py.call(py.name('dict'), [this.emitExpr(first, ctx)]);
    }
  }

  private emitMember(node: Node, ctx: Ctx): PyNode {
    const binding = this.resolveStatic(node, ctx);
    if (binding) {
      return this.emitBinding(binding, node);
    }
    if (!node.computed) {
      const objectBinding = this.resolveStatic(node.object, ctx);
      if (objectBinding?.type === 'farmerEnum') {
        const member: string = node.property.name;
        return objectBinding.name === 'Direction'
          ? py.name(member)
          : py.attribute(py.name(objectBinding.name), member);
      }
    }
    const object = this.emitObjectOf(node, ctx);
    if (!node.computed) {
      const name: string = node.property.name;
      if (name === 'length' || name === 'size') {
        return py.call(py.name('len'), [object]);
      }
      return py.subscript(object, py.constant(name));
    }
    return py.subscript(object, this.emitExpr(node.property, ctx));
  }

  /**
   * Emits the object of a member access, recording a guard when the access is optional (`a?.b`).
   */
  private emitObjectOf(node: Node, ctx: Ctx): PyNode {
    const object = this.emitExpr(node.object, ctx);
    if (node.optional) {
      if (!this.isPure(node.object) || !this.guards) {
        this.fail(node, 'Store this value in a variable first. `?.` needs to read it twice');
      }
      this.guards.push(py.compare(object, 'NotEq', py.none()));
    }
    return object;
  }

  private emitCall(node: Node, ctx: Ctx): PyNode {
    const callee = unwrap(node.callee);
    const args = node.arguments as Node[];
    if (node.optional) {
      this.fail(node, 'Optional calls are not supported');
    }

    const binding = this.resolveStatic(callee, ctx);
    if (binding) {
      if (binding.type === 'farmerClass' || binding.type === 'farmerEnum') {
        return this.fail(node, 'This cannot be called');
      }
      return py.call(this.emitBinding(binding, callee), this.emitArguments(args, ctx));
    }

    if (callee.type === 'Identifier') {
      if (callee.name === 'String' && args.length === 1) {
        return py.call(py.name('str'), [this.emitExpr(args[0], ctx)]);
      }
      return this.fail(callee, `'${callee.name}' is not defined or not supported`);
    }

    if (callee.type === 'MemberExpression' && !callee.computed) {
      if (
        callee.object.type === 'Identifier' &&
        callee.object.name === 'Math' &&
        !this.resolveIdent('Math', ctx, callee)
      ) {
        return this.emitMath(node, callee.property.name, ctx);
      }
      return this.emitMethodCall(node, callee, ctx);
    }
    return this.fail(node, 'Only named functions can be called');
  }

  private emitMath(node: Node, name: string, ctx: Ctx): PyNode {
    const args = node.arguments as Node[];
    switch (name) {
      case 'floor': {
        const value = unwrap(args[0]);
        if (value.type === 'BinaryExpression' && value.operator === '/') {
          return py.binary(
            this.emitExpr(value.left, ctx),
            'FloorDiv',
            this.emitExpr(value.right, ctx),
          );
        }
        return py.binary(this.emitExpr(args[0], ctx), 'FloorDiv', py.constant(1));
      }
      case 'abs':
      case 'min':
      case 'max':
        return py.call(py.name(name), this.emitArguments(args, ctx));
      case 'random':
        return py.call(py.name('random'));
      default:
        return this.fail(node, `Math.${name} is not supported`);
    }
  }

  private emitMethodCall(node: Node, callee: Node, ctx: Ctx): PyNode {
    const name: string = callee.property.name;
    const args = node.arguments as Node[];
    const expectArgs = (min: number, max: number) => {
      if (args.length < min || args.length > max) {
        this.fail(node, `${name}() expects ${min === max ? min : `${min} to ${max}`} argument(s)`);
      }
    };
    const receiver = this.emitObjectOf(callee, ctx);
    const values = this.emitArguments(args, ctx);
    const method = (pythonName: string): PyNode =>
      py.call(py.attribute(receiver, pythonName), values);

    switch (name) {
      case 'push':
        expectArgs(1, 1);
        return method('append');
      case 'insert':
        expectArgs(2, 2);
        return method('insert');
      case 'pop':
        expectArgs(0, 1);
        return method('pop');
      case 'remove':
        expectArgs(1, 1);
        return method('remove');
      case 'add':
        expectArgs(1, 1);
        return method('add');
      case 'delete':
        expectArgs(1, 1);
        return method('remove');
      case 'has':
        expectArgs(1, 1);
        return py.compare(values[0], 'In', receiver);
      case 'get': {
        expectArgs(1, 1);
        const key = this.newTemp();
        const found = this.newTemp();
        this.pre.push(
          py.assign(py.name(key, true), values[0]),
          py.assign(py.name(found, true), py.none()),
          py.ifStatement(py.compare(py.name(key), 'In', receiver), [
            py.assign(py.name(found, true), py.name(key)),
          ]),
        );
        return py.name(found);
      }
      case 'keys':
      case 'values':
      case 'entries': {
        expectArgs(0, 0);
        const kind = this.inferKind(callee.object, ctx);
        if (!kind) {
          this.fail(
            node,
            `Cannot tell whether this is a List, HashSet or Dict. Annotate its type so '${name}()' can be translated`,
          );
        }
        if ((name === 'keys' && kind === 'dict') || (name === 'values' && kind !== 'dict')) {
          return py.call(py.name('list'), [receiver]);
        }
        return this.fail(
          node,
          `'${name}()' on a ${kind === 'dict' ? 'Dict' : 'List or HashSet'} can only be used as the subject of a for...of loop`,
        );
      }
      default:
        return this.fail(node, `The method '${name}' is not supported`);
    }
  }
}

export function transpileProject(files: SourceFile[], farmer: FarmerInfo): TranspileResult {
  const errors: TranspileError[] = [];
  const parsed = new Map<string, { file: SourceFile; program: Node }>();

  for (const file of files) {
    const result = parseSync(file.path, file.source, {
      lang: 'ts',
      sourceType: 'module',
      preserveParens: false,
    });
    if (result.errors.length) {
      const [error] = result.errors;
      const { line, column } = locate(file.source, error.labels[0]?.start ?? 0);
      errors.push(new TranspileError(error.message, file.path, line, column));
      continue;
    }
    parsed.set(file.name, { file, program: result.program as unknown as Node });
  }

  const modules = new Map<string, ModuleInfo>();
  for (const [name, { program }] of parsed) {
    modules.set(name, { decls: collectDeclarations(program) });
  }

  const outputs: OutputFile[] = [];
  for (const [name, { file, program }] of parsed) {
    try {
      outputs.push({
        name,
        code: py.printModule(new FileTranspiler(file, program, modules, farmer).transpile()),
      });
    } catch (error) {
      if (error instanceof TranspileError) {
        errors.push(error);
      } else {
        throw error;
      }
    }
  }
  return { outputs, errors };
}
