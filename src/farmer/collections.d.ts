/**
 * The types that can be used as a dict key or set element.
 */
export type Hashable = boolean | number | string | null | readonly Hashable[];

/**
 * An ordered sequence of values.
 *
 * `new List()` creates a new empty list.
 * `new List(collection)` creates a new list from the values of the provided `collection`.
 *
 * takes `1 + collection.length` ticks to execute if an input is given.
 * takes `1` tick to execute if no input is given.
 */
export declare class List<T> {
  constructor(input?: Iterable<T>);

  /**
   * Get or set the element at the specified index.
   *
   * @example
   * ```ts
   * const myList = new List([1, 2, 3]);
   * myList[0] = 4;
   * print(myList[0]);
   * ```
   *
   * Output:
   *
   * ```
   * 4
   * ```
   */
  [index: number]: T;

  /**
   * The number of items in the list.
   *
   * takes `1` tick to execute.
   *
   * @example
   * ```ts
   * const myList = new List([1, 2, 3]);
   * print(myList.length);
   * ```
   *
   * Output:
   *
   * ```
   * 3
   * ```
   */
  readonly length: number;

  /**
   * Add `value` to the end of the list.
   *
   * takes `1` tick to execute.
   *
   * @example
   * ```ts
   * const myList = new List([1, 2, 3]);
   * myList.push(4);
   * print(myList);
   * ```
   *
   * Output:
   *
   * ```
   * [1,2,3,4]
   * ```
   */
  push(value: T): void;

  /**
   * Add `value` to the list at the specified `index`.
   *
   * takes `1 + length - index` ticks to execute.
   *
   * @example
   * ```ts
   * const myList = new List([1, 2, 3]);
   * myList.insert(1, 4);
   * print(myList);
   * ```
   *
   * Output:
   *
   * ```
   * [1,4,2,3]
   * ```
   */
  insert(index: number, value: T): void;

  /**
   * Remove the element at the specified `index` in the list. If no index is specified removes the last element in the list.
   *
   * takes `length - index` ticks to execute if an `index` is provided.
   * takes `1` tick to execute if no `index` is provided.
   *
   * @returns the value of the removed element.
   * @example
   * ```ts
   * const myList = new List([1, 2, 3]);
   * print("Old Value:", myList.pop(1));
   * print("Current List:", myList);
   * ```
   *
   * Output:
   *
   * ```
   * Old Value: 2
   * Current List: [1,3]
   * ```
   */
  pop(index?: number): T;

  /**
   * Remove the first element equal to `value` from the list.
   *
   * takes `numComparisons + numShifts` ticks to execute.
   *
   * @example
   * ```ts
   * const myList = new List([1, 2, 3]);
   * myList.remove(1);
   * print(myList);
   * ```
   *
   * Output:
   *
   * ```
   * [2,3]
   * ```
   */
  remove(value: T): void;

  /**
   * Get the values in the list.
   *
   * @returns a new list containing the values.
   * @example
   * ```ts
   * const myList = new List([1, 2, 3]);
   * print(myList.values());
   * ```
   *
   * Output:
   *
   * ```
   * [1,2,3]
   * ```
   */
  values(): List<T>;

  /**
   * Iterate over the values, so the collection can be used directly in a `for...of` loop.
   *
   * @example
   * ```ts
   * for (const value of new List([1, 2, 3])) {
   *   print(value);
   * }
   * ```
   */
  [Symbol.iterator](): Iterator<T>;
}

/**
 * An unordered collection of unique elements.
 *
 * `new HashSet()` creates a new empty set.
 * `new HashSet(collection)` creates a new set from the values of the provided `collection`.
 *
 * takes `1 + collection.length` ticks to execute if an input is given.
 * takes `1` tick to execute if no input is given.
 */
export declare class HashSet<T extends Hashable> {
  constructor(input?: Iterable<T>);

  /**
   * The number of items in the set.
   *
   * takes `1` tick to execute.
   *
   * @example
   * ```ts
   * const mySet = new HashSet([1, 2, 3]);
   * print(mySet.size);
   * ```
   *
   * Output:
   *
   * ```
   * 3
   * ```
   */
  readonly size: number;

  /**
   * Add `value` to the set.
   *
   * takes `1` tick to execute.
   *
   * @example
   * ```ts
   * const mySet = new HashSet([1, 2, 3]);
   * mySet.add(4);
   * print(mySet);
   * ```
   *
   * Output:
   *
   * ```
   * {1,2,3,4}
   * ```
   */
  add(value: T): void;

  /**
   * Remove `value` from the set.
   *
   * takes `1` tick to execute.
   *
   * @example
   * ```ts
   * const mySet = new HashSet([1, 2, 3]);
   * mySet.delete(2);
   * print(mySet);
   * ```
   *
   * Output:
   *
   * ```
   * {1,3}
   * ```
   */
  delete(value: T): void;

  /**
   * Check whether `value` is in the set.
   *
   * @returns `true` if `value` is in the set, `false` otherwise.
   * @example
   * ```ts
   * const mySet = new HashSet([1, 2, 3]);
   * print(mySet.has(2));
   * ```
   *
   * Output:
   *
   * ```
   * true
   * ```
   */
  has(value: T): boolean;

  /**
   * Get `value` from the set if it is present.
   *
   * @returns `value` if it is in the set, `null` otherwise.
   * @example
   * ```ts
   * const mySet = new HashSet([1, 2, 3]);
   * print(mySet.get(2));
   * print(mySet.get(5));
   * ```
   *
   * Output:
   *
   * ```
   * 2
   * null
   * ```
   */
  get(value: T): T | null;

  /**
   * Get the values in the set.
   *
   * @returns a new list containing the values.
   * @example
   * ```ts
   * const mySet = new HashSet([1, 2, 3]);
   * print(mySet.values());
   * ```
   *
   * Output:
   *
   * ```
   * [1,2,3]
   * ```
   */
  values(): List<T>;

  /**
   * Iterate over the values, so the collection can be used directly in a `for...of` loop.
   *
   * @example
   * ```ts
   * for (const value of new HashSet([1, 2, 3])) {
   *   print(value);
   * }
   * ```
   */
  [Symbol.iterator](): Iterator<T>;
}

/**
 * The methods available on every `Dict`.
 */
export interface DictMethods<K extends Hashable, V> {
  /**
   * The number of items in the dictionary.
   *
   * takes `1` tick to execute.
   *
   * @example
   * ```ts
   * // myDict = { One: 1, Two: 2, Three: 3 }
   * print(myDict.size);
   * ```
   *
   * Output:
   *
   * ```
   * 3
   * ```
   */
  readonly size: number;

  /**
   * Remove the key-value pair corresponding to `key` from the dictionary.
   *
   * takes `1` tick to execute.
   *
   * @returns the value of the removed key-value pair.
   * @example
   * ```ts
   * // myDict = { One: 1, Two: 2, Three: 3 }
   * print("Old Value:", myDict.pop("One"));
   * print("Current Dict:", myDict);
   * ```
   *
   * Output:
   *
   * ```
   * Old Value: 1
   * Current Dict: {"Two":2,"Three":3}
   * ```
   */
  pop(key: K): V;

  /**
   * Get the keys in the dictionary.
   *
   * @returns a new list containing the keys.
   * @example
   * ```ts
   * const myDict = new Dict({ One: 1, Two: 2 });
   * print(myDict.keys());
   * ```
   *
   * Output:
   *
   * ```
   * ["One","Two"]
   * ```
   */
  keys(): List<K>;

  /**
   * Get the values in the dictionary.
   *
   * @returns a new list containing the values.
   * @example
   * ```ts
   * const myDict = new Dict({ One: 1, Two: 2 });
   * print(myDict.values());
   * ```
   *
   * Output:
   *
   * ```
   * [1,2]
   * ```
   */
  values(): List<V>;

  /**
   * Get the key-value pairs in the dictionary.
   *
   * @returns a new list of `[key, value]` pairs.
   * @example
   * ```ts
   * const myDict = new Dict({ One: 1, Two: 2 });
   * print(myDict.entries());
   * ```
   *
   * Output:
   *
   * ```
   * [["One",1],["Two",2]]
   * ```
   */
  entries(): List<[K, V]>;
}

/**
 * An unordered collection of key-value pairs.
 *
 * `new Dict()` creates a new empty dictionary.
 * `new Dict(dictionary)` creates a new dictionary initialized from an existing `dictionary`.
 * `new Dict(object)` creates a new dictionary from the keys and values of a plain `object`.
 *
 * takes `1 + dictionary.size * 2` ticks to execute if a dictionary or object is given.
 * takes `1` tick to execute if no input is given.
 *
 * Values can be read by key: `new Dict({ hello: "world" })["hello"]` is `"world"`.
 */
export type Dict<K extends Hashable = Hashable, V = unknown> = DictMethods<K, V> & {
  [key in Extract<K, string | number>]: V;
};

export interface DictConstructor {
  new (): Dict;
  new <O extends Record<string | number, unknown>>(
    input: O,
  ): DictMethods<Extract<keyof O, string | number>, O[keyof O]> & O;
  new <K extends Hashable, V>(
    input?: Dict<K, V> | { [key in Extract<K, string | number>]?: V },
  ): Dict<K, V>;
}

export declare const Dict: DictConstructor;
