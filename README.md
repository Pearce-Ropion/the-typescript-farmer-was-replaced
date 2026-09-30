# ts-farmer-was-replaced

Write the game's code in TypeScript in `src/farm/` and build it to Python in `build/`.

```sh
yarn build   # transpile once
yarn dev     # rebuild whenever a file in src/farm/ (or the src/farmer/ declarations) is saved
```

Each `src/farm/<name>.ts` becomes `build/<name>.py`. The game's API is imported from `'farmer'`
(see `src/farmer/`), and function names are converted to `snake_case`.

Only the parts of TypeScript that map onto the game's Python are supported:

- functions (declarations and top level `const f = () => {}`), `if`/`else`, `while`, `do...while`,
  `for`, `for...of`, `break`, `continue`, `return`
- `for (let i = a; i < b; i++)` loops become `for i in range(...)`
- numbers, strings, booleans, `null`, template literals, `[]`, `{}`, and the `List`, `HashSet` and `Dict`
  primitives from `'farmer'`
- other files are imported with `import * as x from './x'` or `import { a } from './x'`
- `Math.floor/abs/min/max/random`

The game has no conditional expressions, so `a ? b : c`, `??` and `?.` are written as `if` statements
(using `_tmp_N` variables when they sit inside a larger expression).

Anything else stops the build with an error that points at the offending line.
