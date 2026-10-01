# ts-farmer-was-replaced

Write the game's code in TypeScript in `saves/<save>/` and build it to Python in `builds/<save>/`. Each directory in
`saves/` is a separate save, and a save's files can only import each other.

```sh
yarn build           # transpile every save once
yarn build save-1    # transpile only the named saves
yarn dev             # rebuild whenever a file in saves/ (or the types/farmer/ declarations) is saved
```

Each `saves/<save>/<name>.ts` becomes `builds/<save>/<name>.py`. The game's API is imported from `'farmer'`
(see `types/farmer/`), and function names are converted to `snake_case`. A save that is deleted has its generated
Python removed on the next build.

Only the parts of TypeScript that map onto the game's Python are supported:

- functions (declarations and top level `const f = () => {}`), `if`/`else`, `while`, `do...while`,
  `for`, `for...of`, `break`, `continue`, `return`
- `for (let i = a; i < b; i++)` loops become `for i in range(...)`
- numbers, strings, booleans, `null`, template literals, and native arrays, `Set`s and objects (see below)
- other files are imported with `import * as x from './x'` or `import { a } from './x'`
- `Math.floor/abs/min/max/random`

The game has no conditional expressions, so `a ? b : c`, `??` and `?.` are written as `if` statements
(using `_tmp_N` variables when they sit inside a larger expression).

When a file fails to build, the error is printed with its file, line and column and the watcher keeps running. The other
files are still built, files that import a file with a syntax error are skipped, and a file that fails keeps its
previous `.py` (with a warning that it is out of date) so the game isn't left without it.

Anything else stops the build with an error that points at the offending line.

### Native collections

Arrays, `Set`s and objects work with native JavaScript syntax, but only a few of their members exist in the game's
Python (`ALLOWED_MEMBERS` in `scripts/transpiler/collections.ts`):

- arrays: `length`, `push`, `pop`, `shift`, `unshift`, `splice(i, 0, value)` / `splice(i, 1)`, `includes`, indexing
- sets: `size`, `add`, `delete`, `has`
- objects become dictionaries: property and index access only, plus `Object.keys/values/entries` in `for...of`

The game has no classes or lambdas, so `farm/no-classes` and `farm/no-lambdas` report those (declare named functions
instead). `farm/no-number-conversion` reports `Number()`, `parseInt`, `parseFloat` and unary `+`, because the game has
`str()` but no `int()` or `float()`; `String(value)` and `value.toString()` become `str(value)`.
Ternaries are reported by oxlint's `no-ternary` rule (use `if`/`else`). Type assertions (`value as T`, `<T>value` and `value!`) are reported by oxlint's `typescript/consistent-type-assertions`
and `typescript/no-non-null-assertion` rules, so values are converted with real code instead of being cast. The `farm/no-unsupported-collection-member` oxlint rule (one file per rule in `scripts/oxlint/rules/`, registered in `scripts/oxlint/index.ts` and enabled for `saves/`)
reports any other member as you type. It works from annotations and initialisers in the same file, so values whose
type comes from another file can't be checked there. The transpiler still rejects them.
