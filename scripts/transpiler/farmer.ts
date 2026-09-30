import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseSync } from 'oxc-parser';

import { pyFunctionName } from './naming.ts';

/**
 * The names exported by the `farmer` declaration files, grouped by what they are.
 */
export interface FarmerInfo {
  functions: Set<string>;
  enums: Set<string>;
}

/**
 * Functions that only exist in the declarations, to give one of the game's functions a more precise type.
 * They are translated to the game's function of that name.
 */
const PYTHON_FUNCTION_ALIASES: Record<string, string> = {
  measureEntity: 'measure',
  measurePos: 'measure',
};

/**
 * The name the game uses for a function of the `farmer` declarations.
 */
export function farmerFunctionName(name: string): string {
  return PYTHON_FUNCTION_ALIASES[name] ?? pyFunctionName(name);
}

/**
 * Reads the declaration files in `dir` to find out which names the game provides.
 */
export function loadFarmerInfo(dir: string): FarmerInfo {
  const info: FarmerInfo = {
    functions: new Set(),
    enums: new Set(),
  };

  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.d.ts') || file === 'index.d.ts') {
      continue;
    }
    const source = readFileSync(join(dir, file), 'utf8');
    const { program } = parseSync(file, source, { lang: 'dts' });
    for (const statement of program.body) {
      if (statement.type !== 'ExportNamedDeclaration' || !statement.declaration) {
        continue;
      }
      const declaration = statement.declaration;
      if (declaration.type === 'TSDeclareFunction' && declaration.id) {
        info.functions.add(declaration.id.name);
      } else if (declaration.type === 'TSEnumDeclaration') {
        info.enums.add(declaration.id.name);
      }
    }
  }
  return info;
}
