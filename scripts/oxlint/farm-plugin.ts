import { ALLOWED_MEMBERS } from '../transpiler/collections.ts';
import type { CollectionKind } from '../transpiler/collections.ts';

// The AST and the rule context come from oxlint, which doesn't export types for JS plugins.
// oxlint-disable-next-line typescript/no-explicit-any
type Node = { type: string; [key: string]: any };
// oxlint-disable-next-line typescript/no-explicit-any
type Context = any;

interface Options {
  array?: string[];
  set?: string[];
  object?: string[];
  statics?: string[];
}

const WRAPPERS = new Set([
  'ParenthesizedExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
]);

const UNSUPPORTED_COLLECTIONS = new Set(['Map', 'WeakMap', 'WeakSet']);
const STATIC_OBJECTS = new Set(['Object', 'Array']);

function unwrap(node: Node): Node {
  let current = node;
  while (WRAPPERS.has(current.type)) {
    current = current.expression;
  }
  return current;
}

/**
 * `splice` maps onto the game's `insert(index, value)` and `pop(index)`, so only those two forms can be translated.
 */
function isSupportedSplice(args: Node[]): boolean {
  const removed = args[1];
  const removesCount = (count: number) => removed?.type === 'Literal' && removed.value === count;
  if (args.some(arg => arg.type === 'SpreadElement')) {
    return false;
  }
  return (args.length === 3 && removesCount(0)) || (args.length === 2 && removesCount(1));
}

const rule = {
  meta: {
    type: 'problem' as const,
    docs: {
      description:
        "Reports members of arrays, sets and objects that can't be translated to the game's Python.",
    },
    messages: {
      member:
        "'{{name}}' is not supported on {{kind}} in the game's Python. Supported: {{allowed}}.",
      call: "Objects become dictionaries in the game's Python, which have no methods, so '{{name}}()' can't be called.",
      splice:
        "Only splice(index, 0, value) and splice(index, 1) are supported in the game's Python.",
      static: "'{{name}}' is not supported in the game's Python. Supported: {{allowed}}.",
      collection: "'{{name}}' is not supported in the game's Python. Use {{alternative}} instead.",
    },
    schema: [
      {
        type: 'object',
        properties: {
          array: { type: 'array', items: { type: 'string' } },
          set: { type: 'array', items: { type: 'string' } },
          object: { type: 'array', items: { type: 'string' } },
          statics: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context: Context) {
    const options: Options = context.options[0] ?? {};
    const allowed: Record<CollectionKind | 'statics', string[]> = {
      array: options.array ?? ALLOWED_MEMBERS.array,
      set: options.set ?? ALLOWED_MEMBERS.set,
      object: options.object ?? ALLOWED_MEMBERS.object,
      statics: options.statics ?? ALLOWED_MEMBERS.statics,
    };
    const list = (names: string[]) => (names.length ? names.join(', ') : 'nothing');

    // Type declarations of this file, so annotations like `WorldItem` can be recognised.
    const interfaces = new Set<string>();
    const aliases = new Map<string, Node>();
    const kinds = new WeakMap<Node, CollectionKind | null>();
    const resolving = new Set<Node>();

    const findVariable = (identifier: Node) => {
      let scope = context.sourceCode.getScope(identifier);
      while (scope) {
        const variable = scope.set.get(identifier.name);
        if (variable) {
          return variable;
        }
        scope = scope.upper;
      }
      return null;
    };

    const kindFromType = (type: Node | null | undefined): CollectionKind | undefined => {
      if (!type) {
        return undefined;
      }
      const node = type.type === 'TSTypeAnnotation' ? type.typeAnnotation : type;
      switch (node.type) {
        case 'TSArrayType':
        case 'TSTupleType':
          return 'array';
        case 'TSTypeLiteral':
          return 'object';
        case 'TSTypeOperator':
          return kindFromType(node.typeAnnotation);
        case 'TSUnionType':
          for (const member of node.types) {
            const kind = kindFromType(member);
            if (kind) {
              return kind;
            }
          }
          return undefined;
        case 'TSTypeReference': {
          if (node.typeName.type !== 'Identifier') {
            return undefined;
          }
          const name: string = node.typeName.name;
          if (name === 'Array' || name === 'ReadonlyArray') {
            return 'array';
          }
          if (name === 'Set' || name === 'ReadonlySet') {
            return 'set';
          }
          if (name === 'Record') {
            return 'object';
          }
          if (name === 'Partial' || name === 'Readonly' || name === 'Required') {
            return kindFromType(node.typeArguments?.params?.[0]);
          }
          if (interfaces.has(name)) {
            return 'object';
          }
          return kindFromType(aliases.get(name));
        }
        default:
          return undefined;
      }
    };

    const kindOfExpression = (expression: Node | null | undefined): CollectionKind | undefined => {
      if (!expression) {
        return undefined;
      }
      const node = unwrap(expression);
      switch (node.type) {
        case 'ArrayExpression':
          return 'array';
        case 'ObjectExpression':
          return 'object';
        case 'ChainExpression':
          return kindOfExpression(node.expression);
        case 'NewExpression':
          if (node.callee.type === 'Identifier') {
            if (node.callee.name === 'Set') {
              return 'set';
            }
            if (node.callee.name === 'Array') {
              return 'array';
            }
          }
          return undefined;
        case 'Identifier':
          return kindOfVariable(node);
        case 'CallExpression': {
          const callee = unwrap(node.callee);
          if (callee.type === 'Identifier') {
            return kindOfReturn(callee);
          }
          if (
            callee.type === 'MemberExpression' &&
            callee.object.type === 'Identifier' &&
            callee.object.name === 'Object' &&
            !callee.computed
          ) {
            return 'array';
          }
          return undefined;
        }
        default:
          return undefined;
      }
    };

    const kindOfReturn = (identifier: Node): CollectionKind | undefined => {
      const definition = findVariable(identifier)?.defs?.[0];
      if (!definition) {
        return undefined;
      }
      if (definition.node.type === 'FunctionDeclaration') {
        return kindFromType(definition.node.returnType);
      }
      const init = definition.node.init && unwrap(definition.node.init);
      if (init?.type === 'ArrowFunctionExpression' || init?.type === 'FunctionExpression') {
        return kindFromType(init.returnType);
      }
      return undefined;
    };

    const kindOfVariable = (identifier: Node): CollectionKind | undefined => {
      const definition = findVariable(identifier)?.defs?.[0];
      if (!definition) {
        return undefined;
      }
      const key: Node = definition.name;
      if (kinds.has(key)) {
        return kinds.get(key) ?? undefined;
      }
      if (resolving.has(key)) {
        return undefined;
      }
      resolving.add(key);
      let kind: CollectionKind | undefined;
      if (definition.type === 'Variable') {
        const declarator: Node = definition.node;
        if (declarator.id === key) {
          kind = kindFromType(key.typeAnnotation) ?? kindOfExpression(declarator.init);
        }
      } else if (definition.type === 'Parameter') {
        for (const param of definition.node.params as Node[]) {
          if (param === key) {
            kind = kindFromType(key.typeAnnotation);
          } else if (param.type === 'AssignmentPattern' && param.left === key) {
            kind = kindFromType(key.typeAnnotation) ?? kindOfExpression(param.right);
          } else if (param.type === 'RestElement' && param.argument === key) {
            kind = 'array';
          }
        }
      }
      resolving.delete(key);
      kinds.set(key, kind ?? null);
      return kind;
    };

    const isGlobal = (identifier: Node) => {
      const variable = findVariable(identifier);
      return !variable || variable.defs.length === 0;
    };

    return {
      TSInterfaceDeclaration(node: Node) {
        interfaces.add(node.id.name);
      },

      TSTypeAliasDeclaration(node: Node) {
        aliases.set(node.id.name, node.typeAnnotation);
      },

      NewExpression(node: Node) {
        const callee = node.callee;
        if (callee.type === 'Identifier' && UNSUPPORTED_COLLECTIONS.has(callee.name)) {
          context.report({
            node,
            messageId: 'collection',
            data: {
              name: callee.name,
              alternative: callee.name === 'Map' ? 'an object' : 'an object or a Set',
            },
          });
        }
      },

      MemberExpression(node: Node) {
        if (node.computed || node.property.type !== 'Identifier') {
          return;
        }
        const name: string = node.property.name;
        const object = unwrap(node.object);

        // `value.toString()` is translated to `str(value)`, which works for every value.
        const parent: Node | undefined = node.parent;
        if (
          name === 'toString' &&
          parent?.type === 'CallExpression' &&
          parent.callee === node &&
          parent.arguments.length === 0
        ) {
          return;
        }

        if (object.type === 'Identifier' && STATIC_OBJECTS.has(object.name) && isGlobal(object)) {
          const qualified = `${object.name}.${name}`;
          if (!allowed.statics.includes(qualified)) {
            context.report({
              node,
              messageId: 'static',
              data: { name: qualified, allowed: list(allowed.statics) },
            });
          }
          return;
        }

        const kind = kindOfExpression(object);
        if (!kind) {
          return;
        }
        if (kind === 'object') {
          // Reading a property of an object is a dictionary lookup. Calling one is not possible.
          const isCall = parent?.type === 'CallExpression' && parent.callee === node;
          if (isCall && !allowed.object.includes(name)) {
            context.report({ node, messageId: 'call', data: { name } });
          }
          return;
        }
        if (
          kind === 'array' &&
          name === 'splice' &&
          parent?.type === 'CallExpression' &&
          parent.callee === node &&
          !isSupportedSplice(parent.arguments)
        ) {
          context.report({ node: parent, messageId: 'splice' });
        }
        if (!allowed[kind].includes(name)) {
          context.report({
            node,
            messageId: 'member',
            data: {
              name,
              kind: kind === 'array' ? 'arrays' : 'sets',
              allowed: list(allowed[kind]),
            },
          });
        }
      },
    };
  },
};

const NUMBER_CONVERSIONS = new Set(['Number', 'parseInt', 'parseFloat']);
const NUMBER_STATICS = new Set(['parseInt', 'parseFloat']);

const noNumberConversion = {
  meta: {
    type: 'problem' as const,
    docs: {
      description:
        "Reports conversions to a number, since the game's Python has no int() or float().",
    },
    messages: {
      conversion:
        "'{{name}}' is not supported: the game's Python has no int() or float(). Numbers are already numbers, so the conversion isn't needed. Use String(value) to convert to text.",
    },
    schema: [],
  },

  create(context: Context) {
    const isGlobal = (identifier: Node) => {
      let scope = context.sourceCode.getScope(identifier);
      while (scope) {
        const variable = scope.set.get(identifier.name);
        if (variable && variable.defs.length > 0) {
          return false;
        }
        scope = scope.upper;
      }
      return true;
    };
    const report = (node: Node, name: string) =>
      context.report({ node, messageId: 'conversion', data: { name } });

    const checkCallee = (node: Node, callee: Node) => {
      const target = unwrap(callee);
      if (target.type === 'Identifier' && NUMBER_CONVERSIONS.has(target.name) && isGlobal(target)) {
        report(node, target.name);
      } else if (
        target.type === 'MemberExpression' &&
        !target.computed &&
        target.object.type === 'Identifier' &&
        target.object.name === 'Number' &&
        target.property.type === 'Identifier' &&
        NUMBER_STATICS.has(target.property.name) &&
        isGlobal(target.object)
      ) {
        report(node, `Number.${target.property.name}`);
      }
    };

    return {
      CallExpression: (node: Node) => checkCallee(node, node.callee),
      NewExpression: (node: Node) => checkCallee(node, node.callee),
      UnaryExpression(node: Node) {
        // `+value` is JavaScript's shortest way to convert to a number.
        if (node.operator === '+') {
          report(node, '+value');
        }
      },
    };
  },
};

const noClasses = {
  meta: {
    type: 'problem' as const,
    docs: { description: "Reports classes, which the game's Python doesn't have." },
    messages: {
      class:
        "Classes are not supported in the game's Python. Use functions and plain objects instead.",
    },
    schema: [],
  },

  create(context: Context) {
    const report = (node: Node) => context.report({ node, messageId: 'class' });
    return { ClassDeclaration: report, ClassExpression: report };
  },
};

const noLambdas = {
  meta: {
    type: 'problem' as const,
    docs: {
      description:
        "Reports arrow functions and function expressions, which the game's Python doesn't have.",
    },
    messages: {
      lambda:
        "Lambdas and function expressions are not supported in the game's Python. Declare a named function instead.",
    },
    schema: [],
  },

  create(context: Context) {
    const report = (node: Node) => {
      // The class itself is reported by no-classes, so its methods aren't lambdas as well.
      if (node.parent?.type !== 'MethodDefinition') {
        context.report({ node, messageId: 'lambda' });
      }
    };
    return { ArrowFunctionExpression: report, FunctionExpression: report };
  },
};

export default {
  meta: { name: 'farm' },
  rules: {
    'no-classes': noClasses,
    'no-lambdas': noLambdas,
    'no-number-conversion': noNumberConversion,
    'no-unsupported-collection-member': rule,
  },
};
