import type { Node } from './types.ts';

const WRAPPERS = new Set([
  'ParenthesizedExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
]);

/**
 * Removes parentheses and type assertions around an expression.
 */
export function unwrap(node: Node): Node {
  let current = node;
  while (WRAPPERS.has(current.type)) {
    current = current.expression;
  }
  return current;
}
