import { spawnSync } from 'node:child_process';
import { globSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Runs a tool of the project (`oxlint`, `oxfmt`) on the whole project, including the saves.
 *
 * The saves are ignored by git, and the tools skip git-ignored files when they search directories.
 * They do check files that are named explicitly though, so the files of the saves are passed by name.
 *
 * Usage: node scripts/with-saves.ts <tool> [options...]
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [tool, ...options] = process.argv.slice(2);

if (!tool) {
  console.error('usage: node scripts/with-saves.ts <tool> [options...]');
  process.exit(2);
}

const files = globSync('saves/**/*.ts', { cwd: root }).toSorted();
const result = spawnSync(resolve(root, 'node_modules/.bin', tool), [...options, '.', ...files], {
  cwd: root,
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
