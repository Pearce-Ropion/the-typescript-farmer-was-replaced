import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadFarmerInfo } from './farmer.ts';
import { pyFunctionName, toSnakeCase } from './naming.ts';
import { buildProject } from './project.ts';
import * as pyAst from './py.ts';
import { transpileProject } from './transpile.ts';

const root = resolve(import.meta.dirname, '../..');
const farmer = loadFarmerInfo(join(root, 'src/farmer'));

/** Transpiles `source` as the module `main` and returns the Python without the header. */
function py(source: string, others: Record<string, string> = {}): string {
  const files = Object.entries({ main: source, ...others }).map(([name, code]) => ({
    name,
    path: `${name}.ts`,
    source: code,
  }));
  const { outputs, errors } = transpileProject(files, farmer);
  if (errors.length) {
    throw errors[0];
  }
  const code = outputs.find(output => output.name === 'main')!.code;
  // The tests write nested blocks with tabs, which is easier to read than four spaces.
  return code
    .split('\n')
    .slice(2)
    .join('\n')
    .trim()
    .replace(/^( {4})+/gm, indent => '\t'.repeat(indent.length / 4));
}

const IMPORT = "import { move, Direction, Entities, List, HashSet, Dict } from 'farmer';\n";

describe('naming', () => {
  it('converts camelCase to snake_case', () => {
    expect(toSnakeCase('getPosX')).toBe('get_pos_x');
    expect(toSnakeCase('doAFlip')).toBe('do_a_flip');
    expect(toSnakeCase('quickPrint')).toBe('quick_print');
    expect(toSnakeCase('print')).toBe('print');
  });

  it('avoids python keywords', () => {
    expect(pyFunctionName('pass')).toBe('pass_');
  });

  it('maps every function of the game API to its python name', () => {
    const expected = [
      'harvest',
      'can_harvest',
      'plant',
      'swap',
      'till',
      'use_item',
      'clear',
      'change_hat',
      'move',
      'can_move',
      'get_pos_x',
      'get_pos_y',
      'get_world_size',
      'get_entity_type',
      'get_ground_type',
      'get_water',
      'num_items',
      'get_companion',
      'measure',
      'spawn_drone',
      'wait_for',
      'has_finished',
      'max_drones',
      'num_drones',
      'get_time',
      'get_tick_count',
      'set_execution_speed',
      'set_world_size',
      'simulate',
      'get_cost',
      'unlock',
      'num_unlocked',
      'random',
      'min',
      'max',
      'abs',
      'print',
      'quick_print',
      'do_a_flip',
      'pet_the_piggy',
      'leaderboard_run',
    ];
    const actual = [...farmer.functions].map(pyFunctionName);
    expect(actual.toSorted()).toEqual(expected.toSorted());
  });
});

describe('statements', () => {
  it('translates functions, conditionals and loops', () => {
    const out = py(`
      function f(a: number, b = 2) {
        if (a > b) { return a; } else if (a === b) { return b; } else { return 0; }
      }
      while (true) { f(1); }
    `);
    expect(out).toBe(
      [
        'def f(a, b=2):',
        '\tif a > b:',
        '\t\treturn a',
        '\telif a == b:',
        '\t\treturn b',
        '\telse:',
        '\t\treturn 0',
        '',
        '',
        'while True:',
        '\tf(1)',
      ].join('\n'),
    );
  });

  it('writes counting loops as range loops', () => {
    const out = py(`
      function f(n: number) {
        for (let i = 0; i < n; i++) { g(i); }
        for (let i = 1; i <= 5; i++) { g(i); }
        for (let i = 10; i > 0; i -= 2) { g(i); }
      }
      function g(_x: number) {}
    `);
    expect(out).toContain('for i in range(n):');
    expect(out).toContain('for i in range(1, 6):');
    expect(out).toContain('for i in range(10, 0, -2):');
  });

  it('falls back to a while loop', () => {
    const out = py(`
      function f() {
        for (let i = 0; i < 10; i++) { i += 1; }
      }
    `);
    expect(out).toContain('i = 0\n\twhile i < 10:\n\t\ti += 1\n\t\ti += 1');
  });

  it('declares globals for assigned module variables', () => {
    const out = py(`
      let count = 0;
      const limit = 3;
      function bump() { count += 1; return limit; }
    `);
    expect(out).toContain('def bump():\n\tglobal count\n\tcount += 1\n\treturn limit');
    expect(out).toContain('count = 0\nlimit = 3');
  });

  it('evaluates non-literal default arguments on every call', () => {
    const out = py(`
      function now() { return 1; }
      function f(a = now(), b = 5, c?: number) { return a; }
    `);
    expect(out).toContain('def f(a=None, b=5, c=None):\n\tif a == None:\n\t\ta = now()');
  });

  it('does the same for arrow functions passed as values', () => {
    const out = py(`
      import { spawnDrone } from 'farmer';
      function work(n: number) { return n; }
      spawnDrone(() => work(1));
    `);
    expect(out).toContain('def _arrow_1():\n\treturn work(1)');
    expect(out).toContain('spawn_drone(_arrow_1)');
  });

  it('supports tuple destructuring', () => {
    const out = py(`
      import { getPosX, getPosY } from 'farmer';
      const [x, y] = [getPosX(), getPosY()];
    `);
    expect(out).toBe('x = get_pos_x()\ny = get_pos_y()');
  });
});

describe('destructuring', () => {
  it('captures values first when a swap would read an assigned variable', () => {
    const out = py('let a = 1; let b = 2; [a, b] = [b, a];');
    expect(out).toBe('a = 1\nb = 2\n_tmp_1 = b\n_tmp_2 = a\na = _tmp_1\nb = _tmp_2');
  });

  it('indexes into values that are not array literals', () => {
    const out = py(`
      import { getCompanion, print } from 'farmer';
      const companion = getCompanion();
      if (companion !== null) {
        const [kind, [x, y]] = companion;
        print(kind, x, y);
      }
    `);
    expect(out).toContain('kind = companion[0]\n\tx = companion[1][0]\n\ty = companion[1][1]');
  });

  it('unpacks loop variables at the top of the loop body', () => {
    const out = py(`${IMPORT}
      const pairs = new List([[1, 2]]);
      for (const [a, b] of pairs) { move(Direction.North); }
    `);
    expect(out).toContain('for _tmp_1 in pairs:\n\ta = _tmp_1[0]\n\tb = _tmp_1[1]');
  });
});

describe('python output', () => {
  it('refuses constructs the game does not have', () => {
    const conditional = {
      nodeType: 'IfExp',
      lineno: 1,
      col_offset: 0,
      test: pyAst.name('a'),
      body: pyAst.name('b'),
      orelse: pyAst.name('c'),
    };
    expect(() =>
      pyAst.printModule(pyAst.moduleNode([pyAst.assign(pyAst.name('x', true), conditional)])),
    ).toThrow(/IfExp/);
  });

  it('separates definitions with blank lines', () => {
    const code = pyAst.printModule(
      pyAst.moduleNode([
        pyAst.functionDef('f', [], null, [pyAst.pass()]),
        pyAst.assign(pyAst.name('x', true), pyAst.constant(1)),
      ]),
    );
    expect(code).toContain('def f():\n    pass\n\n\nx = 1');
  });
});

describe('expressions', () => {
  it('maps operators and keeps precedence', () => {
    expect(py('const a = (1 + 2) * 3 - (4 - 5);')).toBe('a = (1 + 2) * 3 - (4 - 5)');
    expect(py('const a = !(1 === 2) && (true || false);')).toBe(
      'a = not 1 == 2 and (True or False)',
    );
    expect(py('const a = (-2) ** 2;')).toBe('a = (-2) ** 2');
  });

  it('translates Math helpers', () => {
    const out = py(`
      const a = Math.floor(7 / 2);
      const b = Math.floor(0.5 * 4);
      const c = Math.abs(-1) + Math.min(1, 2);
    `);
    expect(out).toBe('a = 7 // 2\nb = 0.5 * 4 // 1\nc = abs(-1) + min(1, 2)');
  });

  it('turns template literals into concatenation', () => {
    expect(py('const a = `x${1 + 2}y`;')).toBe('a = "x" + str(1 + 2) + "y"');
  });

  it('translates game enums and functions', () => {
    const out = py(`
      import { Entities, Direction, Unlocks, move, getPosX } from 'farmer';
      move(Direction.North);
      const e = Entities.Bush;
      const u = Unlocks.Carrots;
      getPosX();
    `);
    expect(out).toBe('move(North)\ne = Entities.Bush\nu = Unlocks.Carrots\nget_pos_x()');
  });

  it('translates the collection primitives', () => {
    const out = py(`${IMPORT}
      const l = new List([1, 2]);
      l.push(3);
      const n = l.length;
      const s = new HashSet([1, 2]);
      s.delete(1);
      const has = s.has(2);
      const d = new Dict({ a: 1, [Entities.Bush]: 2 });
      const v = d.a;
      d.b = 3;
    `);
    expect(out).toBe(
      [
        'l = [1, 2]',
        'l.append(3)',
        'n = len(l)',
        's = {1, 2}',
        's.remove(1)',
        'has = 2 in s',
        'd = {"a": 1, Entities.Bush: 2}',
        'v = d["a"]',
        'd["b"] = 3',
      ].join('\n'),
    );
  });

  it('translates empty and copied collections', () => {
    const out = py(`${IMPORT}
      const a = new List<number>();
      const b = new HashSet<number>();
      const c = new Dict<string, number>();
      const d = new List(a);
    `);
    expect(out).toBe('a = []\nb = set()\nc = {}\nd = list(a)');
  });

  it('translates optional chaining and nullish coalescing without conditional expressions', () => {
    const out = py(`
      declare const a: { b: number } | null;
      const c = a?.b;
      const d = c ?? 5;
    `);
    expect(out).toBe(
      [
        '_tmp_1 = None',
        'if a != None:',
        '\t_tmp_1 = a["b"]',
        'c = _tmp_1',
        '_tmp_2 = c',
        'if _tmp_2 == None:',
        '\t_tmp_2 = 5',
        'd = _tmp_2',
      ].join('\n'),
    );
  });

  it('turns "in" checks into membership tests', () => {
    expect(py("const k = 'a'; const o = {}; const r = !(k in o);")).toContain('r = k not in o');
  });
});

describe('conditional expressions', () => {
  it('writes a conditional assignment as an if statement', () => {
    const out = py(`
      declare const x: number;
      const a = x > 0 ? 1 : x < 0 ? -1 : 0;
      let b = 0;
      b = x ? 2 : 3;
    `);
    expect(out).toBe(
      [
        'if x > 0:',
        '\ta = 1',
        'elif x < 0:',
        '\ta = -1',
        'else:',
        '\ta = 0',
        'b = 0',
        'if x:',
        '\tb = 2',
        'else:',
        '\tb = 3',
      ].join('\n'),
    );
  });

  it('writes a conditional return as an if statement', () => {
    const out = py('function f(x: number) { return x ? 1 : 2; }');
    expect(out).toBe('def f(x):\n\tif x:\n\t\treturn 1\n\telse:\n\t\treturn 2');
  });

  it('hoists a conditional that is part of a larger expression', () => {
    const out = py('declare const x: number; const a = 1 + (x ? 2 : 3);');
    expect(out).toBe('if x:\n\t_tmp_1 = 2\nelse:\n\t_tmp_1 = 3\na = 1 + _tmp_1');
  });

  it('only evaluates the right side of && when needed', () => {
    const out = py('declare const x: number; declare const y: number; const a = x && (y ? 1 : 2);');
    expect(out).toContain('_tmp_2 = x\nif _tmp_2:');
    expect(out).toContain('_tmp_2 = _tmp_1');
  });

  it('re-checks a loop condition that needs statements on every iteration', () => {
    const out = py(
      'declare const x: number; while (x ? 1 : 0) { x; }'.replace('x; }', 'g(); } function g() {}'),
    );
    expect(out).toContain('while True:\n\tif x:\n\t\t_tmp_1 = 1');
    expect(out).toContain('\tif not _tmp_1:\n\t\tbreak\n\tg()');
  });

  it('never emits an inline conditional expression', () => {
    const out = py(`${IMPORT}
      declare const a: { b: number } | null;
      const s = new HashSet([1]);
      const v = s.get(1) ?? (a?.b ? 1 : 2);
    `);
    expect(out).not.toMatch(/\S if .* else/);
  });
});

describe('for...of', () => {
  it('iterates lists and sets directly', () => {
    const out = py(`${IMPORT}
      const l = new List([1, 2]);
      for (const x of l) { move(Direction.North); }
    `);
    expect(out).toContain('for x in l:');
  });

  it('iterates dictionaries by key, value and entry', () => {
    const out = py(`${IMPORT}
      const d = new Dict({ a: 1 });
      for (const k of d.keys()) { move(Direction.North); }
      for (const v of d.values()) { move(Direction.North); }
      for (const [k2, v2] of d.entries()) { move(Direction.North); }
    `);
    expect(out).toContain('for k in d:');
    expect(out).toContain('for _key_1 in d:\n\tv = d[_key_1]');
    expect(out).toContain('for k2 in d:\n\tv2 = d[k2]');
  });
});

describe('modules', () => {
  it('rewrites references to other modules', () => {
    const out = py(
      `
      import * as world from './world';
      import { getEdge, EDGE } from './world';
      world.getEdge();
      const a = getEdge() + EDGE + world.EDGE;
    `,
      { world: 'export function getEdge() { return 1; }\nexport const EDGE = 2;' },
    );
    expect(out).toBe(
      'import world\n\nworld.get_edge()\na = world.get_edge() + world.EDGE + world.EDGE',
    );
  });
});

describe('errors', () => {
  const fails = (source: string, message: RegExp) => {
    const { errors } = transpileProject([{ name: 'main', path: 'main.ts', source }], farmer);
    expect(errors[0]?.message).toMatch(message);
  };

  it('reports the location of unsupported syntax', () => {
    fails('const a = 1;\nclass A {}', /main\.ts:2:1: ClassDeclaration is not supported/);
  });

  it('rejects shadowed variables', () => {
    fails('function f() { const a = 1; { const a = 2; } }', /shadows another variable/);
  });

  it('rejects closures', () => {
    fails(
      "import { spawnDrone } from 'farmer'; function f(a: number) { spawnDrone(() => a); }",
      /Closures aren't supported/,
    );
  });

  it('rejects unsupported methods', () => {
    fails('const a = [1]; a.map(x => x);', /The method 'map' is not supported/);
  });

  it('rejects syntax errors', () => {
    fails('let = ;', /main\.ts:1:\d+:/);
  });
});

describe('project', () => {
  it('builds src/farm into valid python', () => {
    const outDir = mkdtempSync(join(tmpdir(), 'farm-build-'));
    try {
      const result = buildProject({
        srcDir: join(root, 'src/farm'),
        outDir,
        farmerDir: join(root, 'src/farmer'),
      });
      expect(result.errors).toEqual([]);
      const files = readdirSync(outDir).filter(file => file.endsWith('.py'));
      expect(files).toContain('main.py');

      const python = spawnSync('python3', ['--version']);
      if (python.status === 0) {
        for (const file of files) {
          const check = spawnSync('python3', [
            '-c',
            'import ast, sys; ast.parse(open(sys.argv[1]).read())',
            join(outDir, file),
          ]);
          expect(check.stderr.toString(), file).toBe('');
        }
      }
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
