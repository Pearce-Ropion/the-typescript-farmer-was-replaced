import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { root as projectRoot } from '../../transpiler/__tests__/helpers.ts';
import { buildSaves, listSaves, pruneSaves } from '../../transpiler/project.ts';
import { run } from '../build-command.ts';
import type { Dependencies } from '../build-command.ts';

interface Workspace {
  root: string;
  write: (save: string, file: string, source: string) => void;
  remove: (save: string, file: string) => void;
}

const withWorkspace = async (test: (workspace: Workspace) => void | Promise<void>) => {
  const dir = mkdtempSync(join(tmpdir(), 'farm-command-'));
  // The declarations of the game are read from the project, so link the real ones in.
  mkdirSync(join(dir, 'types'));
  symlinkSync(join(projectRoot, 'types/farmer'), join(dir, 'types/farmer'));
  mkdirSync(join(dir, 'saves'));
  try {
    await test({
      root: dir,
      write: (save, file, source) => {
        mkdirSync(join(dir, 'saves', save), { recursive: true });
        writeFileSync(join(dir, 'saves', save, file), source);
      },
      remove: (save, file) => rmSync(join(dir, 'saves', save, file)),
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const capture = () => {
  const lines = { log: [] as string[], warn: [] as string[], error: [] as string[] };
  return {
    lines,
    output: {
      log: (message: string) => lines.log.push(message),
      warn: (message: string) => lines.warn.push(message),
      error: (message: string) => lines.error.push(message),
    },
  };
};

const GOOD = 'export const a = 1;\n';

describe('building', () => {
  it('builds every save and exits successfully', async () => {
    await withWorkspace(workspace => {
      workspace.write('one', 'main.ts', GOOD);
      workspace.write('two', 'main.ts', GOOD);
      const { lines, output } = capture();
      expect(run([], { root: workspace.root, output }).exitCode).toBe(0);
      expect(lines.log).toContain('[one] wrote builds/one/main.py');
      expect(lines.log).toContain('[two] wrote builds/two/main.py');
      expect(lines.log.filter(line => /built ok in \d+ms/.test(line))).toHaveLength(2);
      expect(lines.error).toEqual([]);
    });
  });

  it('builds only the saves it is given', async () => {
    await withWorkspace(workspace => {
      workspace.write('one', 'main.ts', GOOD);
      workspace.write('two', 'main.ts', GOOD);
      const { lines, output } = capture();
      expect(run(['two'], { root: workspace.root, output }).exitCode).toBe(0);
      expect(lines.log.join('\n')).not.toContain('[one]');
      expect(lines.log).toContain('[two] wrote builds/two/main.py');
    });
  });

  it('exits with an error when a save fails and still builds the others', async () => {
    await withWorkspace(workspace => {
      workspace.write('bad', 'main.ts', 'class A {}\n');
      workspace.write('good', 'main.ts', GOOD);
      const { lines, output } = capture();
      expect(run([], { root: workspace.root, output }).exitCode).toBe(1);
      expect(lines.error[0]).toMatch(/\[bad\] error .*main\.ts:1:1: ClassDeclaration/);
      expect(lines.log.some(line => /^\[bad\] built 1 error\(s\) in \d+ms$/.test(line))).toBe(true);
      expect(lines.log).toContain('[good] wrote builds/good/main.py');
    });
  });

  it('prints the stack of an internal error', async () => {
    await withWorkspace(workspace => {
      workspace.write('one', 'main.ts', GOOD);
      const cause = Object.assign(new Error('boom'), { stack: 'Error: boom\n    at somewhere' });
      const failing: Dependencies['buildSaves'] = () => [
        {
          save: 'one',
          result: {
            written: [],
            removed: [],
            skipped: [],
            stale: [],
            errors: [
              Object.assign(new Error('one/main.ts:1:1: Internal transpiler error: boom'), {
                cause,
              }) as never,
            ],
          },
        },
      ];
      const { lines, output } = capture();
      const result = run([], {
        root: workspace.root,
        output,
        dependencies: { buildSaves: failing },
      });
      expect(result.exitCode).toBe(1);
      expect(lines.error).toEqual([
        '[one] error one/main.ts:1:1: Internal transpiler error: boom',
        'Error: boom\n    at somewhere',
      ]);
    });
  });

  it('reports files that were skipped or left out of date', async () => {
    await withWorkspace(workspace => {
      workspace.write('one', 'lib.ts', 'export function f() { return 1; }\n');
      workspace.write('one', 'main.ts', "import { f } from './lib';\nf();\n");
      expect(run([], { root: workspace.root, output: capture().output }).exitCode).toBe(0);

      workspace.write('one', 'lib.ts', 'export function f( {\n');
      const { lines, output } = capture();
      expect(run([], { root: workspace.root, output }).exitCode).toBe(1);
      expect(lines.warn).toContain(
        '[one] skipped saves/one/main.ts: it imports lib, which has errors',
      );
      expect(lines.warn.join('\n')).toContain(
        '[one] warning builds/one/lib.py is out of date: its source has errors, so the previous version was kept',
      );
    });
  });

  it('reports the python it removes', async () => {
    await withWorkspace(workspace => {
      workspace.write('one', 'a.ts', GOOD);
      workspace.write('one', 'b.ts', GOOD);
      workspace.write('gone', 'main.ts', GOOD);
      expect(run([], { root: workspace.root, output: capture().output }).exitCode).toBe(0);

      workspace.remove('one', 'b.ts');
      rmSync(join(workspace.root, 'saves/gone'), { recursive: true });
      const { lines, output } = capture();
      expect(run([], { root: workspace.root, output }).exitCode).toBe(0);
      expect(lines.log).toContain('[one] removed builds/one/b.py');
      expect(lines.log).toContain('removed builds/gone/main.py');
    });
  });

  it('does not prune other saves when only some are built', async () => {
    await withWorkspace(workspace => {
      workspace.write('one', 'main.ts', GOOD);
      workspace.write('gone', 'main.ts', GOOD);
      run([], { root: workspace.root, output: capture().output });
      rmSync(join(workspace.root, 'saves/gone'), { recursive: true });

      const { lines, output } = capture();
      run(['one'], { root: workspace.root, output });
      expect(lines.log.join('\n')).not.toContain('removed builds/gone');
    });
  });
});

describe('invalid use', () => {
  it('fails for a save that does not exist', async () => {
    await withWorkspace(workspace => {
      workspace.write('one', 'main.ts', GOOD);
      const { lines, output } = capture();
      expect(run(['nope'], { root: workspace.root, output }).exitCode).toBe(1);
      expect(lines.error).toEqual(['error: no such save: nope (looked in saves)']);
    });
  });

  it('fails when the saves directory does not exist', async () => {
    await withWorkspace(workspace => {
      const { lines, output } = capture();
      const result = run(['--saves', 'missing'], { root: workspace.root, output });
      expect(result.exitCode).toBe(1);
      expect(lines.error).toEqual(['error: missing does not exist']);
    });
  });

  it('warns when there are no saves', async () => {
    await withWorkspace(workspace => {
      const { lines, output } = capture();
      expect(run([], { root: workspace.root, output }).exitCode).toBe(0);
      expect(lines.warn).toEqual(['no saves found in saves']);
    });
  });

  it('prints its usage with --help', async () => {
    await withWorkspace(workspace => {
      const { lines, output } = capture();
      expect(run(['--help'], { root: workspace.root, output }).exitCode).toBe(0);
      expect(lines.log[0]).toContain('Usage: build [options] [saves...]');
      expect(lines.log[0]).toContain('--watch');
      expect(lines.log[0]).toContain('--saves <dir>');
      expect(lines.log[0]).toContain('--out <dir>');
    });
  });

  it('rejects unknown options', async () => {
    await withWorkspace(workspace => {
      const { lines, output } = capture();
      expect(run(['--bogus'], { root: workspace.root, output }).exitCode).toBe(1);
      expect(lines.error).toEqual(["error: unknown option '--bogus'"]);
    });
  });

  it('keeps going after an unexpected failure', async () => {
    await withWorkspace(workspace => {
      workspace.write('one', 'main.ts', GOOD);
      const failures: unknown[] = [
        new Error('boom'),
        Object.assign(new Error('no stack'), { stack: undefined }),
        'a string',
      ];
      const results = failures.map(failure => {
        const { lines, output } = capture();
        const result = run([], {
          root: workspace.root,
          output,
          dependencies: {
            buildSaves: () => {
              throw failure;
            },
          },
        });
        return { exitCode: result.exitCode, error: lines.error[0] };
      });
      expect(results.map(result => result.exitCode)).toEqual([1, 1, 1]);
      expect(results[0].error).toMatch(/^error Error: boom\n/);
      expect(results[1].error).toBe('error no stack');
      expect(results[2].error).toBe('error a string');
    });
  });
});

describe('watching', () => {
  type Listener = (filename: string | null) => void;

  /** Replaces the file watching with something the test can trigger. */
  const fakeWatching = () => {
    const watchers = new Map<string, { listener: Listener; closed: boolean }>();
    const dependencies: Partial<Dependencies> = {
      watch: (dir, listener) => {
        const watcher = { listener, closed: false };
        watchers.set(dir.split('/').slice(-2).join('/'), watcher);
        return { close: () => (watcher.closed = true) };
      },
    };
    return { watchers, dependencies };
  };

  const withTimers = async (test: () => void | Promise<void>) => {
    vi.useFakeTimers();
    try {
      await test();
    } finally {
      vi.useRealTimers();
    }
  };

  const setup = (workspace: Workspace, args: string[] = []) => {
    const { watchers, dependencies } = fakeWatching();
    const built: string[][] = [];
    const { lines, output } = capture();
    const result = run(['--watch', ...args], {
      root: workspace.root,
      output,
      dependencies: {
        ...dependencies,
        buildSaves: (options, saves) => {
          built.push([...(saves ?? [])]);
          return buildSaves(options, saves);
        },
      },
    });
    const savesWatcher = [...watchers.entries()].find(([dir]) => dir.endsWith('/saves'))![1];
    const typesWatcher = [...watchers.entries()].find(([dir]) => dir.endsWith('/farmer'))![1];
    built.length = 0;
    return { result, lines, built, savesWatcher, typesWatcher, watchers };
  };

  it('starts watching after the first build', async () => {
    await withTimers(async () => {
      await withWorkspace(workspace => {
        workspace.write('one', 'main.ts', GOOD);
        const { result, lines, watchers } = setup(workspace);
        expect(result.exitCode).toBe(0);
        expect(lines.log).toContain('watching saves...');
        expect(watchers.size).toBe(2);
      });
    });
  });

  it('rebuilds the save a changed file belongs to', async () => {
    await withTimers(async () => {
      await withWorkspace(workspace => {
        workspace.write('one', 'main.ts', GOOD);
        workspace.write('two', 'main.ts', GOOD);
        const { built, savesWatcher } = setup(workspace);

        savesWatcher.listener('one/main.ts');
        expect(built).toEqual([]);
        vi.advanceTimersByTime(50);
        expect(built).toEqual([['one']]);
      });
    });
  });

  it('builds once for a burst of changes', async () => {
    await withTimers(async () => {
      await withWorkspace(workspace => {
        workspace.write('one', 'main.ts', GOOD);
        workspace.write('two', 'main.ts', GOOD);
        const { built, savesWatcher } = setup(workspace);

        savesWatcher.listener('one/a.ts');
        vi.advanceTimersByTime(20);
        savesWatcher.listener('one/b.ts');
        savesWatcher.listener('two/c.ts');
        vi.advanceTimersByTime(49);
        expect(built).toEqual([]);
        vi.advanceTimersByTime(1);
        expect(built).toEqual([['one'], ['two']]);
      });
    });
  });

  it('ignores files that are not typescript or not inside a save', async () => {
    await withTimers(async () => {
      await withWorkspace(workspace => {
        workspace.write('one', 'main.ts', GOOD);
        const { built, savesWatcher } = setup(workspace);

        savesWatcher.listener('one/notes.md');
        savesWatcher.listener('main.ts');
        savesWatcher.listener(null);
        vi.advanceTimersByTime(100);
        expect(built).toEqual([]);
      });
    });
  });

  it('only rebuilds the saves it was asked to watch', async () => {
    await withTimers(async () => {
      await withWorkspace(workspace => {
        workspace.write('one', 'main.ts', GOOD);
        workspace.write('two', 'main.ts', GOOD);
        const { built, savesWatcher, typesWatcher } = setup(workspace, ['one']);

        savesWatcher.listener('two/main.ts');
        vi.advanceTimersByTime(100);
        expect(built).toEqual([]);

        savesWatcher.listener('one/main.ts');
        vi.advanceTimersByTime(100);
        expect(built).toEqual([['one']]);

        typesWatcher.listener('entities.d.ts');
        vi.advanceTimersByTime(100);
        expect(built).toEqual([['one'], ['one']]);
      });
    });
  });

  it('rebuilds every save when the declarations of the game change', async () => {
    await withTimers(async () => {
      await withWorkspace(workspace => {
        workspace.write('one', 'main.ts', GOOD);
        workspace.write('two', 'main.ts', GOOD);
        const { built, typesWatcher } = setup(workspace);

        typesWatcher.listener('notes.md');
        typesWatcher.listener(null);
        vi.advanceTimersByTime(100);
        expect(built).toEqual([]);

        typesWatcher.listener('entities.d.ts');
        vi.advanceTimersByTime(100);
        expect(built).toEqual([['one'], ['two']]);
      });
    });
  });

  it('removes the output of a save that was deleted instead of building it', async () => {
    await withTimers(async () => {
      await withWorkspace(workspace => {
        workspace.write('one', 'main.ts', GOOD);
        workspace.write('two', 'main.ts', GOOD);
        const { built, lines, savesWatcher } = setup(workspace);

        rmSync(join(workspace.root, 'saves/two'), { recursive: true });
        savesWatcher.listener('two/main.ts');
        vi.advanceTimersByTime(100);
        expect(built).toEqual([]);
        expect(lines.log).toContain('removed builds/two/main.py');
      });
    });
  });

  it('stops watching and cancels a pending build', async () => {
    await withTimers(async () => {
      await withWorkspace(workspace => {
        workspace.write('one', 'main.ts', GOOD);
        const { result, built, savesWatcher, watchers } = setup(workspace);

        savesWatcher.listener('one/main.ts');
        result.stop();
        vi.advanceTimersByTime(100);
        expect(built).toEqual([]);
        expect([...watchers.values()].every(watcher => watcher.closed)).toBe(true);
      });
    });
  });

  it('rebuilds when a file really changes', async () => {
    await withWorkspace(async workspace => {
      workspace.write('one', 'main.ts', GOOD);
      const { lines, output } = capture();
      const result = run(['--watch'], { root: workspace.root, output });
      try {
        expect(lines.log).toContain('watching saves...');
        lines.log.length = 0;
        // The watcher can take a moment to start, so change the file until a rebuild is seen.
        for (let version = 2; version < 200; version++) {
          if (lines.log.includes('[one] wrote builds/one/main.py')) {
            break;
          }
          workspace.write('one', 'main.ts', `export const a = ${version};\n`);
          await new Promise(done => setTimeout(done, 100));
        }
        expect(lines.log).toContain('[one] wrote builds/one/main.py');
      } finally {
        result.stop();
      }
    });
  }, 30_000);
});

describe('stopping', () => {
  it('has nothing to stop unless it is watching', async () => {
    await withWorkspace(workspace => {
      workspace.write('one', 'main.ts', GOOD);
      const context = { root: workspace.root, output: capture().output };
      const results = [run([], context), run(['--help'], context), run(['nope'], context)];
      expect(results.map(result => result.stop())).toEqual([undefined, undefined, undefined]);
    });
  });
});

describe('dependencies', () => {
  it('uses the real functions of the project by default', () => {
    // These are what run() uses when nothing is replaced.
    expect([buildSaves, listSaves, pruneSaves].every(fn => typeof fn === 'function')).toBe(true);
  });
});
