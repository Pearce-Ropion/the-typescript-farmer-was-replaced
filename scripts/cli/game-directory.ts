import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The parts of the operating system that decide where the game is.
 */
export interface Environment {
  platform: NodeJS.Platform;
  homedir: string;
}

/** The id of the game on Steam, which names its directory in a Steam installation on Linux (Proton). */
const STEAM_APP_ID = '2060160';

/** Where the game keeps its data on Windows, and on Linux inside the Proton prefix. */
const WINDOWS_GAME_DIRECTORY = join(
  'AppData',
  'LocalLow',
  'TheFarmerWasReplaced',
  'TheFarmerWasReplaced',
);

/** The places a Steam installation commonly is on Linux, relative to the home directory. */
const STEAM_DIRECTORIES = [join('.local', 'share', 'Steam'), join('.steam', 'debian-installation')];

export type GameDirectory = { directory: string } | { error: string };

const NOT_FOUND_HELP =
  'Run the game once so that it creates it, or pass the directory with --game.';

/**
 * Finds the directory the game keeps its data in (the one with `Saves` in it) on this operating system.
 * The directory has to exist, so that a build never creates a game directory in the wrong place.
 */
export function defaultGameDirectory({ platform, homedir }: Environment): GameDirectory {
  switch (platform) {
    case 'darwin': {
      const directory = join(
        homedir,
        'Library',
        'Application Support',
        'com.TheFarmerWasReplaced.TheFarmerWasReplaced',
      );
      return existsSync(directory)
        ? { directory }
        : { error: `The game's directory was not found at ${directory}. ${NOT_FOUND_HELP}` };
    }
    case 'win32': {
      const directory = join(homedir, WINDOWS_GAME_DIRECTORY);
      return existsSync(directory)
        ? { directory }
        : { error: `The game's directory was not found at ${directory}. ${NOT_FOUND_HELP}` };
    }
    case 'linux': {
      // The game runs through Proton, which has a Windows home directory inside the compatibility data of Steam.
      const candidates = STEAM_DIRECTORIES.map(steam =>
        join(
          homedir,
          steam,
          'steamapps',
          'compatdata',
          STEAM_APP_ID,
          'pfx',
          'drive_c',
          'users',
          'steamuser',
          WINDOWS_GAME_DIRECTORY,
        ),
      );
      const directory = candidates.find(candidate => existsSync(candidate));
      return directory
        ? { directory }
        : {
            error: `The game's directory was not found. Looked in:\n${candidates.map(candidate => `  ${candidate}`).join('\n')}\n${NOT_FOUND_HELP}`,
          };
    }
    default:
      return {
        error: `There is no default game directory for ${platform}. Pass the directory with --game.`,
      };
  }
}

/**
 * The directory that holds the code of the saves in the game's directory: `Saves`, or `Saves/user` where the game
 * keeps them there (on Windows, and on Linux through Proton, according to the game's players).
 */
export function savesDirectoryOf(gameDirectory: string): string {
  const saves = join(gameDirectory, 'Saves');
  const user = join(saves, 'user');
  return existsSync(user) ? user : saves;
}
