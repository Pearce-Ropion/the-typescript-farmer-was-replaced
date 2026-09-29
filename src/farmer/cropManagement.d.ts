import type { Direction, Entities, Hats, Items } from './entities';

/**
 * Harvests the entity under the drone.
 * If you harvest an entity that can't be harvested, it will be destroyed.
 *
 * takes `200` ticks to execute if an entity was removed, `1` tick otherwise.
 *
 * @returns `true` if an entity was removed, `false` otherwise.
 *
 * @example
 * ```ts
 * harvest();
 * ```
 */
export declare function harvest(): boolean;

/**
 * Used to find out if plants are fully grown.
 *
 * takes `1` tick to execute.
 *
 * @returns `true` if there is an entity under the drone that is ready to be harvested, `false` otherwise.
 *
 * @example
 * ```ts
 * if (canHarvest()) {
 *   harvest();
 * }
 * ```
 */
export declare function canHarvest(): boolean;

/**
 * Spends the cost of the specified `entity` and plants it under the drone.
 * It fails if you can't afford the plant, the ground type is wrong or there's already a plant there.
 *
 * takes `200` ticks to execute if it succeeded, `1` tick otherwise.
 *
 * @returns `true` if it succeeded, `false` otherwise.
 *
 * @example
 * ```ts
 * plant(Entities.Bush);
 * ```
 */
export declare function plant(entity: Entities): boolean;

/**
 * Swaps the entity under the drone with the entity next to the drone in the specified `direction`.
 *
 * - Doesn't work on all entities.
 * - Also works if one (or both) of the entities are `null`.
 *
 * takes `200` ticks to execute on success, `1` tick otherwise.
 *
 * @returns `true` if it succeeded, `false` otherwise.
 *
 * @example
 * ```ts
 * swap(Direction.North);
 * ```
 */
export declare function swap(direction: Direction): boolean;

/**
 * Tills the ground under the drone into soil. If it's already soil it will change the ground back to grassland.
 *
 * takes `200` ticks to execute.
 * @example
 * ```ts
 * till();
 * ```
 */
export declare function till(): void;

/**
 * Attempts to use the specified `item` `n` times. Can only be used with some items including `Items.Water`, `Items.Fertilizer` and `Items.Weird_Substance`.
 *
 * takes `200` ticks to execute if it succeeded, `1` tick otherwise.
 *
 * @returns `true` if an item was used, `false` if the item can't be used or you don't have enough.
 *
 * @example
 * ```ts
 * if (useItem(Items.Fertilizer)) {
 *   print("Fertilizer used successfully");
 * }
 * ```
 */
export declare function useItem(item: Items, n?: number): boolean;

/**
 * Removes everything from the farm, moves the drone back to position `(0,0)` and changes the hat back to the default.
 *
 * takes `200` ticks to execute.
 * @example
 * ```ts
 * clear();
 * ```
 */
export declare function clear(): void;

/**
 * Changes the hat of the drone to the specified `hat`.
 *
 * takes `200` ticks to execute.
 * @example
 * ```ts
 * changeHat(Hats.Dinosaur_Hat);
 * ```
 */
export declare function changeHat(hat: Hats): void;
