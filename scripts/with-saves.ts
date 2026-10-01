import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runWithSaves } from './cli/with-saves-command.ts';

// The command itself is in cli/with-saves-command.ts. This only starts it.
// Usage: node scripts/with-saves.ts <tool> [options...]
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.exit(runWithSaves(process.argv.slice(2), { root, error: console.error }));
