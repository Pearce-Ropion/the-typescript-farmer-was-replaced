import { tester, ts } from '../../utils/testing.ts';
import rule from '../no-classes.ts';

tester.run('no-classes', rule, {
  valid: [ts('function f() { return { a: 1 }; }'), ts('const o = { a: 1 }; o.a = 2;')],
  invalid: [
    { ...ts('class A {}'), errors: [{ messageId: 'class' }] },
    { ...ts('const B = class {};'), errors: [{ messageId: 'class' }] },
    { ...ts('export class C extends Object { m() {} }'), errors: [{ messageId: 'class' }] },
  ],
});
