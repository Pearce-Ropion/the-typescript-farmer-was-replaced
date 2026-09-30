import { tester, ts } from '../../utils/testing.ts';
import rule from '../no-lambdas.ts';

tester.run('no-lambdas', rule, {
  valid: [
    ts('function f(a: number) { return a; }'),
    ts('export function g() { return 1; }'),
    ts('function h() { for (const x of [1]) { x; } }'),
    // Methods of a class are left to no-classes.
    ts('class A { m() { return 1; } }'),
  ],
  invalid: [
    { ...ts('const f = () => 1;'), errors: [{ messageId: 'lambda' }] },
    { ...ts('const f = function () {};'), errors: [{ messageId: 'lambda' }] },
    {
      ...ts('[1].includes(1); run(() => 1); function run(f: () => number) { f(); }'),
      errors: [{ messageId: 'lambda' }],
    },
    { ...ts('const o = { m() {} };'), errors: [{ messageId: 'lambda' }] },
    {
      ...ts('const f = async () => { await 1; };'),
      errors: [{ messageId: 'lambda' }],
    },
  ],
});
