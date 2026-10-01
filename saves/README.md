# Saves

Each directory in `saves/` is one save, and its `.ts` files are that save's code. Name the directory after the save in
the game (`Save0`, `Save1`, ...) if you want the build to write the Python straight into the game.

```
saves/
  Save0/
    main.ts
    movement.ts
  Save1/
    main.ts
```

- Keep a save's files together in its directory. Files can import each other as `./name`, and the game's API as
  `'farmer'`, and nothing else.
- Build with `yarn build` (every save), `yarn build Save0` (one save) or `yarn build:watch` (rebuild on every change).
  The Python is written to `builds/<save>/<file>.py`, or wherever `--out` points.
- Everything in this directory except this file is ignored by git. To version control your saves, remove the
  `saves/*` line from `.gitignore`.

See the [main README](../README.md) for the options of the build and for what TypeScript the game can run.
