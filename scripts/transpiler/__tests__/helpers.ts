import { join, resolve } from 'node:path';

import { loadFarmerInfo } from '../farmer.ts';
import { transpileProject } from '../transpile.ts';

export const root = resolve(import.meta.dirname, '../../..');
export const farmer = loadFarmerInfo(join(root, 'types/farmer'));

export const IMPORT = "import { move, Direction, Entities } from 'farmer';\n";

/** Transpiles `source` as the module `main` and returns the Python without the header. */
export function py(source: string, others: Record<string, string> = {}): string {
  const files = Object.entries({ main: source, ...others }).map(([name, code]) => ({
    name,
    path: `${name}.ts`,
    source: code,
  }));
  const { outputs, errors } = transpileProject(files, farmer);
  if (errors.length) {
    throw errors[0];
  }
  const code = outputs.find(output => output.name === 'main')!.code;
  // The tests write nested blocks with tabs, which is easier to read than four spaces.
  return code
    .split('\n')
    .slice(2)
    .join('\n')
    .trim()
    .replace(/^( {4})+/gm, indent => '\t'.repeat(indent.length / 4));
}

/** Expects transpiling `source` as the module `main` to fail with a message matching `message`. */
export function fails(source: string, message: RegExp, others: Record<string, string> = {}): void {
  const files = Object.entries({ main: source, ...others }).map(([name, code]) => ({
    name,
    path: `${name}.ts`,
    source: code,
  }));
  const { errors } = transpileProject(files, farmer);
  expect(errors[0]?.message).toMatch(message);
}
