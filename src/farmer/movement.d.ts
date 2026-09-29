import type { Direction } from './entities';

/**
 * Moves the drone into the specified `direction` by one tile.
 * If the drone moves over the edge of the farm it wraps back to the other side of the farm.
 *
 * - `East ` = right
 * - `West ` = left
 * - `North` = up
 * - `South` = down
 *
 * takes `200` ticks to execute if the drone has moved, `1` tick otherwise.
 *
 * @returns `true` if the drone has moved, `false` otherwise.
 *
 * @example
 * ```ts
 * move(Direction.North);
 * ```
 */
export declare function move(direction: Direction): boolean;

/**
 * Checks if the drone can move in the specified `direction`.
 *
 * takes `1` tick to execute.
 *
 * @returns `true` if the drone can move, `false` otherwise.
 *
 * @example
 * ```ts
 * if (canMove(Direction.North)) {
 *   move(Direction.North);
 * }
 * ```
 */
export declare function canMove(direction: Direction): boolean;

/**
 * Gets the current x position of the drone.
 * The x position starts at `0` in the `West` and increases in the `East` direction.
 *
 * takes `1` tick to execute.
 *
 * @returns a number representing the current x coordinate of the drone.
 *
 * @example
 * ```ts
 * const [x, y] = [getPosX(), getPosY()];
 * ```
 */
export declare function getPosX(): number;

/**
 * Gets the current y position of the drone.
 * The y position starts at `0` in the `South` and increases in the `North` direction.
 *
 * takes `1` tick to execute.
 *
 * @returns a number representing the current y coordinate of the drone.
 *
 * @example
 * ```ts
 * const [x, y] = [getPosX(), getPosY()];
 * ```
 */
export declare function getPosY(): number;

/**
 * Get the current size of the farm.
 *
 * takes `1` tick to execute.
 *
 * @returns the side length of the grid in the north to south direction.
 *
 * @example
 * ```ts
 * for (let i = 0; i < getWorldSize(); i++) {
 *   move(Direction.North);
 * }
 * ```
 */
export declare function getWorldSize(): number;
