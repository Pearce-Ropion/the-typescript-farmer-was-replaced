import type { Context, Node } from '../utils/types.ts';

const rule = {
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

export default rule;
