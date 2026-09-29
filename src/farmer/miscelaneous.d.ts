import type { Leaderboards } from './entities';

/**
 * Makes the drone do a flip! This action is not affected by speed upgrades.
 *
 * takes 1s to execute.
 * @example
 * ```ts
 * while (true) {
 *   doAFlip();
 * }
 * ```
 */
export declare function doAFlip(): void;

/**
 * Pets the piggy! This action is not affected by speed upgrades.
 *
 * takes 1s to execute.
 * @example
 * ```ts
 * while (true) {
 *   petThePiggy();
 * }
 * ```
 */
export declare function petThePiggy(): void;

/**
 * Starts a timed run for the `leaderboard` using the specified `fileName` as a starting point.
 * `speedup` sets the starting speedup.
 *
 * takes `200` ticks to execute.
 * @example
 * ```ts
 * leaderboardRun(Leaderboards.Fastest_Reset, "full_run", 256);
 * ```
 */
export declare function leaderboardRun(
  leaderboard: Leaderboards,
  fileName: string,
  speedup: number,
): void;
