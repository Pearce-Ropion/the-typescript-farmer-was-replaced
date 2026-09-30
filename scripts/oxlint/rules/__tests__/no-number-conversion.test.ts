import { tester, ts } from '../../utils/testing.ts';
import rule from '../no-number-conversion.ts';

tester.run('no-number-conversion', rule, {
  valid: [
    ts('const a = 1 + 2; const b = -a; const s = String(a); const t = a.toString();'),
    ts('function parseFloat(x: string) { return x; } parseFloat("1");'),
    ts('const Number = (x: string) => x; Number("1");'),
    ts('const n = Math.floor(1.5) + Math.abs(-1);'),
  ],
  invalid: [
    {
      ...ts('const a = Number("1");'),
      errors: [{ messageId: 'conversion', data: { name: 'Number' } }],
    },
    {
      ...ts('const a = parseFloat("1.5");'),
      errors: [{ messageId: 'conversion', data: { name: 'parseFloat' } }],
    },
    {
      ...ts('const a = parseInt("1", 10);'),
      errors: [{ messageId: 'conversion', data: { name: 'parseInt' } }],
    },
    {
      ...ts('const a = Number.parseFloat("1"); const b = Number.parseInt("1");'),
      errors: [
        { messageId: 'conversion', data: { name: 'Number.parseFloat' } },
        { messageId: 'conversion', data: { name: 'Number.parseInt' } },
      ],
    },
    {
      ...ts('const a = new Number("1");'),
      errors: [{ messageId: 'conversion', data: { name: 'Number' } }],
    },
    { ...ts('const a = +"1";'), errors: [{ messageId: 'conversion', data: { name: '+value' } }] },
  ],
});
