import type { Context, Node } from '../utils/types.ts';

interface Options {
  /** The directory that contains the saves. Files must be directly inside one of its directories. */
  savesDirectory?: string;
  /** Modules that can be imported by name. */
  packages?: string[];
}

/** `./name` or `./name.ts`: a file in the same directory. */
const SIBLING = /^\.\/[^/\\]+$/;

const rule = {
  meta: {
    type: 'problem' as const,
    docs: {
      description:
        "Reports imports of anything but files in the same directory, and files in nested directories, since a save's files are flat.",
    },
    messages: {
      import:
        "'{{source}}' can't be imported. A save's files all live in one directory, so import a sibling as './name' (or 'farmer' for the game's API).",
      nested:
        "Files must be directly inside their save's directory. Nested directories aren't built.",
    },
    schema: [
      {
        type: 'object',
        properties: {
          savesDirectory: { type: 'string' },
          packages: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context: Context) {
    const options: Options = context.options[0] ?? {};
    const savesDirectory = options.savesDirectory ?? 'saves';
    const packages = options.packages ?? ['farmer'];

    const check = (node: Node, source: Node | null | undefined) => {
      if (!source) {
        return;
      }
      const value =
        source.type === 'Literal' && typeof source.value === 'string' ? source.value : null;
      if (value !== null && (packages.includes(value) || SIBLING.test(value))) {
        return;
      }
      context.report({
        node,
        messageId: 'import',
        data: { source: value ?? 'a computed path' },
      });
    };

    return {
      Program(node: Node) {
        // `saves/<save>/<file>` is the deepest a file can be inside the saves directory.
        const parts: string[] = context.filename.split(/[\\/]/);
        const index = parts.lastIndexOf(savesDirectory);
        if (index >= 0 && parts.length - index - 1 > 2) {
          context.report({ node, messageId: 'nested' });
        }
      },
      ImportDeclaration: (node: Node) => check(node, node.source),
      ExportNamedDeclaration: (node: Node) => check(node, node.source),
      ExportAllDeclaration: (node: Node) => check(node, node.source),
      ImportExpression: (node: Node) => check(node, node.source),
      CallExpression(node: Node) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require' &&
          node.arguments[0]
        ) {
          check(node, node.arguments[0]);
        }
      },
    };
  },
};

export default rule;
