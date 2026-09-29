import type { Direction, Entities, Grounds, Items } from './entities';

/**
 * Find out what kind of entity is under the drone.
 *
 * takes `1` tick to execute.
 *
 * @returns `null` if the tile is empty, otherwise returns the type of the entity under the drone.
 *
 * @example
 * ```ts
 * if (getEntityType() === Entities.Grass) {
 *   harvest();
 * }
 * ```
 */
export declare function getEntityType(): Entities | null;

/**
 * Find out what kind of ground is under the drone.
 *
 * takes `1` tick to execute.
 *
 * @returns the type of the ground under the drone.
 *
 * @example
 * ```ts
 * if (getGroundType() !== Grounds.Soil) {
 *   till();
 * }
 * ```
 */
export declare function getGroundType(): Grounds;

/**
 * Get the current water level under the drone.
 *
 * takes `1` tick to execute.
 *
 * @returns the water level under the drone as a number between `0` and `1`.
 *
 * @example
 * ```ts
 * if (getWater() < 0.5) {
 *   useItem(Items.Water);
 * }
 * ```
 */
export declare function getWater(): number;

/**
 * Find out how much of `item` you currently have.
 *
 * takes `1` tick to execute.
 *
 * @returns the number of `item` currently in your inventory. `Items.Power` may return a number as float
 *
 * @example
 * ```ts
 * if (numItems(Items.Fertilizer) > 0) {
 *   useItem(Items.Fertilizer);
 * }
 * ```
 */
export declare function numItems(item: Items): number;

/**
 * Get the companion preference of the plant under the drone.
 *
 * takes `1` tick to execute.
 *
 * @returns a tuple of the form `[companionType, [companionX, companionY]]` or `null` if there is no companion.
 *
 * @example
 * ```ts
 * const companion = getCompanion();
 * if (companion !== null) {
 *   const [plantType, [x, y]] = companion;
 *   print("Companion:", plantType, "at", x, ",", y);
 * }
 * ```
 */
export declare function getCompanion(): [Entities, [number, number]] | null;

/**
 * Can measure some values on some entities. The effect of this depends on the entity.
 * Will work anynore inside of a maze and only on a `Entities.Apple`
 *
 * overloads:
 * `measure()`: measures the entity under the drone.
 * `measure(direction)`: measures the neighboring entity in the `direction` of the drone.
 *
 * Sunflower: returns the number of petals.
 * Maze: returns the position of the current treasure from anywhere in the maze.
 * Cactus: returns the size.
 * Dinosaur: returns the number corresponding to the type.
 * All other entities: returns `null`.
 *
 * takes `1` tick to execute.
 * @example
 * ```ts
 * const numPetals = measure();
 * const treasurePos = measure();
 * ```
 */
export declare function measure(direction?: Direction): number | [number, number] | null;
