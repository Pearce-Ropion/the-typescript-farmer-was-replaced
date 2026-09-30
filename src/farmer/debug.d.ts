import type { Items, Unlocks } from './entities';

/**
 * Get the current game time.
 *
 * takes `0` tick to execute.
 *
 * @returns the time in seconds since the start of the game.
 *
 * @example
 * ```ts
 * const start = getTime();
 * doSomething();
 * const timePassed = getTime() - start;
 * ```
 */
export declare function getTime(): number;

/**
 * Used to measure the number of ticks performed.
 *
 * takes `0` tick to execute.
 *
 * @returns the number of ticks performed since the start of execution.
 *
 * @example
 * ```ts
 * doSomething();
 * print(getTickCount());
 * ```
 */
export declare function getTickCount(): number;

/**
 * Limits the speed at which the program is executed to better see what's happening.
 *
 * - A `speed` of `1` is the speed the drone has without any speed upgrades.
 * - A `speed` of `10` makes the code execute `10` times faster and corresponds to the speed of the drone after `9` speed upgrades.
 * - A `speed` of `0.5` makes the code execute at half of the speed without speed upgrades. This can be useful to see what the code is doing.
 *
 * If `speed` is faster than the execution can currently go it will just go at max speed.
 *
 * If `speed` is `0` or negative, the speed is changed back to max speed.
 * The effect will also stop when the execution stops.
 *
 * takes `200` ticks to execute.
 * @example
 * ```ts
 * setExecutionSpeed(1);
 * ```
 */
export declare function setExecutionSpeed(speed: number): void;

/**
 * Limits the size of the farm to better see what's happening.
 * Also clears the farm and resets the drone position.
 *
 * - Sets the farm to a `size` x `size` grid.
 * - The smallest `size` possible is `3`.
 * - A `size` smaller than `3` will change the grid back to its full size.
 * - The effect will also stop when the execution stops.
 *
 * takes `200` ticks to execute.
 * @example
 * ```ts
 * setWorldSize(5);
 * ```
 */
export declare function setWorldSize(size: number): void;

/**
 * Starts a simulation for the leaderboard using the specified `fileName` as a starting point.
 *
 * `simUnlocks`: A sequence containing the starting unlocks. These unlocks can be one of these:
 *
 * - `Partial<Record<Unlocks, number>>` - Example: `{ [Unlocks.Expand]: 2, [Unlocks.Cactus]: 1 }`
 * - `readonly (readonly [Unlocks, number])[]` - Example: `[[Unlocks.Expand, 2], [Unlocks.Cactus, 1]]`
 * - `readonly Unlocks[]` - Captures your current unlock level of specific unlocks from your main farm. Example: `[Unlocks.Expand, Unlocks.Cactus]`
 * - `typeof Unlocks` - Captures all of your current unlock levels from your main farm.
 *
 * `simItems`: An object mapping items to amounts. The simulation starts with these items.
 *
 * `simGlobals`: An object mapping variable names to values. The simulation starts with these variables in the global scope. Make sure any variables assigned in here are not assigned in the simulation code as that will override the vales from this object.
 *
 * `seed`: The random seed of the simulation. Must be a positive integer.
 *
 * `speedup`: The starting speedup. The simulation may not reach the stated `speedup` value if it cannot properly speedup computation. Common causes for this include use of multiple drones or eating up too many ticks in a loop per iteration (for example a wait loop using pass).
 *
 * takes `200` ticks to execute.
 *
 * @param filename The file used as the starting point of the simulation.
 * @param simUnlocks The starting unlocks, see above for the accepted forms.
 * @param simItems A map of items to amounts. The simulation starts with these items.
 * @param simGlobals A map of variable names to values. The simulation starts with these variables in the global scope.
 * @param seed The random seed of the simulation. Must be a positive integer.
 * @param speedup The starting speedup.
 * @returns the time it took to run the simulation.
 *
 * @example
 * ```ts
 * const filename = "f1";
 * const simUnlocks = Unlocks;
 * const simItems = { [Items.Carrot]: 10000, [Items.Hay]: 50 };
 * const simGlobals = { a: 13 };
 * const seed = 0;
 * const speedup = 64;
 * const runTime = simulate(filename, simUnlocks, simItems, simGlobals, seed, speedup);
 * ```
 */
export declare function simulate(
  filename: string,
  simUnlocks: SimulateUnlocks,
  simItems: Partial<Record<Items, number>>,
  simGlobals: Record<string, unknown>,
  seed: number,
  speedup: number,
): number;

/**
 * The accepted forms for the starting unlocks of a simulation.
 */
export type SimulateUnlocks =
  | Partial<Record<Unlocks, number>>
  | readonly (readonly [Unlocks, number])[]
  | readonly Unlocks[]
  | typeof Unlocks;
