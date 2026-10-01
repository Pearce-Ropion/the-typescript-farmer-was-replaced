import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { loadFarmerInfo } from './farmer.ts';
import { transpileProject } from './transpile.ts';
import type { SkippedFile, SourceFile, TranspileError } from './transpile.ts';

const GENERATED_MARKER = '# Generated from TypeScript.';

export interface BuildOptions {
  /** Directory containing the TypeScript game code. */
  srcDir: string;
  /** Directory the Python files are written to. */
  outDir: string;
  /** Directory containing the declarations of the game's API. */
  farmerDir: string;
}

export interface BuildResult {
  written: string[];
  removed: string[];
  errors: TranspileError[];
  /** Files that weren't transpiled because a module they import has a syntax error. */
  skipped: SkippedFile[];
  /**
   * Python files left over from an earlier build because their source couldn't be transpiled this time.
   * The game would still run the old version of them.
   */
  stale: string[];
}

function readSources(srcDir: string): SourceFile[] {
  return readdirSync(srcDir)
    .filter(file => file.endsWith('.ts') && !file.endsWith('.d.ts') && !file.endsWith('.test.ts'))
    .map(file => ({
      name: basename(file, '.ts'),
      path: join(srcDir, file),
      source: readFileSync(join(srcDir, file), 'utf8'),
    }));
}

/**
 * Transpiles every TypeScript file in `srcDir` to a Python file in `outDir`.
 * Files that fail to transpile keep their previous output.
 */
export function buildProject(options: BuildOptions): BuildResult {
  const farmer = loadFarmerInfo(options.farmerDir);
  const sources = readSources(options.srcDir);
  const { outputs, errors, skipped } = transpileProject(sources, farmer);

  mkdirSync(options.outDir, { recursive: true });

  const written: string[] = [];
  for (const output of outputs) {
    const target = join(options.outDir, `${output.name}.py`);
    if (!existsSync(target) || readFileSync(target, 'utf8') !== output.code) {
      writeFileSync(target, output.code);
      written.push(target);
    }
  }

  // Remove generated files whose source has been deleted.
  const sourceNames = new Set(sources.map(source => source.name));
  const removed: string[] = [];
  for (const file of readdirSync(options.outDir)) {
    const target = join(options.outDir, file);
    if (
      file.endsWith('.py') &&
      !sourceNames.has(basename(file, '.py')) &&
      readFileSync(target, 'utf8').startsWith(GENERATED_MARKER)
    ) {
      rmSync(target);
      removed.push(target);
    }
  }

  const rebuilt = new Set(outputs.map(output => output.name));
  const stale = sources
    .filter(source => !rebuilt.has(source.name))
    .map(source => join(options.outDir, `${source.name}.py`))
    .filter(target => existsSync(target));
  return { written, removed, errors, skipped, stale };
}

export interface SavesOptions {
  /** Directory containing one directory of TypeScript per save. */
  savesDir: string;
  /** Directory the Python of each save is written to, in a directory of the save's name. */
  outDir: string;
  /** Directory containing the declarations of the game's API. */
  farmerDir: string;
}

/**
 * The saves in a directory: each of its directories is a save.
 */
export function listSaves(savesDir: string): string[] {
  if (!existsSync(savesDir)) {
    return [];
  }
  return readdirSync(savesDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
    .map(entry => entry.name)
    .toSorted();
}

export interface SaveResult {
  save: string;
  result: BuildResult;
}

/**
 * Builds the given saves (every save by default), each into its own directory of `outDir`.
 */
export function buildSaves(
  options: SavesOptions,
  saves: string[] = listSaves(options.savesDir),
): SaveResult[] {
  return saves.map(save => ({
    save,
    result: buildProject({
      srcDir: join(options.savesDir, save),
      outDir: join(options.outDir, save),
      farmerDir: options.farmerDir,
    }),
  }));
}

/**
 * Removes the generated Python of saves that no longer exist.
 */
export function pruneSaves(options: SavesOptions): string[] {
  if (!existsSync(options.outDir)) {
    return [];
  }
  const existing = new Set(listSaves(options.savesDir));
  const removed: string[] = [];
  for (const entry of readdirSync(options.outDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || existing.has(entry.name)) {
      continue;
    }
    const dir = join(options.outDir, entry.name);
    for (const file of readdirSync(dir)) {
      const target = join(dir, file);
      if (file.endsWith('.py') && readFileSync(target, 'utf8').startsWith(GENERATED_MARKER)) {
        rmSync(target);
        removed.push(target);
      }
    }
    // Only remove the directory if nothing else lives in it.
    if (readdirSync(dir).length === 0) {
      rmSync(dir, { recursive: true });
    }
  }
  return removed;
}
