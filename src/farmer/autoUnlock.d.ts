import type { Entities, Grounds, Hats, Items, Leaderboards, Unlocks } from './entities';

/**
 * Gets the cost of a `thing`
 *
 * If `thing` is an entity: get the cost of planting it.
 * If `thing` is an unlock: get the cost of unlocking it at the specified level.
 *
 * - returns a dictionary with items as keys and numbers as values. Each item is mapped to how much of it is needed.
 * - returns `null` for unlocks that are already unlocked (when no level specified).
 * - The optional `level` parameter specifies the upgrade level for unlocks.
 *
 * takes `1` tick to execute.
 * @example
 * ```ts
 * const cost = getCost(Unlocks.Carrots);
 * if (cost !== null) {
 *   for (const [item, amount] of Object.entries(cost)) {
 *     if (numItems(Number(item)) < amount) {
 *       print("not enough items to unlock carrots");
 *     }
 *   }
 * }
 * ```
 */
export declare function getCost(
  thing: Entities | Items | Unlocks,
  level?: number,
): Partial<Record<Items, number>> | null;

/**
 * Has exactly the same effect as clicking the button corresponding to `unlock` in the research tree.
 *
 * takes `200` ticks to execute if it succeeded, `1` tick otherwise.
 *
 * @returns `true` if the unlock was successful, `false` otherwise.
 *
 * @example
 * ```ts
 * unlock(Unlocks.Carrots);
 * ```
 */
export declare function unlock(unlock: Unlocks): boolean;

/**
 * Used to check if an unlock, entity, ground, item or hat is already unlocked.
 *
 * takes `1` tick to execute.
 *
 * @returns `1` plus the number of times `thing` has been upgraded if `thing` is upgradable. Otherwise returns `1` if `thing` is unlocked, `0` otherwise.
 *
 * @example
 * ```ts
 * if (numUnlocked(Unlocks.Carrots) > 0) {
 *   plant(Entities.Carrot);
 * } else {
 *   print("Carrots not unlocked yet");
 * }
 * ```
 */
export declare function numUnlocked(
  thing: Entities | Grounds | Hats | Items | Leaderboards | Unlocks,
): number;
