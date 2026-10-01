import { root } from '../../transpiler/__tests__/helpers.ts';
import { runWithSaves } from '../with-saves-command.ts';

describe('runWithSaves', () => {
  const run = (args: string[], overrides: Partial<Parameters<typeof runWithSaves>[1]> = {}) => {
    const errors: string[] = [];
    const calls: { command: string; args: string[]; cwd: string }[] = [];
    const exitCode = runWithSaves(args, {
      root: '/project',
      error: message => errors.push(message),
      spawn: (command, commandArgs, cwd) => {
        calls.push({ command, args: commandArgs, cwd });
        return 0;
      },
      glob: () => ['saves/two/b.ts', 'saves/one/main.ts', 'saves/one/a.ts'],
      ...overrides,
    });
    return { exitCode, errors, calls };
  };

  it('explains how to use it when no tool is named', () => {
    const { exitCode, errors, calls } = run([]);
    expect(exitCode).toBe(2);
    expect(errors).toEqual(['usage: node scripts/with-saves.ts <tool> [options...]']);
    expect(calls).toEqual([]);
  });

  it('runs the tool on the project and on the files of the saves, by name', () => {
    const { exitCode, calls } = run(['oxlint', '--type-aware']);
    expect(exitCode).toBe(0);
    expect(calls).toEqual([
      {
        command: '/project/node_modules/.bin/oxlint',
        args: ['--type-aware', '.', 'saves/one/a.ts', 'saves/one/main.ts', 'saves/two/b.ts'],
        cwd: '/project',
      },
    ]);
  });

  it('only passes the project when there are no saves', () => {
    expect(run(['oxfmt'], { glob: () => [] }).calls[0].args).toEqual(['.']);
  });

  it('exits with the code of the tool', () => {
    expect(run(['oxlint'], { spawn: () => 3 }).exitCode).toBe(3);
  });

  it('fails when the tool could not be started', () => {
    expect(run(['oxlint'], { spawn: () => null }).exitCode).toBe(1);
  });

  it('really runs tools and finds the saves by default', () => {
    const errors: string[] = [];
    const context = { root, error: (message: string) => errors.push(message) };
    expect(runWithSaves(['oxlint', '--version'], context)).toBe(0);
    expect(runWithSaves(['oxlint', '--no-such-option'], context)).not.toBe(0);
    expect(runWithSaves(['no-such-tool'], context)).toBe(1);
    expect(errors).toEqual([]);
  });
});
