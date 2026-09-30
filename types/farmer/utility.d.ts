/**
 * Prints `something` into the air above the drone using smoke. This action is not affected by speed upgrades.
 * Multiple values can be printed at once.
 *
 * takes 1s to execute.
 * @example
 * ```ts
 * print("ground:", getGroundType());
 * ```
 */
export declare function print(...something: unknown[]): void;

/**
 * Prints a value just like `print()` but it doesn't stop to write it into the air so it can only be found on the output page.
 *
 * takes `0` ticks to execute.
 * @example
 * ```ts
 * quickPrint("hi mom");
 * ```
 */
export declare function quickPrint(...something: unknown[]): void;
