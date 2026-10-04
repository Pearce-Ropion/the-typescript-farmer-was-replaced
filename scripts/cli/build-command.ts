import { existsSync, mkdirSync, readFileSync, watch, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

import { Command, CommanderError } from 'commander';

import { buildSaves, listSaves, pruneSaves } from '../transpiler/project.ts';
import type { SavesOptions } from '../transpiler/project.ts';

export interface Output {
  log: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
}

/**
 * The parts of the outside world the command uses, so tests can replace them.
 */
export interface Dependencies {
  buildSaves: typeof buildSaves;
  listSaves: typeof listSaves;
  pruneSaves: typeof pruneSaves;
  /**
   * Calls `listener` with the path (relative to `dir`) of every file that changes in `dir`, and in the directories
   * inside it when `recursive` is true.
   */
  watch: (
    dir: string,
    listener: (filename: string | null) => void,
    recursive: boolean,
  ) => { close: () => void };
}

const defaultDependencies: Dependencies = {
  buildSaves,
  listSaves,
  pruneSaves,
  watch: (dir, listener, recursive) =>
    watch(dir, { recursive }, (_event, filename) => listener(filename)),
};

const noStop = () => {};

/** Where the text files of the game are copied to, in the project. It is git-ignored. */
const LOGS_DIRECTORY = 'logs';

/** The directory of the game that holds the code of the saves. */
const GAME_SAVES_DIRECTORY = 'Saves';

export interface RunContext {
  /** The project directory. Options that are paths are relative to it. */
  root: string;
  output: Output;
  dependencies?: Partial<Dependencies>;
}

export interface RunResult {
  /** The exit code for the process. In watch mode this is only the result of getting started. */
  exitCode: number;
  /** Stops watching. */
  stop: () => void;
}

/**
 * Transpiles the TypeScript of the saves to Python, once or whenever it changes.
 */
export function run(argv: string[], context: RunContext): RunResult {
  const { root, output } = context;
  const deps = { ...defaultDependencies, ...context.dependencies };
  const display = (path: string) => relative(root, path);

  const program = new Command()
    .name('the-typescript-farmer')
    .description(
      "Transpiles the TypeScript of each save in the saves directory to the game's Python.",
    )
    .argument('[saves...]', 'the saves to build (every save by default)')
    .option('-w, --watch', 'rebuild whenever a file changes', false)
    .option('--saves <dir>', 'the directory that contains the saves', 'saves')
    .option(
      '--game <dir>',
      "the game's directory: the Python goes to <dir>/Saves/<save>/ and the text files the game writes in <dir> are copied to logs/",
      'builds',
    )
    .exitOverride()
    .configureOutput({
      writeOut: text => output.log(text.trimEnd()),
      writeErr: text => output.error(text.trimEnd()),
    });

  try {
    program.parse(argv, { from: 'user' });
  } catch (error) {
    // Reached for --help and for invalid arguments, which commander has already reported.
    return { exitCode: (error as CommanderError).exitCode, stop: noStop };
  }

  const positionals: string[] = program.args;
  const values = program.opts<{ watch: boolean; saves: string; game: string }>();
  const gameDir = resolve(root, values.game);
  const options: SavesOptions = {
    savesDir: resolve(root, values.saves),
    outDir: join(gameDir, GAME_SAVES_DIRECTORY),
    farmerDir: resolve(root, 'types/farmer'),
  };

  const unknown = positionals.filter(save => !existsSync(resolve(options.savesDir, save)));
  const problem = unknown.length
    ? `no such save: ${unknown.join(', ')} (looked in ${display(options.savesDir)})`
    : !existsSync(options.savesDir)
      ? `${display(options.savesDir)} does not exist`
      : null;
  if (problem) {
    output.error(`error: ${problem}`);
    return { exitCode: 1, stop: noStop };
  }

  /** The saves to build: the ones named on the command line, otherwise every save. */
  const selectedSaves = () => (positionals.length ? positionals : deps.listSaves(options.savesDir));

  const buildOnce = (saves: string[]): boolean => {
    try {
      return buildAll(saves);
    } catch (error) {
      // Don't let an unexpected failure (such as an unreadable folder) end the watcher.
      output.error(
        `error ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
      );
      return false;
    }
  };

  const buildAll = (saves: string[]): boolean => {
    let ok = true;
    if (!positionals.length) {
      for (const file of deps.pruneSaves(options)) {
        output.log(`removed ${display(file)}`);
      }
    }
    for (const save of saves) {
      const started = performance.now();
      const tag = `[${save}]`;
      const [{ result }] = deps.buildSaves(options, [save]);
      for (const file of result.written) {
        output.log(`${tag} wrote ${display(file)}`);
      }
      for (const file of result.removed) {
        output.log(`${tag} removed ${display(file)}`);
      }
      for (const error of result.errors) {
        output.error(`${tag} error ${error.message}`);
        if (error.cause instanceof Error) {
          output.error(String(error.cause.stack));
        }
      }
      for (const file of result.skipped) {
        output.warn(
          `${tag} skipped ${display(file.path)}: it imports ${file.because}, which has errors`,
        );
      }
      for (const file of result.stale) {
        output.warn(
          `${tag} warning ${display(file)} is out of date: its source has errors, so the previous version was kept`,
        );
      }
      const elapsed = Math.round(performance.now() - started);
      const status = result.errors.length ? `${result.errors.length} error(s)` : 'ok';
      output.log(`${tag} built ${status} in ${elapsed}ms`);
      ok &&= result.errors.length === 0;
    }
    return ok;
  };

  const initialSaves = selectedSaves();
  if (!initialSaves.length) {
    output.warn(`no saves found in ${display(options.savesDir)}`);
  }
  const ok = buildOnce(initialSaves);
  if (!values.watch) {
    return { exitCode: ok ? 0 : 1, stop: noStop };
  }

  output.log(`watching ${display(options.savesDir)}...`);
  const pending = new Set<string>();
  let timer: NodeJS.Timeout | undefined;
  const schedule = (saves: string[]) => {
    saves.forEach(save => pending.add(save));
    clearTimeout(timer);
    timer = setTimeout(() => {
      // A save that was deleted has nothing left to build, but its output has to go.
      const existing = [...pending].filter(save => existsSync(resolve(options.savesDir, save)));
      pending.clear();
      buildOnce(existing);
    }, 50);
  };

  // quick_print() makes the game write output.txt in its directory, one level above the saves. Which save printed
  // it isn't known, so the text files are copied into one logs directory for the whole project.
  const pendingCopies = new Set<string>();
  let copyTimer: NodeJS.Timeout | undefined;
  const scheduleCopy = (file: string) => {
    pendingCopies.add(file);
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      pendingCopies.forEach(copyOutput);
      pendingCopies.clear();
    }, 50);
  };
  const copyOutput = (file: string) => {
    const from = join(gameDir, file);
    const to = join(root, LOGS_DIRECTORY, file);
    // The file may be gone again by now.
    if (!existsSync(from)) {
      return;
    }
    try {
      const content = readFileSync(from);
      if (existsSync(to) && readFileSync(to).equals(content)) {
        return;
      }
      mkdirSync(dirname(to), { recursive: true });
      writeFileSync(to, content);
      output.log(`copied ${file} to ${display(to)}`);
    } catch (error) {
      output.error(`could not copy ${file}: ${(error as Error).message}`);
    }
  };

  // The game's directory has to exist to be watched, and it only does once something was built into it.
  mkdirSync(gameDir, { recursive: true });

  const watchers = [
    deps.watch(
      options.savesDir,
      filename => {
        // The first part of the path is the save the file belongs to.
        const [save, ...rest] = (filename ?? '').split(sep);
        if (
          rest.length &&
          filename?.endsWith('.ts') &&
          (!positionals.length || positionals.includes(save))
        ) {
          schedule([save]);
        }
      },
      true,
    ),
    // The game's API declarations decide how names are translated, so changes to them affect every save.
    deps.watch(
      options.farmerDir,
      filename => {
        if (filename?.endsWith('.ts')) {
          schedule(selectedSaves());
        }
      },
      true,
    ),
    // Only the text files directly in the game's directory, which is why it isn't watched recursively.
    deps.watch(
      gameDir,
      filename => {
        if (filename?.endsWith('.txt')) {
          scheduleCopy(filename);
        }
      },
      false,
    ),
  ];

  return {
    exitCode: 0,
    stop: () => {
      clearTimeout(timer);
      clearTimeout(copyTimer);
      watchers.forEach(watcher => watcher.close());
    },
  };
}
