import type { Context, Node } from '../utils/types.ts';

const rule = {
  meta: {
    type: 'problem' as const,
    docs: { description: "Reports do...while loops, which the game's Python doesn't have." },
    messages: {
      doWhile: "do...while loops are not supported in the game's Python. Use a while loop instead.",
    },
    schema: [],
  },

  create(context: Context) {
    return {
      DoWhileStatement: (node: Node) => context.report({ node, messageId: 'doWhile' }),
    };
  },
};

export default rule;
