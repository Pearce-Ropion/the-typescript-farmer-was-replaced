/**
 * Samples a random number between 0 (inclusive) and 1 (exclusive).
 *
 * takes `1` ticks to execute.
 *
 * @returns the random number.
 *
 * @example
 * ```ts
 * function randomElem<T>(list: T[]): T {
 *   const index = Math.floor(random() * list.length);
 *   return list[index];
 * }
 * ```
 */
export declare function random(): number;

/**
 * Gets the minimum of a sequence of elements or several passed arguments.
 * Can be used on numbers and strings.
 *
 * `min(a,b,c)`: Returns the minimum of `a`, `b` and `c`.
 * `min(sequence)`: Returns the minimum of all values in a sequence.
 *
 * @returns the minimum value from the arguments.
 */
export declare function min<T extends number | string>(...args: T[]): T;
/**
 * Gets the minimum of a sequence of elements or several passed arguments.
 * Can be used on numbers and strings.
 *
 * `min(a,b,c)`: Returns the minimum of `a`, `b` and `c`.
 * `min(sequence)`: Returns the minimum of all values in a sequence.
 *
 * @returns the minimum value from the arguments.
 */
export declare function min<T extends number | string>(sequence: readonly T[]): T;

/**
 * Gets the maximum of a sequence of elements or several passed arguments.
 * Can be used on numbers and strings.
 *
 * `max(a,b,c)`: Returns the maximum of `a`, `b` and `c`.
 * `max(sequence)`: Returns the maximum of all values in a sequence.
 *
 * @returns the maximum value from the arguments.
 */
export declare function max<T extends number | string>(...args: T[]): T;
/**
 * Gets the maximum of a sequence of elements or several passed arguments.
 * Can be used on numbers and strings.
 *
 * `max(a,b,c)`: Returns the maximum of `a`, `b` and `c`.
 * `max(sequence)`: Returns the maximum of all values in a sequence.
 *
 * @returns the maximum value from the arguments.
 */
export declare function max<T extends number | string>(sequence: readonly T[]): T;

/**
 * Returns the absolute value of a number.
 *
 * takes `1` tick to execute.
 *
 * @returns the absolute value of x.
 *
 * @example
 * ```ts
 * const positive = abs(-5);
 * print(positive);
 * ```
 *
 * Output:
 *
 * ```
 * 5
 * ```
 */
export declare function abs(x: number): number;
