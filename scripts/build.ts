import { existsSync, watch } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { buildSaves, listSaves, pruneSaves } from './transpiler/project.ts';
import type { SavesOptions } from './transpiler/project.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    watch: { type: 'boolean', short: 'w', default: false },
    saves: { type: 'string', default: 'saves' },
    out: { type: 'string', default: 'builds' },
  },
});

const options: SavesOptions = {
  savesDir: resolve(root, values.saves),
  outDir: resolve(root, values.out),
  farmerDir: resolve(root, 'types/farmer'),
};

const display = (path: string) => relative(root, path);

/**
 * The saves to build: the ones named on the command line, otherwise every save.
 */
function selectedSaves(): string[] {
  return positionals.length ? positionals : listSaves(options.savesDir);
}

const unknown = positionals.filter(save => !existsSync(resolve(options.savesDir, save)));
if (unknown.length) {
  console.error(
    `error no such save: ${unknown.join(', ')} (looked in ${display(options.savesDir)})`,
  );
  process.exit(1);
}
if (!existsSync(options.savesDir)) {
  console.error(`error ${display(options.savesDir)} does not exist`);
  process.exit(1);
}

function build(saves: string[]): boolean {
  try {
    return runBuild(saves);
  } catch (error) {
    // Don't let an unexpected failure (such as an unreadable folder) end the watcher.
    console.error(`error ${error instanceof Error ? (error.stack ?? error.message) : error}`);
    return false;
  }
}

function runBuild(saves: string[]): boolean {
  let ok = true;
  if (!positionals.length) {
    for (const file of pruneSaves(options)) {
      console.log(`removed ${display(file)}`);
    }
  }
  for (const save of saves) {
    const started = performance.now();
    const tag = `[${save}]`;
    const [{ result }] = buildSaves(options, [save]);
    for (const file of result.written) {
      console.log(`${tag} wrote ${display(file)}`);
    }
    for (const file of result.removed) {
      console.log(`${tag} removed ${display(file)}`);
    }
    for (const error of result.errors) {
      console.error(`${tag} error ${error.message}`);
      if (error.cause instanceof Error) {
        console.error(error.cause.stack);
      }
    }
    for (const file of result.skipped) {
      console.warn(
        `${tag} skipped ${display(file.path)}: it imports ${file.because}, which has errors`,
      );
    }
    for (const file of result.stale) {
      console.warn(
        `${tag} warning ${display(file)} is out of date: its source has errors, so the previous version was kept`,
      );
    }
    const elapsed = Math.round(performance.now() - started);
    const status = result.errors.length ? `${result.errors.length} error(s)` : 'ok';
    console.log(`${tag} built ${status} in ${elapsed}ms`);
    ok &&= result.errors.length === 0;
  }
  return ok;
}

const initialSaves = selectedSaves();
if (!initialSaves.length) {
  console.warn(`no saves found in ${display(options.savesDir)}`);
}
const ok = build(initialSaves);

if (values.watch) {
  console.log(`watching ${display(options.savesDir)}...`);
  const pending = new Set<string>();
  let timer: NodeJS.Timeout | undefined;
  const schedule = (saves: string[]) => {
    saves.forEach(save => pending.add(save));
    clearTimeout(timer);
    timer = setTimeout(() => {
      const saves = [...pending].filter(save => existsSync(resolve(options.savesDir, save)));
      pending.clear();
      // A save that was deleted has nothing left to build, but its output has to go.
      build(saves);
    }, 50);
  };
  watch(options.savesDir, { recursive: true }, (_event, filename) => {
    // The first part of the path is the save the file belongs to.
    const [save, ...rest] = (filename ?? '').split(sep);
    if (
      rest.length &&
      filename?.endsWith('.ts') &&
      (!positionals.length || positionals.includes(save))
    ) {
      schedule([save]);
    }
  });
  // The game's API declarations decide how names are translated, so changes to them affect every save.
  watch(options.farmerDir, { recursive: true }, (_event, filename) => {
    if (filename?.endsWith('.ts')) {
      schedule(selectedSaves());
    }
  });
} else if (!ok) {
  process.exitCode = 1;
}
