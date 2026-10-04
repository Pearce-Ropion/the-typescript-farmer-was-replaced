import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { root as projectRoot } from '../../transpiler/__tests__/helpers.ts';
import { buildSaves, listSaves, pruneSaves } from '../../transpiler/project.ts';
import { run as runCommand } from '../build-command.ts';
import type { Dependencies, RunContext } from '../build-command.ts';

/**
 * Runs the command as a debug build, which uses `builds` in the workspace as the game directory, unless the arguments
 * say where the game is, so that the tests don't depend on where the game is on the computer they run on.
 */
const run = (argv: string[], context: RunContext) =>
  runCommand(argv.includes('--game') ? argv : ['--debug-build', ...argv], context);

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
      expect(lines.log).toContain('[one] wrote builds/Saves/one/main.py');
      expect(lines.log).toContain('[two] wrote builds/Saves/two/main.py');
      expect(lines.log.filter(line => /built ok in \d+ms/.test(line))).toHaveLength(2);
      expect(lines.error).toEqual([]);
    });
  });

  it('writes the python to the Saves directory of the game directory', async () => {
    await withWorkspace(workspace => {
      workspace.write('Save0', 'main.ts', GOOD);
      const { lines, output } = capture();
      expect(run(['--game', 'my-game'], { root: workspace.root, output }).exitCode).toBe(0);
      expect(lines.log).toContain('[Save0] wrote my-game/Saves/Save0/main.py');
      expect(readFileSync(join(workspace.root, 'my-game/Saves/Save0/main.py'), 'utf8')).toContain(
        'a = 1',
      );
      expect(existsSync(join(workspace.root, 'builds'))).toBe(false);
    });
  });

  it('builds only the saves it is given', async () => {
    await withWorkspace(workspace => {
      workspace.write('one', 'main.ts', GOOD);
      workspace.write('two', 'main.ts', GOOD);
      const { lines, output } = capture();
      expect(run(['two'], { root: workspace.root, output }).exitCode).toBe(0);
      expect(lines.log.join('\n')).not.toContain('[one]');
      expect(lines.log).toContain('[two] wrote builds/Saves/two/main.py');
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
      expect(lines.log).toContain('[good] wrote builds/Saves/good/main.py');
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
        '[one] warning builds/Saves/one/lib.py is out of date: its source has errors, so the previous version was kept',
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
      expect(lines.log).toContain('[one] removed builds/Saves/one/b.py');
      expect(lines.log).toContain('removed builds/Saves/gone/main.py');
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
      expect(lines.log.join('\n')).not.toContain('removed builds/Saves/gone');
    });
  });
});

describe('the default game directory', () => {
  const MAC_GAME = 'Library/Application Support/com.TheFarmerWasReplaced.TheFarmerWasReplaced';

  /** A home directory with the game's directory of macOS in it, for a pretend macOS. */
  const withMac = async (
    directories: string[],
    test: (workspace: Workspace, environment: Dependencies['environment']) => void,
  ) =>
    withWorkspace(workspace => {
      const homedir = join(workspace.root, 'home');
      for (const directory of directories) {
        mkdirSync(join(homedir, MAC_GAME, directory), { recursive: true });
      }
      test(workspace, { platform: 'darwin', homedir });
    });

  it('builds into the directory of the game on this system when --game is not given', async () => {
    await withMac([''], (workspace, environment) => {
      workspace.write('Save0', 'main.ts', GOOD);
      const { lines, output } = capture();
      const result = runCommand([], {
        root: workspace.root,
        output,
        dependencies: { environment },
      });
      const game = join(environment.homedir, MAC_GAME);
      expect(result.exitCode).toBe(0);
      expect(lines.log[0]).toBe(`using the game directory ${game}`);
      expect(readFileSync(join(game, 'Saves/Save0/main.py'), 'utf8')).toContain('a = 1');
      expect(existsSync(join(workspace.root, 'builds'))).toBe(false);
    });
  });

  it('builds into Saves/user when the game keeps its saves there', async () => {
    await withMac(['Saves/user'], (workspace, environment) => {
      workspace.write('Save0', 'main.ts', GOOD);
      runCommand([], {
        root: workspace.root,
        output: capture().output,
        dependencies: { environment },
      });
      const game = join(environment.homedir, MAC_GAME);
      expect(existsSync(join(game, 'Saves/user/Save0/main.py'))).toBe(true);
      expect(existsSync(join(game, 'Saves/Save0'))).toBe(false);
    });
  });

  it('builds into Saves/user for --game too', async () => {
    await withWorkspace(workspace => {
      workspace.write('Save0', 'main.ts', GOOD);
      mkdirSync(join(workspace.root, 'game/Saves/user'), { recursive: true });
      run(['--game', 'game'], { root: workspace.root, output: capture().output });
      expect(existsSync(join(workspace.root, 'game/Saves/user/Save0/main.py'))).toBe(true);
    });
  });

  it('does not look for the game when --game is given', async () => {
    await withMac([], (workspace, environment) => {
      workspace.write('Save0', 'main.ts', GOOD);
      const { lines, output } = capture();
      // The game is not where this system keeps it, but --game says where it is.
      const result = runCommand(['--game', 'elsewhere'], {
        root: workspace.root,
        output,
        dependencies: { environment },
      });
      expect(result.exitCode).toBe(0);
      expect(lines.log.join('\n')).not.toContain('using the game directory');
      expect(existsSync(join(workspace.root, 'elsewhere/Saves/Save0/main.py'))).toBe(true);
    });
  });

  it('fails when the directory of the game is not where it should be', async () => {
    await withMac([], (workspace, environment) => {
      workspace.write('Save0', 'main.ts', GOOD);
      const { lines, output } = capture();
      const result = runCommand([], {
        root: workspace.root,
        output,
        dependencies: { environment },
      });
      expect(result.exitCode).toBe(1);
      expect(lines.error).toHaveLength(1);
      expect(lines.error[0]).toMatch(
        /^error: The game's directory was not found at .*Run the game once.*--game/s,
      );
      expect(existsSync(join(environment.homedir, MAC_GAME))).toBe(false);
    });
  });

  it('is described in the usage', async () => {
    await withWorkspace(workspace => {
      const { lines, output } = capture();
      runCommand(['--help'], { root: workspace.root, output });
      expect(lines.log[0]).toContain("default: the game's directory on this operating system");
    });
  });
});

describe('a debug build', () => {
  const MAC_GAME = 'Library/Application Support/com.TheFarmerWasReplaced.TheFarmerWasReplaced';

  it('forces the output to builds/, even where the game could be found', async () => {
    await withWorkspace(workspace => {
      workspace.write('Save0', 'main.ts', GOOD);
      // The game is where this system keeps it, but a debug build must not touch it.
      const homedir = join(workspace.root, 'home');
      mkdirSync(join(homedir, MAC_GAME), { recursive: true });
      const { lines, output } = capture();
      const result = runCommand(['--debug-build'], {
        root: workspace.root,
        output,
        dependencies: { environment: { platform: 'darwin', homedir } },
      });
      expect(result.exitCode).toBe(0);
      expect(lines.log).toContain('[Save0] wrote builds/Saves/Save0/main.py');
      expect(lines.log.join('\n')).not.toContain('using the game directory');
      expect(existsSync(join(homedir, MAC_GAME, 'Saves'))).toBe(false);
    });
  });

  it('works where the game cannot be found', async () => {
    await withWorkspace(workspace => {
      workspace.write('Save0', 'main.ts', GOOD);
      const result = runCommand(['--debug-build'], {
        root: workspace.root,
        output: capture().output,
        dependencies: { environment: { platform: 'freebsd', homedir: workspace.root } },
      });
      expect(result.exitCode).toBe(0);
      expect(existsSync(join(workspace.root, 'builds/Saves/Save0/main.py'))).toBe(true);
    });
  });

  it('cannot be combined with --game', async () => {
    await withWorkspace(workspace => {
      const { lines, output } = capture();
      const result = runCommand(['--debug-build', '--game', 'somewhere'], {
        root: workspace.root,
        output,
      });
      expect(result.exitCode).toBe(1);
      expect(lines.error[0]).toContain(
        "option '--debug-build' cannot be used with option '--game <dir>'",
      );
    });
  });

  it('is described in the usage', async () => {
    await withWorkspace(workspace => {
      const { lines, output } = capture();
      runCommand(['--help'], { root: workspace.root, output });
      expect(lines.log[0]).toContain('--debug-build');
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
      expect(lines.log[0]).toContain('Usage: the-typescript-farmer [options] [saves...]');
      expect(lines.log[0]).toContain('--watch');
      expect(lines.log[0]).toContain('--saves <dir>');
      expect(lines.log[0]).toContain('--game <dir>');
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
    const outputWatcher = [...watchers.entries()].find(([dir]) => dir.endsWith('/builds'))![1];
    built.length = 0;
    return { result, lines, built, savesWatcher, typesWatcher, outputWatcher, watchers };
  };

  it('starts watching after the first build', async () => {
    await withTimers(async () => {
      await withWorkspace(workspace => {
        workspace.write('one', 'main.ts', GOOD);
        const { result, lines, watchers } = setup(workspace);
        expect(result.exitCode).toBe(0);
        expect(lines.log).toContain('watching saves...');
        expect(watchers.size).toBe(3);
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
        expect(lines.log).toContain('removed builds/Saves/two/main.py');
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
          if (lines.log.includes('[one] wrote builds/Saves/one/main.py')) {
            break;
          }
          workspace.write('one', 'main.ts', `export const a = ${version};\n`);
          await new Promise(done => setTimeout(done, 100));
        }
        expect(lines.log).toContain('[one] wrote builds/Saves/one/main.py');
      } finally {
        result.stop();
      }
    });
  }, 30_000);
});

describe('copying the text files of the game', () => {
  // quick_print() makes the game write output.txt in its directory, which is `builds` by default.
  const writeGameFile = (workspace: Workspace, file: string, content: string) => {
    mkdirSync(join(workspace.root, 'builds'), { recursive: true });
    writeFileSync(join(workspace.root, 'builds', file), content);
  };
  const readLog = (workspace: Workspace, file: string) =>
    readFileSync(join(workspace.root, 'logs', file), 'utf8');

  const watching = (workspace: Workspace, args: string[] = []) => {
    const listeners = new Map<string, (filename: string | null) => void>();
    const recursive = new Map<string, boolean>();
    const closed: string[] = [];
    const { lines, output } = capture();
    const result = run(['--watch', ...args], {
      root: workspace.root,
      output,
      dependencies: {
        watch: (dir, listener, isRecursive) => {
          const name = dir.split('/').pop()!;
          listeners.set(name, listener);
          recursive.set(name, isRecursive);
          return { close: () => closed.push(name) };
        },
      },
    });
    lines.log.length = 0;
    return { result, lines, closed, recursive, game: listeners.get('builds')! };
  };

  const withTimers = async (test: () => void | Promise<void>) => {
    vi.useFakeTimers();
    try {
      await test();
    } finally {
      vi.useRealTimers();
    }
  };

  it('watches the game directory without its subdirectories', async () => {
    await withTimers(() =>
      withWorkspace(workspace => {
        workspace.write('one', 'main.ts', GOOD);
        const { recursive } = watching(workspace);
        expect(Object.fromEntries(recursive)).toEqual({ saves: true, farmer: true, builds: false });
      }),
    );
  });

  it('copies a text file of the game into the logs directory', async () => {
    await withTimers(() =>
      withWorkspace(workspace => {
        workspace.write('one', 'main.ts', GOOD);
        const { lines, game } = watching(workspace);

        writeGameFile(workspace, 'output.txt', 'hello\n');
        game('output.txt');
        expect(existsSync(join(workspace.root, 'logs/output.txt'))).toBe(false);
        vi.advanceTimersByTime(50);
        expect(readLog(workspace, 'output.txt')).toBe('hello\n');
        expect(lines.log).toEqual(['copied output.txt to logs/output.txt']);
      }),
    );
  });

  it('creates the logs directory and keeps what else is in it', async () => {
    await withTimers(() =>
      withWorkspace(workspace => {
        workspace.write('one', 'main.ts', GOOD);
        mkdirSync(join(workspace.root, 'logs'));
        writeFileSync(join(workspace.root, 'logs/kept.txt'), 'kept\n');
        const { game } = watching(workspace);

        writeGameFile(workspace, 'output.txt', 'new\n');
        game('output.txt');
        vi.advanceTimersByTime(50);
        expect(readLog(workspace, 'kept.txt')).toBe('kept\n');
        expect(readLog(workspace, 'output.txt')).toBe('new\n');
      }),
    );
  });

  it('copies the new content when the file changes', async () => {
    await withTimers(() =>
      withWorkspace(workspace => {
        workspace.write('one', 'main.ts', GOOD);
        const { lines, game } = watching(workspace);

        for (const content of ['first\n', 'second\n']) {
          writeGameFile(workspace, 'output.txt', content);
          game('output.txt');
          vi.advanceTimersByTime(50);
          expect(readLog(workspace, 'output.txt')).toBe(content);
        }
        expect(lines.log).toHaveLength(2);
      }),
    );
  });

  it('leaves a copy alone when the content is the same', async () => {
    await withTimers(() =>
      withWorkspace(workspace => {
        workspace.write('one', 'main.ts', GOOD);
        const { lines, game } = watching(workspace);
        writeGameFile(workspace, 'output.txt', 'same\n');
        game('output.txt');
        vi.advanceTimersByTime(50);
        const copy = join(workspace.root, 'logs/output.txt');
        // An old modification time shows that the file is not written again.
        utimesSync(copy, 1, 1);
        lines.log.length = 0;

        game('output.txt');
        vi.advanceTimersByTime(50);
        expect(lines.log).toEqual([]);
        expect(statSync(copy).mtimeMs).toBe(1000);
      }),
    );
  });

  it('copies several files in one go and a burst of changes only once', async () => {
    await withTimers(() =>
      withWorkspace(workspace => {
        workspace.write('one', 'main.ts', GOOD);
        const { lines, game } = watching(workspace);

        writeGameFile(workspace, 'output.txt', 'a\n');
        writeGameFile(workspace, 'notes.txt', 'b\n');
        game('output.txt');
        game('output.txt');
        vi.advanceTimersByTime(20);
        game('notes.txt');
        vi.advanceTimersByTime(49);
        expect(lines.log).toEqual([]);
        vi.advanceTimersByTime(1);
        expect(lines.log.toSorted()).toEqual([
          'copied notes.txt to logs/notes.txt',
          'copied output.txt to logs/output.txt',
        ]);
      }),
    );
  });

  it('ignores files that are not text files', async () => {
    await withTimers(() =>
      withWorkspace(workspace => {
        workspace.write('one', 'main.ts', GOOD);
        const { lines, game } = watching(workspace);

        writeGameFile(workspace, 'settings.json', '{}');
        writeGameFile(workspace, 'output.txt.bak', 'old\n');
        game('settings.json');
        game('output.txt.bak');
        game('Saves');
        game(null);
        vi.advanceTimersByTime(100);
        expect(lines.log).toEqual([]);
        expect(existsSync(join(workspace.root, 'logs'))).toBe(false);
      }),
    );
  });

  it('copies whichever saves are being built', async () => {
    await withTimers(() =>
      withWorkspace(workspace => {
        workspace.write('one', 'main.ts', GOOD);
        workspace.write('two', 'main.ts', GOOD);
        const { lines, game } = watching(workspace, ['one']);

        writeGameFile(workspace, 'output.txt', 'text\n');
        game('output.txt');
        vi.advanceTimersByTime(50);
        expect(lines.log).toEqual(['copied output.txt to logs/output.txt']);
      }),
    );
  });

  it('skips a file that is gone', async () => {
    await withTimers(() =>
      withWorkspace(workspace => {
        workspace.write('one', 'main.ts', GOOD);
        const { lines, game } = watching(workspace);

        game('output.txt');
        vi.advanceTimersByTime(100);
        expect(lines.log).toEqual([]);
        expect(lines.error).toEqual([]);
      }),
    );
  });

  it('reports a file it cannot copy and keeps going', async () => {
    await withTimers(() =>
      withWorkspace(workspace => {
        workspace.write('one', 'main.ts', GOOD);
        const { lines, game } = watching(workspace);

        writeGameFile(workspace, 'output.txt', 'text\n');
        // A directory in the way makes writing the copy fail.
        mkdirSync(join(workspace.root, 'logs/output.txt'), { recursive: true });
        game('output.txt');
        vi.advanceTimersByTime(50);
        expect(lines.error).toHaveLength(1);
        expect(lines.error[0]).toMatch(/^could not copy output\.txt: /);
      }),
    );
  });

  it('stops watching the game directory and cancels a pending copy', async () => {
    await withTimers(() =>
      withWorkspace(workspace => {
        workspace.write('one', 'main.ts', GOOD);
        const { result, lines, closed, game } = watching(workspace);

        writeGameFile(workspace, 'output.txt', 'text\n');
        game('output.txt');
        result.stop();
        vi.advanceTimersByTime(100);
        expect(lines.log).toEqual([]);
        expect(closed.toSorted()).toEqual(['builds', 'farmer', 'saves']);
      }),
    );
  });

  it('creates the game directory if it does not exist yet', async () => {
    await withWorkspace(workspace => {
      // There are no saves yet, so nothing was built into it.
      expect(existsSync(join(workspace.root, 'builds'))).toBe(false);
      const result = run(['--watch'], { root: workspace.root, output: capture().output });
      try {
        expect(existsSync(join(workspace.root, 'builds'))).toBe(true);
      } finally {
        result.stop();
      }
    });
  });

  it('copies a file the game really writes', async () => {
    await withWorkspace(async workspace => {
      workspace.write('one', 'main.ts', GOOD);
      const { lines, output } = capture();
      const result = run(['--watch'], { root: workspace.root, output });
      try {
        lines.log.length = 0;
        // The watcher can take a moment to start, so write until the copy is seen.
        for (let version = 1; version < 200; version++) {
          if (existsSync(join(workspace.root, 'logs/output.txt'))) {
            break;
          }
          writeGameFile(workspace, 'output.txt', `line ${version}\n`);
          await new Promise(done => setTimeout(done, 100));
        }
        expect(readLog(workspace, 'output.txt')).toMatch(/^line \d+\n$/);
        expect(lines.log.some(line => line.startsWith('copied output.txt'))).toBe(true);
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
