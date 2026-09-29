/**
 * A spawned drone that was given a task to execute.
 */
export interface Drone<R = unknown> {
  readonly __result?: R;
}

/**
 * Spawns a new drone in the same position as the drone that ran `spawnDrone(task, ...args)`. The new drone then begins executing the specified `task` function. The rest of the arguments are copied and passed into the specified function. After the drone is done, it will disappear automatically.
 *
 * takes `200` ticks to execute if a drone was spawned, `1` otherwise.
 *
 * @returns a `Drone` object for the new drone or `null` if all drones are already spawned.
 *
 * @example
 * ```ts
 * function harvestColumn(message: number): void {
 *   for (let row = 0; row < getWorldSize(); row++) {
 *     harvest();
 *     move(Direction.North);
 *   }
 *   print(message);
 * }
 *
 * let i = 0;
 * while (true) {
 *   if (spawnDrone(harvestColumn, i)) {
 *     move(Direction.East);
 *     i = (i + 1) % 10;
 *   }
 * }
 * ```
 */
export declare function spawnDrone<A extends unknown[], R>(
  task: (...args: A) => R,
  ...args: A
): Drone<R> | null;

/**
 * Waits until the given `drone` terminates.
 *
 * takes `1 + remaining task ticks` remaining in the given drone's task function.
 * takes `1` tick to execute if the awaited `drone` is already done.
 *
 * @returns the return value of the function that the `drone` was running.
 *
 * @example
 * ```ts
 * function getEntityTypeInDirection(dir: Direction): Entities | null {
 *   move(dir);
 *   return getEntityType();
 * }
 *
 * const handle = spawnDrone(() => getEntityTypeInDirection(Direction.North));
 * if (handle !== null) {
 *   print(waitFor(handle));
 * }
 * ```
 */
export declare function waitFor<R>(drone: Drone<R>): R;

/**
 * Checks if the given 1drone1 has finished.
 *
 * takes `1` tick to execute.
 *
 * @returns `true` if the drone has finished, `false` otherwise.
 *
 * @example
 * ```ts
 * const drone = spawnDrone(someFunction);
 * if (drone !== null) {
 *   while (!hasFinished(drone)) {
 *     doSomethingElse();
 *   }
 *   const result = waitFor(drone);
 * }
 * ```
 */
export declare function hasFinished(drone: Drone): boolean;

/**
 * Gets the maximum number of drones available on the farm.
 *
 * takes `1` tick to execute.
 *
 * @returns the maximum number of drones that you can have in the farm.
 *
 * @example
 * ```ts
 * while (numDrones() < maxDrones()) {
 *   spawnDrone(someFunction);
 *   move(Direction.East);
 * }
 * ```
 */
export declare function maxDrones(): number;

/**
 * Gets the current number of drones running a task on the farm.
 *
 * takes `1` tick to execute.
 *
 * @returns the number of drones currently in the farm.
 *
 * @example
 * ```ts
 * while (numDrones() < maxDrones()) {
 *   spawnDrone(someFunction);
 *   move(Direction.East);
 * }
 * ```
 */
export declare function numDrones(): number;
