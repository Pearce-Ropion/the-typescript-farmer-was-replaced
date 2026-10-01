import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');

const node = (script: string, args: string[]) => {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};

// The commands are tested in scripts/cli/__tests__. These check that the scripts start them.
describe('scripts/build.ts', () => {
  it('builds the saves and sets the exit code', () => {
    const dir = mkdtempSync(join(tmpdir(), 'farm-entry-'));
    try {
      mkdirSync(join(dir, 'saves/one'), { recursive: true });
      writeFileSync(join(dir, 'saves/one/main.ts'), 'export const a = 1;\n');
      const args = ['--saves', join(dir, 'saves'), '--out', join(dir, 'builds')];

      const ok = node('scripts/build.ts', args);
      expect(ok.status).toBe(0);
      expect(ok.stdout).toContain('[one] built ok');
      expect(readdirSync(join(dir, 'builds/one'))).toEqual(['main.py']);

      expect(node('scripts/build.ts', [...args, 'nope']).status).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('scripts/with-saves.ts', () => {
  it('passes the command line on and exits with the code of the command', () => {
    expect(node('scripts/with-saves.ts', []).status).toBe(2);
    expect(node('scripts/with-saves.ts', ['oxlint', '--version']).status).toBe(0);
  });
});
