import { unwrap } from '../utils/ast.ts';
import { isGlobalReference } from '../utils/scope.ts';
import type { Context, Node } from '../utils/types.ts';

const NUMBER_CONVERSIONS = new Set(['Number', 'parseInt', 'parseFloat']);
const NUMBER_STATICS = new Set(['parseInt', 'parseFloat']);

const rule = {
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
    const isGlobal = (identifier: Node) => isGlobalReference(context, identifier);
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

export default rule;
