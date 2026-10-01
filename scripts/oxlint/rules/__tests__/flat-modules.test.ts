import { tester, ts } from '../../utils/testing.ts';
import rule from '../flat-modules.ts';

const inSave = (code: string, filename = 'saves/save-1/main.ts') => ({ code, filename });

tester.run('flat-modules', rule, {
  valid: [
    ts("import { move } from 'farmer';"),
    ts("import * as world from './world';"),
    ts("import { a } from './world.ts';"),
    ts("import type { Entities } from 'farmer';"),
    ts("export { a } from './world';"),
    ts('export const a = 1;'),
    inSave("import { a } from './world';"),
    inSave('export const a = 1;', 'saves/save-1/world.ts'),
    inSave('export const a = 1;', '/home/me/project/saves/save-2/world.ts'),
    // Files outside the saves directory are not saves.
    inSave('export const a = 1;', 'scripts/deep/er/file.ts'),
    {
      code: 'export const a = 1;',
      filename: 'games/save-1/util.ts',
      options: [{ savesDirectory: 'games' }],
    },
    {
      code: "import { x } from 'extra';",
      filename: 'farm.ts',
      options: [{ packages: ['farmer', 'extra'] }],
    },
  ],
  invalid: [
    {
      ...ts("import { a } from '../world';"),
      errors: [{ messageId: 'import', data: { source: '../world' } }],
    },
    { ...ts("import { a } from '../../world';"), errors: [{ messageId: 'import' }] },
    { ...ts("import { a } from './util/world';"), errors: [{ messageId: 'import' }] },
    { ...ts("import { a } from './../world';"), errors: [{ messageId: 'import' }] },
    { ...ts("import { a } from '.';"), errors: [{ messageId: 'import' }] },
    { ...ts("import { a } from '..';"), errors: [{ messageId: 'import' }] },
    { ...ts("import { a } from '/abs/world';"), errors: [{ messageId: 'import' }] },
    { ...ts("import fs from 'node:fs';"), errors: [{ messageId: 'import' }] },
    { ...ts("import type { A } from '../types';"), errors: [{ messageId: 'import' }] },
    { ...ts("import { a } from 'farmer/entities';"), errors: [{ messageId: 'import' }] },
    { ...ts("export * from '../world';"), errors: [{ messageId: 'import' }] },
    { ...ts("export { a } from '../world';"), errors: [{ messageId: 'import' }] },
    { ...ts("const m = import('../world');"), errors: [{ messageId: 'import' }] },
    { ...ts("const m = require('../world');"), errors: [{ messageId: 'import' }] },
    {
      ...ts('const path = "./world"; const m = import(path);'),
      errors: [{ messageId: 'import', data: { source: 'a computed path' } }],
    },
    {
      ...ts("import { x } from 'extra';"),
      options: [{ packages: ['farmer'] }],
      errors: [{ messageId: 'import' }],
    },
    // Files nested deeper than saves/<save>/.
    {
      ...inSave('export const a = 1;', 'saves/save-1/lib/util.ts'),
      errors: [{ messageId: 'nested' }],
    },
    {
      ...inSave('export const a = 1;', '/home/me/project/saves/save-1/a/b/util.ts'),
      errors: [{ messageId: 'nested' }],
    },
    {
      ...inSave('export const a = 1;', 'games/save-1/lib/util.ts'),
      options: [{ savesDirectory: 'games' }],
      errors: [{ messageId: 'nested' }],
    },
  ],
});
