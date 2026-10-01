import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const GENERATED = '# Generated from TypeScript. Do not edit; edit the source and rebuild.\n';

interface Workspace {
  savesDir: string;
  outDir: string;
  write: (save: string, file: string, source: string) => void;
  args: (...extra: string[]) => string[];
}

const withWorkspace = async (run: (workspace: Workspace) => void | Promise<void>) => {
  const dir = mkdtempSync(join(tmpdir(), 'farm-cli-'));
  const savesDir = join(dir, 'saves');
  const outDir = join(dir, 'builds');
  mkdirSync(savesDir);
  try {
    await run({
      savesDir,
      outDir,
      write: (save, file, source) => {
        mkdirSync(join(savesDir, save), { recursive: true });
        writeFileSync(join(savesDir, save, file), source);
      },
      args: (...extra) => ['--saves', savesDir, '--out', outDir, ...extra],
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const build = (args: string[]) => {
  const result = spawnSync(process.execPath, ['scripts/build.ts', ...args], {
    cwd: root,
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};

describe('build script', () => {
  it('builds every save and exits successfully', async () => {
    await withWorkspace(workspace => {
      workspace.write('one', 'main.ts', 'export const a = 1;\n');
      workspace.write('two', 'main.ts', 'export const b = 2;\n');
      const result = build(workspace.args());
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('[one] built ok');
      expect(result.stdout).toContain('[two] built ok');
      expect(readdirSync(join(workspace.outDir, 'one'))).toEqual(['main.py']);
      expect(readdirSync(join(workspace.outDir, 'two'))).toEqual(['main.py']);
    });
  });

  it('builds only the saves it is given', async () => {
    await withWorkspace(workspace => {
      workspace.write('one', 'main.ts', 'export const a = 1;\n');
      workspace.write('two', 'main.ts', 'export const b = 2;\n');
      const result = build(workspace.args('two'));
      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain('[one]');
      expect(readdirSync(workspace.outDir)).toEqual(['two']);
    });
  });

  it('exits with an error when a save fails and still builds the others', async () => {
    await withWorkspace(workspace => {
      workspace.write('bad', 'main.ts', 'class A {}\n');
      workspace.write('good', 'main.ts', 'export const a = 1;\n');
      const result = build(workspace.args());
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(
        /\[bad\] error .*main\.ts:1:1: ClassDeclaration is not supported/,
      );
      expect(result.stdout).toContain('[bad] built 1 error(s)');
      expect(result.stdout).toContain('[good] built ok');
      expect(existsSync(join(workspace.outDir, 'good/main.py'))).toBe(true);
    });
  });

  it('warns about files it skipped and files that are out of date', async () => {
    await withWorkspace(workspace => {
      workspace.write('one', 'lib.ts', 'export function f() { return 1; }\n');
      workspace.write('one', 'main.ts', "import { f } from './lib';\nf();\n");
      expect(build(workspace.args()).status).toBe(0);

      workspace.write('one', 'lib.ts', 'export function f( {\n');
      const result = build(workspace.args());
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Expected');
      expect(result.stderr).toMatch(/skipped .*main\.ts: it imports lib, which has errors/);
      expect(result.stderr).toMatch(/warning .*lib\.py is out of date/);
    });
  });

  it('removes the output of a save that was deleted', async () => {
    await withWorkspace(workspace => {
      workspace.write('keep', 'main.ts', 'export const a = 1;\n');
      mkdirSync(join(workspace.outDir, 'gone'), { recursive: true });
      writeFileSync(join(workspace.outDir, 'gone/main.py'), `${GENERATED}x = 1\n`);

      const result = build(workspace.args());
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('removed');
      expect(readdirSync(workspace.outDir)).toEqual(['keep']);
    });
  });

  it('fails for a save that does not exist', async () => {
    await withWorkspace(workspace => {
      workspace.write('one', 'main.ts', 'export const a = 1;\n');
      const result = build(workspace.args('nope'));
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('error: no such save: nope');
      expect(existsSync(workspace.outDir)).toBe(false);
    });
  });

  it('fails when the saves directory does not exist', async () => {
    await withWorkspace(workspace => {
      const result = build([
        '--saves',
        join(workspace.savesDir, 'missing'),
        '--out',
        workspace.outDir,
      ]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('does not exist');
    });
  });

  it('warns when there are no saves', async () => {
    await withWorkspace(workspace => {
      const result = build(workspace.args());
      expect(result.status).toBe(0);
      expect(result.stderr).toContain('no saves found');
    });
  });

  it('prints its usage with --help', () => {
    const result = build(['--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: build [options] [saves...]');
    expect(result.stdout).toContain('--watch');
    expect(result.stdout).toContain('--saves <dir>');
    expect(result.stdout).toContain('--out <dir>');
  });

  it('rejects unknown options', () => {
    const result = build(['--bogus']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unknown option '--bogus'");
  });

  it('rebuilds a save when its files change in watch mode', async () => {
    await withWorkspace(async workspace => {
      workspace.write('one', 'main.ts', 'export const a = 1;\n');
      workspace.write('two', 'main.ts', 'export const b = 1;\n');
      const child = spawn(process.execPath, ['scripts/build.ts', '--watch', ...workspace.args()], {
        cwd: root,
      });
      let output = '';
      child.stdout.on('data', chunk => (output += String(chunk)));
      const waitFor = async (text: string, count = 1) => {
        for (let i = 0; i < 100; i++) {
          if (output.split(text).length - 1 >= count) {
            return;
          }
          await new Promise(done => setTimeout(done, 50));
        }
        throw new Error(`Timed out waiting for ${text}\n${output}`);
      };
      try {
        await waitFor('watching');
        output = '';
        workspace.write('one', 'main.ts', 'export const a = 2;\n');
        await waitFor('[one] wrote');
        // Only the save that changed is rebuilt.
        expect(output).not.toContain('[two]');
      } finally {
        child.kill();
      }
    });
  }, 15_000);
});

describe('with-saves script', () => {
  const run = (...args: string[]) =>
    spawnSync(process.execPath, ['scripts/with-saves.ts', ...args], {
      cwd: root,
      encoding: 'utf8',
    });

  it('explains how to use it when no tool is named', () => {
    const result = run();
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('usage: node scripts/with-saves.ts <tool>');
  });

  it('passes the exit code of the tool on', () => {
    // oxlint prints its version and succeeds.
    expect(run('oxlint', '--version').status).toBe(0);
    // An option oxlint does not know makes it fail.
    expect(run('oxlint', '--no-such-option').status).not.toBe(0);
  });

  it('fails for a tool that does not exist', () => {
    expect(run('no-such-tool').status).toBe(1);
  });
});
