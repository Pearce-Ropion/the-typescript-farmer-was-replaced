# the-typescript-farmer

In [_The Farmer Was Replaced_](https://www.metaroot.ch/press-kit/the-farmer-was-replaced)
you program a drone in a language that looks like Python.
**the-typescript-farmer** lets you write that code in TypeScript instead, with
types, autocomplete and linting for the game's API, and turns it into the Python
the game runs.

```ts
// saves/save-1/main.ts
import { Entities, canHarvest, harvest, plant, till } from 'farmer';

till();
while (true) {
  if (canHarvest()) {
    harvest();
  }
  plant(Entities.Grass);
}
```

becomes

```python
# builds/save-1/main.py
till()
while True:
    if can_harvest():
        harvest()
    plant(Entities.Grass)
```

## Getting started

This project is meant to be **forked**. Your code lives in `saves/`, next to the tool that builds it, so each person
uses their own copy of the repository: fork it on GitHub, then clone your fork.

You need [Node.js](https://nodejs.org) 24 and [Yarn](https://yarnpkg.com).

```sh
git clone git@github.com:<you>/the-typescript-farmer-was-replaced.git
cd the-typescript-farmer-was-replaced
yarn install
```

Each directory in `saves/` is one of your saves, and its `.ts` files are that save's code. A save's files can import
each other (`import { a } from './other'`) and the game's API (`import { harvest } from 'farmer'`). Then build:

```sh
yarn build
```

Every `saves/<save>/<name>.ts` is written to `builds/<save>/<name>.py`.

### Putting the code in the game

The game reads its code from its own save directories (`Save0`, `Save1`, ...).
Name the directory in `saves/` after the game's save and point `--out` at the
game's saves folder, and the build writes the Python straight into the save:

```sh
yarn build --out "$HOME/Library/Application Support/com.TheFarmerWasReplaced.TheFarmerWasReplaced/Saves"
```

That is the folder on macOS. On other systems, use the folder the game keeps its saves in. The game's own
`__builtins__.py` in a save is never deleted or overwritten.

## Running it

```
the-typescript-farmer [options] [saves...]
```

| Option          | Meaning                                                                                 |
| --------------- | --------------------------------------------------------------------------------------- |
| `[saves...]`    | The saves to build. Every save is built when none are named.                            |
| `-w, --watch`   | Keep running and rebuild a save whenever one of its files is saved.                     |
| `--saves <dir>` | The directory that contains the saves. Default: `saves`.                                |
| `--out <dir>`   | The directory the Python is written to, as `<dir>/<save>/<name>.py`. Default: `builds`. |
| `-h, --help`    | Show the usage.                                                                         |

The command can be started in any of these ways, which are all the same program:

```sh
yarn the-typescript-farmer --watch   # the binary of the package
yarn build                           # yarn build [saves...]
yarn build:watch                     # the same as yarn build --watch (also available as yarn dev)
./scripts/build.ts --watch           # the script itself
```

Examples:

```sh
yarn build save-1 save-2             # only these two saves
yarn build:watch save-1               # watch one save
yarn build --saves ~/farm --out ~/farm-python
```

The exit code is `0` when everything built, and `1` when something failed, a
named save doesn't exist, or an option is unknown. In watch mode the process
keeps running, and a failure only prints a message.

### What a build does

- Only the Python of a file that changed is rewritten, and every file starts with a comment saying it is generated.
- Function names become `snake_case`, so `getPosX()` is `get_pos_x()`.
- When a file can't be built, the error is printed with its file, line and column, and the other files are still built.
  A file that imports a file with a syntax error is skipped, and a file that
  failed keeps the Python of its last good build (with a warning that it is out
  of date), so the game isn't left without it.
- Python that an earlier build generated is removed when its source is deleted,
  and so is the output of a deleted save. Files the build didn't generate are
  left alone. A source called `__builtins__.ts` is refused, because it would
  overwrite the game's `__builtins__.py`.

## Writing a save

Only the parts of TypeScript that map onto the game's Python can be built.
Anything else stops that file with an error that points at the line.

**Supported**

- functions (declarations, with default and rest parameters), `if`/`else`, `while`, `for`, `for...of`,
  `for...in`, `break`, `continue` and `return`
- `for (let i = a; i < b; i++)` loops are written as `for i in range(...)`
- numbers, strings, booleans, `null`, template literals, destructuring of arrays, and the usual operators
- `Math.floor`, `Math.abs`, `Math.min`, `Math.max` and `Math.random`
- `String(value)` and `value.toString()`, which become `str(value)`
- arrays, `Set`s and objects, with the members the game has:
  - arrays: `length`, `push`, `pop`, `shift`, `unshift`, `splice(i, 0, value)` and `splice(i, 1)`, `includes`, indexing
  - sets: `size`, `add`, `delete`, `has`
  - objects become dictionaries: property and index access only, plus `Object.keys`, `Object.values` and
    `Object.entries` in a `for...of` loop

**Not supported**, because the game's Python doesn't have it

| Instead of                                          | Write                                              |
| --------------------------------------------------- | -------------------------------------------------- |
| classes                                             | functions and plain objects                        |
| arrow functions and function expressions            | named functions                                    |
| `do { ... } while (x)`                              | `while`                                            |
| `a ? b : c`                                         | `if` / `else`                                      |
| `Number(x)`, `parseInt`, `parseFloat`, `+x`         | nothing: numbers are already numbers               |
| `x as T`, `<T>x` and `x!`                           | real code that converts the value                  |
| `try`, `switch`, labels, `async`, generators        | `if` / `else` and loops                            |
| `import` of anything but `'farmer'` and `./sibling` | keep the files of a save together in one directory |

`a ?? b` and `a?.b` do work. They are written as `if` statements, and the value in front of a `?.` has to be a
variable or a member (`a?.b`, `a.b?.c`), not the result of a call.

### The game's API

Everything the game offers is imported from `'farmer'`, and `types/farmer/` has the types and a description of every
function. Names follow JavaScript conventions and are translated back to the game's names when the Python is written:

| In TypeScript                 | In the game                    |
| ----------------------------- | ------------------------------ |
| `getPosX()`, `canHarvest()`   | `get_pos_x()`, `can_harvest()` |
| `Entities.Grass`, `Items.Hay` | `Entities.Grass`, `Items.Hay`  |
| `Direction.North`             | `North`                        |
| `Unlocks.Carrots`             | `Unlocks.Carrots`              |

#### Typed variants

Some game functions return different kinds of values depending on what they are used on, which makes the result awkward
to use in TypeScript. For those, the API also has more precise variants. They only exist in TypeScript: each one is
written as the game's own function, so the Python is the same whichever you use.

| Function                    | Returns                              | Use it for                                                               | Python      |
| --------------------------- | ------------------------------------ | ------------------------------------------------------------------------ | ----------- |
| `measure(direction?)`       | `number \| [number, number] \| null` | anything; you have to check what you got                                 | `measure()` |
| `measureEntity(direction?)` | `number \| null`                     | the number of a sunflower's petals, a cactus's size or a dinosaur's type | `measure()` |
| `measurePos(direction?)`    | `[number, number] \| null`           | the position of the treasure in a maze                                   | `measure()` |

```ts
import { measureEntity, measurePos } from 'farmer';

const petals = measureEntity(); // number | null: never a position
const treasure = measurePos(); // [number, number] | null: never a plain number
```

```python
petals = measure()
treasure = measure()
```

Pick the variant that matches what you are measuring. The types are all the checking there is: the game decides at
runtime what `measure()` returns, so `measureEntity()` on a maze still gives a position.

### Linting

`yarn lint` checks the code of your saves for the things above, and `yarn format` formats it. The game-specific rules
are the `typescript-farmer/*` rules and a few of oxlint's own; each message says what to write instead.

### Keeping your saves in git

Your saves are in your own fork, and `saves/*` is in `.gitignore`, so they aren't committed by default. Remove that
line if you want to version control them in your fork.

The CI workflow fails when anything but `saves/README.md` is committed in `saves/`. **If you commit your saves, delete
the "Saves directory" step in `.github/workflows/ci.yml` in your fork** (or disable the check there), or its runs will
fail.

To get improvements from this repository into your fork, add it as a remote and merge it:

```sh
git remote add upstream https://github.com/Pearce-Ropion/the-typescript-farmer-was-replaced.git
git pull upstream main
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how the project is put together and how to contribute.
