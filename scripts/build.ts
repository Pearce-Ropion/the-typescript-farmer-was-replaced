#!/usr/bin/env node
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { run } from './cli/build-command.ts';

// The command itself is in cli/build-command.ts. This only starts it.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.exitCode = run(process.argv.slice(2), { root, output: console }).exitCode;
