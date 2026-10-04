import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { defaultGameDirectory, savesDirectoryOf } from '../game-directory.ts';

/** A home directory with the given directories in it, which is removed afterwards. */
const withHome = (directories: string[], run: (homedir: string) => void) => {
  const homedir = mkdtempSync(join(tmpdir(), 'farm-home-'));
  try {
    for (const directory of directories) {
      mkdirSync(join(homedir, directory), { recursive: true });
    }
    run(homedir);
  } finally {
    rmSync(homedir, { recursive: true, force: true });
  }
};

const MAC = join('Library', 'Application Support', 'com.TheFarmerWasReplaced.TheFarmerWasReplaced');
const WINDOWS = join('AppData', 'LocalLow', 'TheFarmerWasReplaced', 'TheFarmerWasReplaced');
const PROTON = join(
  'steamapps',
  'compatdata',
  '2060160',
  'pfx',
  'drive_c',
  'users',
  'steamuser',
  WINDOWS,
);
const LOCAL_STEAM = join('.local', 'share', 'Steam', PROTON);
const DEBIAN_STEAM = join('.steam', 'debian-installation', PROTON);

describe('defaultGameDirectory', () => {
  it('finds the directory of the game on macOS', () => {
    withHome([MAC], homedir => {
      expect(defaultGameDirectory({ platform: 'darwin', homedir })).toEqual({
        directory: join(homedir, MAC),
      });
    });
  });

  it('finds the directory of the game on Windows', () => {
    withHome([WINDOWS], homedir => {
      expect(defaultGameDirectory({ platform: 'win32', homedir })).toEqual({
        directory: join(homedir, WINDOWS),
      });
    });
  });

  it('finds the directory of the game in the Proton prefix of Steam on Linux', () => {
    withHome([LOCAL_STEAM], homedir => {
      expect(defaultGameDirectory({ platform: 'linux', homedir })).toEqual({
        directory: join(homedir, LOCAL_STEAM),
      });
    });
    withHome([DEBIAN_STEAM], homedir => {
      expect(defaultGameDirectory({ platform: 'linux', homedir })).toEqual({
        directory: join(homedir, DEBIAN_STEAM),
      });
    });
  });

  it('prefers the first Steam installation if there are two', () => {
    withHome([LOCAL_STEAM, DEBIAN_STEAM], homedir => {
      expect(defaultGameDirectory({ platform: 'linux', homedir })).toEqual({
        directory: join(homedir, LOCAL_STEAM),
      });
    });
  });

  it.each(['darwin', 'win32'] as const)(
    'says where it looked when there is no directory on %s',
    platform => {
      withHome([], homedir => {
        const found = defaultGameDirectory({ platform, homedir });
        expect(found).toHaveProperty('error');
        const { error } = found as { error: string };
        expect(error).toContain(`was not found at ${homedir}`);
        expect(error).toContain('Run the game once');
        expect(error).toContain('--game');
      });
    },
  );

  it('lists the places it looked when there is no directory on Linux', () => {
    withHome([], homedir => {
      const { error } = defaultGameDirectory({ platform: 'linux', homedir }) as { error: string };
      expect(error).toContain("The game's directory was not found. Looked in:");
      expect(error).toContain(`  ${join(homedir, LOCAL_STEAM)}`);
      expect(error).toContain(`  ${join(homedir, DEBIAN_STEAM)}`);
      expect(error).toContain('--game');
    });
  });

  it('does not guess for other platforms', () => {
    withHome([], homedir => {
      expect(defaultGameDirectory({ platform: 'freebsd', homedir })).toEqual({
        error: 'There is no default game directory for freebsd. Pass the directory with --game.',
      });
    });
  });
});

describe('savesDirectoryOf', () => {
  it('uses the Saves directory of the game', () => {
    withHome(['game'], home => {
      expect(savesDirectoryOf(join(home, 'game'))).toBe(join(home, 'game', 'Saves'));
    });
    withHome(['game/Saves'], home => {
      expect(savesDirectoryOf(join(home, 'game'))).toBe(join(home, 'game', 'Saves'));
    });
  });

  it('uses Saves/user when the game keeps its saves there', () => {
    withHome(['game/Saves/user'], home => {
      expect(savesDirectoryOf(join(home, 'game'))).toBe(join(home, 'game', 'Saves', 'user'));
    });
  });
});
