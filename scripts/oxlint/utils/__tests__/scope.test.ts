import { findVariable, isGlobalReference } from '../scope.ts';
import { tester, ts } from '../testing.ts';
import type { Context, Node } from '../types.ts';

/**
 * A rule that reports, for every call of a plain name, what the scope helpers make of that name.
 */
const probe = {
  meta: {
    type: 'problem' as const,
    messages: { result: '{{name}}: found={{found}} global={{global}}' },
    schema: [],
  },
  create(context: Context) {
    return {
      CallExpression(node: Node) {
        if (node.callee.type !== 'Identifier') {
          return;
        }
        context.report({
          node,
          messageId: 'result',
          data: {
            name: node.callee.name,
            found: String(findVariable(context, node.callee) !== null),
            global: String(isGlobalReference(context, node.callee)),
          },
        });
      },
    };
  },
};

const declared = (name: string) => ({
  messageId: 'result',
  data: { name, found: 'true', global: 'false' },
});

tester.run('scope helpers', probe, {
  valid: [ts('const a = 1; a.toString(); [1].map;'), ts('const o = { f() {} }; o.f();')],
  invalid: [
    { ...ts('function f() {} f();'), errors: [declared('f')] },
    { ...ts('const g = () => 1; g();'), errors: [declared('g')] },
    { ...ts('function h(p: () => void) { p(); }'), errors: [declared('p')] },
    { ...ts("import { m } from 'x'; m();"), errors: [declared('m')] },
    {
      // Names are looked up through the enclosing scopes.
      ...ts('const outer = () => 1; function inner() { return () => outer(); }'),
      errors: [declared('outer')],
    },
    {
      // A local declaration shadows the global of the same name.
      ...ts('function f() { const Number = () => 1; Number(); }'),
      errors: [declared('Number')],
    },
    {
      // Without a declaration in the file, a name is a global.
      ...ts('unknown();'),
      errors: [{ messageId: 'result', data: { name: 'unknown', found: 'false', global: 'true' } }],
    },
    {
      ...ts('Number("1");'),
      errors: [{ messageId: 'result', data: { name: 'Number', found: 'false', global: 'true' } }],
    },
  ],
});
