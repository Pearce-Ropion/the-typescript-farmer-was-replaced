import type { Context, Node } from '../utils/types.ts';

const rule = {
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

export default rule;
