import { unwrap } from '../ast.ts';
import type { Node } from '../types.ts';

const identifier: Node = { type: 'Identifier', name: 'value' };
const wrap = (type: string, expression: Node): Node => ({ type, expression });

describe('unwrap', () => {
  it('returns an expression that is not wrapped as it is', () => {
    expect(unwrap(identifier)).toBe(identifier);
    const call: Node = { type: 'CallExpression', callee: identifier, arguments: [] };
    expect(unwrap(call)).toBe(call);
  });

  it.each([
    'ParenthesizedExpression',
    'TSAsExpression',
    'TSSatisfiesExpression',
    'TSNonNullExpression',
    'TSTypeAssertion',
  ])('removes %s', type => {
    expect(unwrap(wrap(type, identifier))).toBe(identifier);
  });

  it('removes any number of wrappers', () => {
    const nested = wrap(
      'ParenthesizedExpression',
      wrap(
        'TSAsExpression',
        wrap('TSNonNullExpression', wrap('TSSatisfiesExpression', identifier)),
      ),
    );
    expect(unwrap(nested)).toBe(identifier);
  });

  it('stops at the first node that is not a wrapper', () => {
    const chain = wrap('ChainExpression', identifier);
    expect(unwrap(wrap('TSAsExpression', chain))).toBe(chain);
  });
});
