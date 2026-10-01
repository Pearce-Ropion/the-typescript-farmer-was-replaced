import { RuleTester } from 'oxlint/plugins-dev';

RuleTester.describe = describe;
RuleTester.it = it;

export const tester = new RuleTester();

/**
 * A test case for code in the farm's TypeScript.
 */
export const ts = (code: string) => ({ code, filename: 'farm.ts' });
