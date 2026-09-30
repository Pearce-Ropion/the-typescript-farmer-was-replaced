import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseSync } from 'oxc-parser';

/**
 * The names exported by the `farmer` declaration files, grouped by what they are.
 */
export interface FarmerInfo {
  functions: Set<string>;
  enums: Set<string>;
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
