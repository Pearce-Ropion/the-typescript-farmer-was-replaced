import { tester, ts } from '../../utils/testing.ts';
import rule from '../no-do-while.ts';

tester.run('no-do-while', rule, {
  valid: [
    ts('let i = 0; while (i < 3) { i++; }'),
    ts('for (let i = 0; i < 3; i++) {}'),
    ts('for (const x of [1, 2]) { x; }'),
    ts('while (true) { break; }'),
  ],
  invalid: [
    { ...ts('let i = 0; do { i++; } while (i < 3);'), errors: [{ messageId: 'doWhile' }] },
    { ...ts('do ; while (false);'), errors: [{ messageId: 'doWhile' }] },
    {
      // Each loop is reported, including one inside another.
      ...ts('do { do { break; } while (true); } while (true);'),
      errors: [{ messageId: 'doWhile' }, { messageId: 'doWhile' }],
    },
  ],
});
