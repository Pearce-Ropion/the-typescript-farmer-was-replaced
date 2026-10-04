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
  The Python is written to `builds/Saves/<save>/<file>.py`, or to the `Saves` directory of whatever game directory
  `--game` points at.
- Your saves belong to your own fork of the repository. Everything in this directory except this file is ignored by
  git, so to version control your saves in your fork, remove the `saves/*` line from `.gitignore` and delete the "Saves
  directory" step of the CI workflow (`.github/workflows/ci.yml`), which fails when a save is committed.
- While `yarn build:watch` runs, the `.txt` files the game writes in its directory, such as the `output.txt` of
  `quick_print()`, are copied to the `logs` directory of the project (not into a save), which is git-ignored.

See the [main README](../README.md) for the options of the build and for what TypeScript the game can run.
