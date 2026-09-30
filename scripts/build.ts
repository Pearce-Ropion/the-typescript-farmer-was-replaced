import { watch } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { buildProject } from './transpiler/project.ts';
import type { BuildOptions } from './transpiler/project.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const { values } = parseArgs({
  options: {
    watch: { type: 'boolean', short: 'w', default: false },
    src: { type: 'string', default: 'src/farm' },
    out: { type: 'string', default: 'build' },
  },
});

const options: BuildOptions = {
  srcDir: resolve(root, values.src),
  outDir: resolve(root, values.out),
  farmerDir: resolve(root, 'src/farmer'),
};

const display = (path: string) => relative(root, path);

function build(): boolean {
  const started = performance.now();
  const { written, removed, errors } = buildProject(options);
  for (const file of written) {
    console.log(`wrote ${display(file)}`);
  }
  for (const file of removed) {
    console.log(`removed ${display(file)}`);
  }
  for (const error of errors) {
    console.error(`error ${error.message}`);
  }
  const elapsed = Math.round(performance.now() - started);
  const status = errors.length ? `${errors.length} error(s)` : 'ok';
  console.log(
    `built ${display(options.srcDir)} -> ${display(options.outDir)} (${status}, ${elapsed}ms)`,
  );
  return errors.length === 0;
}

const ok = build();

if (values.watch) {
  console.log(`watching ${display(options.srcDir)}...`);
  let timer: NodeJS.Timeout | undefined;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(build, 50);
  };
  // The game's API declarations decide how names are translated, so changes to them matter too.
  for (const dir of [options.srcDir, options.farmerDir]) {
    watch(dir, { recursive: true }, (_event, filename) => {
      if (filename?.endsWith('.ts')) {
        schedule();
      }
    });
  }
} else if (!ok) {
  process.exitCode = 1;
}
