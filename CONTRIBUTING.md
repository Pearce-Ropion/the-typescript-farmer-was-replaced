# Contributing

Thank you for helping with the-typescript-farmer. This document explains how the project is put together and how to
make a change. How to use the tool is in the [README](README.md).

## Setup

You need Node.js 24 and Yarn (the version is pinned by `packageManager` in `package.json`).

```sh
yarn install
yarn types && yarn lint && yarn coverage   # everything should pass before you change anything
```

The scripts run TypeScript directly on Node, so there is no build step for the tooling itself.

### Editor

If you use VS Code, accept the recommended extensions (`.vscode/extensions.json`) when it asks:

- **Oxc** (`oxc.oxc-vscode`) runs oxlint and oxfmt in the editor, using the project's configuration.
- **Vitest** (`vitest.explorer`) lists the tests and runs or debugs them from the editor.

Run `yarn lint` and `yarn format` for the saves, because the tools skip git-ignored files unless they are named
(see "Why `with-saves`" below).

## How it works

The tool turns the TypeScript of each save into Python that the game can run:

1. **Parse.** [oxc-parser](https://oxc.rs) parses each `.ts` file of a save into an AST.
2. **Collect.** `transpile.ts` first looks at the top level of every file in the save to learn what each module
   exports, so imports between files can be translated.
3. **Translate.** A `FileTranspiler` walks the TypeScript AST and builds a
   **Python AST**. The nodes have the shape of
   [py-ast](https://www.npmjs.com/package/py-ast), which mirrors CPython's `ast`
   module, and are made with the small
   builders in `py.ts`.
4. **Check and print.** `py.ts` first checks that the Python AST only contains constructs the game supports (a
   whitelist, so for example a conditional expression or a lambda can never
   reach the output) and then prints it with py-ast's `unparse`.

Things the translation has to do that aren't a one-to-one mapping:

- **Names.** Functions become `snake_case`. Python keywords used as names get an underscore. Enums such as
  `Direction.North` become the game's names (`North`).
- **Conditional expressions.** The game has none, so `?:`, `??` and `?.` (and
  `&&` or `||` when their right side needs statements of its own) are written as
  `if` statements, using `_tmp_N` variables when they sit inside a larger
  expression. This is done with a list of statements that must run before an expression (`withPre` in
  `transpile.ts`).
- **Scopes.** Python scopes are per function, so shadowing a variable is rejected, and a function that assigns a
  module-level variable gets a `global` line.
- **Default parameters.** Python evaluates them once, TypeScript on every call, so a default that isn't a literal
  becomes `= None` plus an `if` at the top of the function.
- **Loops.** Counting `for` loops become `range` loops when that is safe, and other `for` loops become `while` loops.
- **Destructuring.** It is written as single assignments, because the game's support for unpacking tuples isn't known.
- **Hoisting.** Function declarations are emitted first, and arrow functions are lifted to named top-level functions.

Anything the transpiler can't translate fails with a `TranspileError` that has
the file, line and column. Don't silently produce something close: a clear error
is better than Python that behaves differently.

## Project layout

```
saves/               your saves, one directory each (git-ignored)
builds/              the generated Python, one directory per save (git-ignored)
types/farmer/        the TypeScript declarations of the game's API, imported as 'farmer'
scripts/
  build.ts           the command (the package's binary); it only starts cli/build-command.ts
  with-saves.ts      runs oxlint or oxfmt on the project and on the saves; it only starts cli/with-saves-command.ts
  cli/               the commands themselves (arguments, output, watching)
  transpiler/        the transpiler
    transpile.ts       TypeScript AST -> Python AST (the bulk of the work)
    py.ts              Python AST builders, the whitelist check and printing
    project.ts         building a whole save and all saves: reading sources, writing files, cleaning up
    naming.ts          snake_case and Python-safe names
    farmer.ts          reads types/farmer to learn which names the game has
    collections.ts     the array, set and object members that can be translated
  oxlint/            the lint plugin (rules/, utils/, index.ts)
tsconfig.*.json      see "TypeScript projects"
vitest.config.ts     test and coverage configuration
```

Tests live in a `__tests__` directory next to the code they test.

### The game's API (`types/farmer`)

The declarations describe the game's functions with camelCase names. The transpiler reads them to know which names
exist, and converts each name to the game's `snake_case` name. When you add or change a function:

- Name it in camelCase and give it a JSDoc comment, with `@returns` and an `@example` that uses TypeScript.
- Export it from the file that matches its section in the game's `__builtins__.py`, and the file from `index.d.ts`.
- If it only exists to give one of the game's functions a more precise type (`measureEntity` and `measurePos` are
  `measure`), add it to `PYTHON_FUNCTION_ALIASES` in `scripts/transpiler/farmer.ts`.
- Update the list of the game's function names in `scripts/transpiler/__tests__/farmer.test.ts`. That test compares
  every declared function with what the game has.

### Lint rules

Code in `saves/` is linted with a few rules of oxlint's own and with custom
rules in `scripts/oxlint`, all configured in `.oxlintrc.json` (`overrides` for
`saves/**/*.ts`, which leaves out test files):

| Rule                                                                                      | Reports                                                                    |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `typescript-farmer/no-classes`                                                            | classes                                                                    |
| `typescript-farmer/no-do-while`                                                           | `do...while` loops                                                         |
| `typescript-farmer/no-lambdas`                                                            | arrow functions and function expressions                                   |
| `typescript-farmer/no-number-conversion`                                                  | `Number()`, `parseInt`, `parseFloat` and unary `+`                         |
| `typescript-farmer/no-unsupported-collection-member`                                      | array, set and object members that the game doesn't have                   |
| `typescript-farmer/flat-modules`                                                          | imports other than `'farmer'` and `./sibling`, and files in subdirectories |
| `no-ternary`, `typescript/consistent-type-assertions`, `typescript/no-non-null-assertion` | oxlint's own rules                                                         |

`typescript-farmer/no-unsupported-collection-member` has to work out what kind of value a
variable holds without type information, so it follows annotations and
initialisers within one file. The members it allows are in
`scripts/transpiler/collections.ts`, which a test checks against the transpiler, so the two can't drift apart.

To add a rule: create `scripts/oxlint/rules/<name>.ts` and its test in `rules/__tests__/`, register it in
`scripts/oxlint/index.ts`, and turn it on in `.oxlintrc.json`. Shared helpers are in `scripts/oxlint/utils/`.

#### Why `with-saves`

`saves/*` is git-ignored and oxlint and oxfmt skip git-ignored files when they
search folders. They do check files that are named explicitly, so `yarn lint`
and `yarn format` run through `scripts/with-saves.ts`, which names every `.ts`
file of the saves. Negated ignore patterns in the tools' configs don't help,
because the git ignore is applied first. Use `yarn lint` and `yarn format`, not
`oxlint` and `oxfmt` directly, to include the saves.

### TypeScript projects

`tsconfig.json` only lists two projects. `yarn types` (`tsc -b`) checks both.

- `tsconfig.node.json` is the tooling that runs on Node: everything in
  `scripts/`, the Vitest config, and every test, including tests that sit next
  to a save's code or the game's declarations. It knows about Node and Vitest's
  globals.
- `tsconfig.saves.json` is the saves and `types/farmer/`. It has no Node or browser types, so a save that uses
  `process` or `console` doesn't type-check. Test files are left out.

Both extend `tsconfig.base.json`, which has the shared options and the `farmer`
path mapping. The options are strict about unused code and only allow syntax
that can be erased, because Node runs the files directly. Imports of `.ts` files
include the extension.

## Scripts

| Command                           | What it does                                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `yarn build` / `yarn build:watch` | build once / rebuild on changes (see the README for the options); `yarn dev` is the same as `build:watch` |
| `yarn types`                      | type-check everything                                                                                     |
| `yarn lint` / `yarn lint:fix`     | lint (type-aware) the project and the saves; `lint:fix` fixes what it can                                 |
| `yarn format`                     | format with oxfmt                                                                                         |
| `yarn test`                       | run the tests in watch mode                                                                               |
| `yarn coverage`                   | run the tests once with coverage                                                                          |

## Tests and coverage

Tests use [Vitest](https://vitest.dev) with its globals (`describe`, `it`, `expect` need no import).

```sh
yarn test       # watch mode
yarn coverage   # one run with a coverage report (also written to coverage/ as HTML)
```

`yarn coverage` fails unless statements, branches, functions and lines are all
at **100%**. The two scripts that only start a command (`scripts/build.ts` and
`scripts/with-saves.ts`) are left out of coverage. Their commands live in
`scripts/cli/` and are called directly by the tests, with the file watching and
the tools they run replaced where that helps.

- **Unreachable code.** If a branch can't be reached, delete it. Prefer that to a `/* v8 ignore */` comment.
- **Transpiler tests.** Most translation tests call `py(source)` from `scripts/transpiler/__tests__/helpers.ts`,
  which returns the Python for a snippet, and `fails(source, /message/)` for the unsupported cases. They compare the
  exact Python, so a change in output is visible.
- **Lint rule tests.** They use oxlint's `RuleTester` through `scripts/oxlint/utils/testing.ts`.
- **Temporary files.** Tests that need files create them in a temporary directory and delete them afterwards.

## How to contribute

1. **Start with an issue or a clear description.** For a bug, include the TypeScript that fails, the Python you expected
   (or the error you got), and what the game does with it. For a new feature,
   say what you want to write in a save and what Python it should become.
2. **Make a branch** and change as little as the problem needs. Match the code
   around you; the formatter takes care of layout.
3. **Add tests.** Every change comes with tests, and coverage has to stay at 100%.
   - A new construct: translate it in `transpile.ts`, add examples to `__tests__/syntax.test.ts` or
     `edge-cases.test.ts`, and add its error cases to the table of unsupported syntax.
   - A new array, set or object member: add it to `ALLOWED_MEMBERS`, translate it in `emitMethodCall`, and add an
     example for it in the "native collections" tests.
   - A construct the game doesn't have: make the transpiler reject it with a clear message, and consider a lint rule
     so people see it in their editor.
4. **Update the docs.** If what a save can contain changes, update the README's "Writing a save" lists. If the
   structure changes, update this file.
5. **Run all the checks** before you open a pull request:

   ```sh
   yarn types && yarn lint && yarn format && yarn coverage
   ```

   `yarn format` rewrites files, so commit the result.

   The same checks run on GitHub (`.github/workflows/ci.yml`) for every pull request and every push to `main`, and a
   pull request needs them to pass.

6. **Open a pull request** that says what changed and why, and links the issue. Keep commits short and in the
   imperative mood, as in the history (`Add flat modules lint rule`, `Use commander for build script`).
