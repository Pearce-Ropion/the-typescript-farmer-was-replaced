/**
 * The members of native JavaScript collections that can be translated to the game's Python.
 * The lint rule in `scripts/oxlint` reports anything else, and the transpiler is tested to support
 * everything listed here, so the two can't drift apart.
 */
export const ALLOWED_MEMBERS = {
  /** `[]` and `T[]`. */
  array: ['length', 'push', 'pop', 'shift', 'unshift', 'splice', 'includes'],
  /** `new Set()` and `Set<T>`. */
  set: ['size', 'add', 'delete', 'has'],
  /** `{}` and `Record<K, V>`. Objects become dictionaries, which have no methods. */
  object: [] as string[],
  /** Static functions. `Object.keys/values/entries` can be used as the subject of a `for...of` loop. */
  statics: ['Object.keys', 'Object.values', 'Object.entries'],
};

export type CollectionKind = 'array' | 'set' | 'object';
