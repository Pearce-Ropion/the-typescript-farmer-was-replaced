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
  /** Calls `listener` with the path (relative to `dir`) of every file that changes in `dir`. */
  watch: (dir: string, listener: (filename: string | null) => void) => { close: () => void };
}

const defaultDependencies: Dependencies = {
  buildSaves,
  listSaves,
  pruneSaves,
  watch: (dir, listener) =>
    watch(dir, { recursive: true }, (_event, filename) => listener(filename)),
};

const noStop = () => {};

/** Where the text files of the game are copied to, in a save. It is git-ignored. */
const LOGS_DIRECTORY = 'logs';

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
    .option('--out <dir>', 'the directory the Python is written to', 'builds')
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
  const values = program.opts<{ watch: boolean; saves: string; out: string }>();
  const options: SavesOptions = {
    savesDir: resolve(root, values.saves),
    outDir: resolve(root, values.out),
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

  // The game writes text files next to its code (quick_print() writes output.txt). They are copied back into the
  // logs directory of the save, so they can be read next to the TypeScript.
  const pendingCopies = new Set<string>();
  let copyTimer: NodeJS.Timeout | undefined;
  const scheduleCopy = (save: string, file: string) => {
    pendingCopies.add(`${save}/${file}`);
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      for (const entry of pendingCopies) {
        const [copySave, copyFile] = entry.split('/');
        copyOutput(copySave, copyFile);
      }
      pendingCopies.clear();
    }, 50);
  };
  const copyOutput = (save: string, file: string) => {
    const from = join(options.outDir, save, file);
    const to = join(options.savesDir, save, LOGS_DIRECTORY, file);
    // The file or the save may be gone again by now.
    if (!existsSync(from) || !existsSync(join(options.savesDir, save))) {
      return;
    }
    try {
      const content = readFileSync(from);
      if (existsSync(to) && readFileSync(to).equals(content)) {
        return;
      }
      mkdirSync(dirname(to), { recursive: true });
      writeFileSync(to, content);
      output.log(`[${save}] copied ${file} to ${display(to)}`);
    } catch (error) {
      output.error(`[${save}] could not copy ${file}: ${(error as Error).message}`);
    }
  };

  // The output directory has to exist to be watched, and it only does once something was built into it.
  mkdirSync(options.outDir, { recursive: true });

  const watchers = [
    deps.watch(options.savesDir, filename => {
      // The first part of the path is the save the file belongs to.
      const [save, ...rest] = (filename ?? '').split(sep);
      if (
        rest.length &&
        filename?.endsWith('.ts') &&
        (!positionals.length || positionals.includes(save))
      ) {
        schedule([save]);
      }
    }),
    // The game's API declarations decide how names are translated, so changes to them affect every save.
    deps.watch(options.farmerDir, filename => {
      if (filename?.endsWith('.ts')) {
        schedule(selectedSaves());
      }
    }),
    deps.watch(options.outDir, filename => {
      // Only the text files directly in a save's directory: <save>/<name>.txt
      const [save, file, ...rest] = (filename ?? '').split(sep);
      if (
        file?.endsWith('.txt') &&
        !rest.length &&
        (!positionals.length || positionals.includes(save))
      ) {
        scheduleCopy(save, file);
      }
    }),
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
