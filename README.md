# ts-farmer-was-replaced

Write the game's code in TypeScript in `src/farm/` and build it to Python in `build/`.

```sh
yarn build   # transpile once
yarn dev     # rebuild whenever a file in src/farm/ (or the types/farmer/ declarations) is saved
```

Each `src/farm/<name>.ts` becomes `build/<name>.py`. The game's API is imported from `'farmer'`
(see `types/farmer/`), and function names are converted to `snake_case`.

Only the parts of TypeScript that map onto the game's Python are supported:

- functions (declarations and top level `const f = () => {}`), `if`/`else`, `while`, `do...while`,
  `for`, `for...of`, `break`, `continue`, `return`
- `for (let i = a; i < b; i++)` loops become `for i in range(...)`
- numbers, strings, booleans, `null`, template literals, and native arrays, `Set`s and objects (see below)
- other files are imported with `import * as x from './x'` or `import { a } from './x'`
- `Math.floor/abs/min/max/random`

The game has no conditional expressions, so `a ? b : c`, `??` and `?.` are written as `if` statements
(using `_tmp_N` variables when they sit inside a larger expression).

Anything else stops the build with an error that points at the offending line.

### Native collections

Arrays, `Set`s and objects work with native JavaScript syntax, but only a few of their members exist in the game's
Python (`ALLOWED_MEMBERS` in `scripts/transpiler/collections.ts`):

- arrays: `length`, `push`, `pop`, `shift`, `unshift`, `splice(i, 0, value)` / `splice(i, 1)`, `includes`, indexing
- sets: `size`, `add`, `delete`, `has`
- objects become dictionaries: property and index access only, plus `Object.keys/values/entries` in `for...of`

The game has no classes or lambdas, so `farm/no-classes` and `farm/no-lambdas` report those (declare named functions
instead). The `farm/no-unsupported-collection-member` oxlint rule (`scripts/oxlint/farm-plugin.ts`, enabled for `src/farm`)
reports any other member as you type. It works from annotations and initialisers in the same file, so values whose
type comes from another file can't be checked there. The transpiler still rejects them.
