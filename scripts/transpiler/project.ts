import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { loadFarmerInfo } from './farmer.ts';
import { transpileProject } from './transpile.ts';
import type { SourceFile, TranspileError } from './transpile.ts';

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
  const { outputs, errors } = transpileProject(sources, farmer);

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
  return { written, removed, errors };
}
