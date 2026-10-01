import { spawnSync } from 'node:child_process';
import { globSync } from 'node:fs';
import { resolve } from 'node:path';

export interface WithSavesContext {
  /** The project directory. */
  root: string;
  error: (message: string) => void;
  /** Runs a command to completion and returns its exit status. */
  spawn?: (command: string, args: string[], cwd: string) => number | null;
  /** Finds the files matching a pattern, relative to `cwd`. */
  glob?: (pattern: string, cwd: string) => string[];
}

/**
 * Runs a tool of the project (`oxlint`, `oxfmt`) on the whole project, including the saves.
 *
 * The saves are ignored by git, and the tools skip git-ignored files when they search directories.
 * They do check files that are named explicitly though, so the files of the saves are passed by name.
 *
 * @returns the exit code for the process
 */
export function runWithSaves(args: string[], context: WithSavesContext): number {
  const spawn =
    context.spawn ??
    ((command, commandArgs, cwd) =>
      spawnSync(command, commandArgs, { cwd, stdio: 'inherit' }).status);
  const glob = context.glob ?? ((pattern, cwd) => globSync(pattern, { cwd }));

  const [tool, ...options] = args;
  if (!tool) {
    context.error('usage: node scripts/with-saves.ts <tool> [options...]');
    return 2;
  }

  const files = glob('saves/**/*.ts', context.root).toSorted();
  const status = spawn(
    resolve(context.root, 'node_modules/.bin', tool),
    [...options, '.', ...files],
    context.root,
  );
  return status ?? 1;
}
