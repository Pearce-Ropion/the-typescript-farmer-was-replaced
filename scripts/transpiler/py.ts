import { unparse } from 'py-ast';

/**
 * A node of the Python AST that the transpiler builds and `py-ast` prints.
 * The nodes follow the shapes of `py-ast`, which mirror CPython's `ast` module.
 */
// oxlint-disable-next-line typescript/no-explicit-any
export type PyNode = { nodeType: string; lineno: number; col_offset: number; [key: string]: any };

function node(nodeType: string, fields: Record<string, unknown> = {}): PyNode {
  return { nodeType, lineno: 1, col_offset: 0, ...fields };
}

// ---------------------------------------------------------------------------
// Operators
// ---------------------------------------------------------------------------

export type ArithmeticOperator = 'Add' | 'Sub' | 'Mult' | 'Div' | 'Mod' | 'Pow' | 'FloorDiv';
export type CompareOperator = 'Eq' | 'NotEq' | 'Lt' | 'LtE' | 'Gt' | 'GtE' | 'In' | 'NotIn';

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------

export const name = (id: string, store = false): PyNode =>
  node('Name', { id, ctx: node(store ? 'Store' : 'Load') });

export const constant = (value: string | number | boolean | null): PyNode =>
  node('Constant', { value });

export const none = (): PyNode => constant(null);

export const attribute = (value: PyNode, attr: string, store = false): PyNode =>
  node('Attribute', { value, attr, ctx: node(store ? 'Store' : 'Load') });

export const subscript = (value: PyNode, slice: PyNode, store = false): PyNode =>
  node('Subscript', { value, slice, ctx: node(store ? 'Store' : 'Load') });

export const call = (func: PyNode, args: PyNode[] = []): PyNode =>
  node('Call', { func, args, keywords: [] });

export const starred = (value: PyNode): PyNode => node('Starred', { value, ctx: node('Load') });

export const binary = (left: PyNode, op: ArithmeticOperator, right: PyNode): PyNode =>
  node('BinOp', { left, op: node(op), right });

export const compare = (left: PyNode, op: CompareOperator, right: PyNode): PyNode =>
  node('Compare', { left, ops: [node(op)], comparators: [right] });

export const not = (operand: PyNode): PyNode => node('UnaryOp', { op: node('Not'), operand });

export const negate = (operand: PyNode): PyNode => node('UnaryOp', { op: node('USub'), operand });

/**
 * `a and b`, or `a or b`. Chains of the same operator are flattened into one node.
 */
export const boolOp = (op: 'And' | 'Or', left: PyNode, right: PyNode): PyNode => {
  const values = left.nodeType === 'BoolOp' && left.op.nodeType === op ? [...left.values] : [left];
  values.push(right);
  return node('BoolOp', { op: node(op), values });
};

export const list = (elts: PyNode[]): PyNode => node('List', { elts, ctx: node('Load') });

export const set = (elts: PyNode[]): PyNode => node('Set', { elts });

export const tuple = (elts: PyNode[], store = false): PyNode =>
  node('Tuple', { elts, ctx: node(store ? 'Store' : 'Load') });

export const dict = (keys: PyNode[], values: PyNode[]): PyNode => node('Dict', { keys, values });

/**
 * Returns a copy of an expression that can be assigned to.
 */
export function toStore(target: PyNode): PyNode {
  return { ...target, ctx: node('Store') };
}

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

export const expression = (value: PyNode): PyNode => node('Expr', { value });

export const assign = (target: PyNode, value: PyNode): PyNode =>
  node('Assign', { targets: [target], value });

export const augAssign = (target: PyNode, op: ArithmeticOperator, value: PyNode): PyNode =>
  node('AugAssign', { target, op: node(op), value });

export const returnStatement = (value?: PyNode): PyNode => node('Return', { value });

export const ifStatement = (test: PyNode, body: PyNode[], orelse: PyNode[] = []): PyNode =>
  node('If', { test, body, orelse });

export const whileStatement = (test: PyNode, body: PyNode[]): PyNode =>
  node('While', { test, body, orelse: [] });

export const forStatement = (target: PyNode, iter: PyNode, body: PyNode[]): PyNode =>
  node('For', { target, iter, body, orelse: [] });

export const breakStatement = (): PyNode => node('Break');
export const continueStatement = (): PyNode => node('Continue');
export const pass = (): PyNode => node('Pass');

export const globalStatement = (names: string[]): PyNode => node('Global', { names });

export const importStatement = (module: string): PyNode =>
  node('Import', { names: [node('Alias', { name: module })] });

export interface Parameter {
  name: string;
  /** The default value, if the parameter has one. */
  fallback?: PyNode;
}

export function functionDef(
  functionName: string,
  params: Parameter[],
  rest: string | null,
  body: PyNode[],
): PyNode {
  return node('FunctionDef', {
    name: functionName,
    args: node('Arguments', {
      posonlyargs: [],
      args: params.map(param => node('Arg', { arg: param.name })),
      vararg: rest ? node('Arg', { arg: rest }) : undefined,
      kwonlyargs: [],
      kw_defaults: [],
      defaults: params.flatMap(param => (param.fallback ? [param.fallback] : [])),
    }),
    body,
    decorator_list: [],
    type_params: [],
  });
}

export const moduleNode = (body: PyNode[]): PyNode => node('Module', { body, type_ignores: [] });

// ---------------------------------------------------------------------------
// Checking and printing
// ---------------------------------------------------------------------------

/**
 * The only Python constructs the game understands. Everything the transpiler builds is checked against
 * this list, so an unsupported construct (a conditional expression, a lambda, a comprehension...)
 * can never reach the generated code.
 */
const SUPPORTED_NODES = new Set([
  'Module',
  'FunctionDef',
  'Arguments',
  'Arg',
  'Return',
  'Assign',
  'AugAssign',
  'Global',
  'Import',
  'Alias',
  'If',
  'While',
  'For',
  'Break',
  'Continue',
  'Pass',
  'Expr',
  'Name',
  'Constant',
  'BinOp',
  'UnaryOp',
  'BoolOp',
  'Compare',
  'Call',
  'Attribute',
  'Subscript',
  'List',
  'Tuple',
  'Dict',
  'Set',
  'Starred',
  // Operators and contexts
  'Load',
  'Store',
  'Add',
  'Sub',
  'Mult',
  'Div',
  'Mod',
  'Pow',
  'FloorDiv',
  'Not',
  'USub',
  'And',
  'Or',
  'Eq',
  'NotEq',
  'Lt',
  'LtE',
  'Gt',
  'GtE',
  'In',
  'NotIn',
]);

function isPyNode(value: unknown): value is PyNode {
  return typeof value === 'object' && value !== null && 'nodeType' in value;
}

export function assertSupported(root: PyNode): void {
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isPyNode(value)) {
      return;
    }
    if (!SUPPORTED_NODES.has(value.nodeType)) {
      throw new Error(
        `The transpiler produced a ${value.nodeType}, which the game doesn't support`,
      );
    }
    if (value.nodeType === 'Constant' && value.value !== null) {
      const type = typeof value.value;
      if (type !== 'string' && type !== 'number' && type !== 'boolean') {
        throw new Error(`The transpiler produced a ${type} constant`);
      }
    }
    Object.values(value).forEach(visit);
  };
  visit(root);
}

const HEADER = '# Generated from TypeScript. Do not edit; edit the source and rebuild.';

export { HEADER as GENERATED_HEADER };

/**
 * Prints a module. Each top level statement is printed on its own so definitions can be separated by blank lines.
 */
export function printModule(module: PyNode): string {
  assertSupported(module);
  const statements = module.body as PyNode[];
  if (!statements.length) {
    return `${HEADER}\n`;
  }
  let out = `${HEADER}\n`;
  statements.forEach((statement, index) => {
    const previous = statements[index - 1];
    if (previous) {
      const bothImports = previous.nodeType === 'Import' && statement.nodeType === 'Import';
      const definition =
        previous.nodeType === 'FunctionDef' || statement.nodeType === 'FunctionDef';
      out += bothImports
        ? '\n'
        : definition
          ? '\n\n\n'
          : previous.nodeType === 'Import'
            ? '\n\n'
            : '\n';
    } else {
      out += '\n';
    }
    out += unparse(statement as never);
  });
  return `${out}\n`;
}
