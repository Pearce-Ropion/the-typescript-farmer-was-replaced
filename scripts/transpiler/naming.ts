const PYTHON_RESERVED = new Set([
  'and',
  'as',
  'assert',
  'async',
  'await',
  'break',
  'class',
  'continue',
  'def',
  'del',
  'elif',
  'else',
  'except',
  'finally',
  'for',
  'from',
  'global',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'try',
  'while',
  'with',
  'yield',
  'None',
  'True',
  'False',
]);

/**
 * Converts a camelCase name to the snake_case name used by the game, e.g. `getPosX` -> `get_pos_x`
 * and `doAFlip` -> `do_a_flip`.
 */
export function toSnakeCase(name: string): string {
  return name
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

/**
 * Makes a name safe to use as a Python identifier.
 */
export function pyIdent(name: string): string {
  const safe = name.replace(/\$/g, '_');
  return PYTHON_RESERVED.has(safe) ? `${safe}_` : safe;
}

/**
 * The Python name of a function declared in TypeScript.
 */
export function pyFunctionName(name: string): string {
  return pyIdent(toSnakeCase(name));
}
