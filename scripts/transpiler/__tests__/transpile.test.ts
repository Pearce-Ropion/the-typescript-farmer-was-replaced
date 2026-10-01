import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ALLOWED_MEMBERS } from '../collections.ts';
import { buildProject, buildSaves, listSaves, pruneSaves } from '../project.ts';
import * as pyAst from '../py.ts';
import { transpileProject } from '../transpile.ts';

import { IMPORT, farmer, fails, py, root } from './helpers.ts';

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
      const pairs = [[1, 2]];
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

  it('translates the typed variants of measure back to measure', () => {
    const out = py(`
      import { Direction, measure, measureEntity, measurePos } from 'farmer';
      const petals = measureEntity();
      const next = measureEntity(Direction.North);
      const treasure = measurePos();
      const any = measure();
    `);
    expect(out).toBe(
      'petals = measure()\nnext = measure(North)\ntreasure = measure()\nany = measure()',
    );
  });

  it('converts to text with str()', () => {
    const out = py(`
      declare const n: number;
      declare const xs: number[];
      const a = String(n);
      const b = n.toString();
      const c = xs.toString();
      const d = (n + 1).toString();
    `);
    expect(out).toBe('a = str(n)\nb = str(n)\nc = str(xs)\nd = str(n + 1)');
  });

  it('translates native arrays, sets and objects', () => {
    const out = py(`${IMPORT}
      const l = [1, 2];
      l.push(3);
      const n = l.length;
      const s = new Set([1, 2]);
      s.delete(1);
      const has = s.has(2);
      const d = { a: 1, [Entities.Bush]: 2 };
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
      const a: number[] = [];
      const b = new Set<number>();
      const c: Record<string, number> = {};
      const d = new Set(a);
    `);
    expect(out).toBe('a = []\nb = set()\nc = {}\nd = set(a)');
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
      const v = a?.b ?? (a ? 1 : 2);
    `);
    expect(out).not.toMatch(/\S if .* else/);
  });
});

describe('native collections', () => {
  // One example for every member the lint rule allows. A member without an example fails the test below.
  const EXAMPLES: Record<string, [code: string, python: string]> = {
    'array.length': ['const n = xs.length;', 'n = len(xs)'],
    'array.push': ['xs.push(1);', 'xs.append(1)'],
    'array.pop': ['xs.pop();', 'xs.pop()'],
    'array.shift': ['xs.shift();', 'xs.pop(0)'],
    'array.unshift': ['xs.unshift(1);', 'xs.insert(0, 1)'],
    'array.splice': ['xs.splice(1, 0, 5); xs.splice(2, 1);', 'xs.insert(1, 5)\nxs.pop(2)'],
    'array.includes': ['const b = xs.includes(1);', 'b = 1 in xs'],
    'set.size': ['const n = s.size;', 'n = len(s)'],
    'set.add': ['s.add(1);', 's.add(1)'],
    'set.delete': ['s.delete(1);', 's.remove(1)'],
    'set.has': ['const b = s.has(1);', 'b = 1 in s'],
    'statics.Object.keys': ['const k = Object.keys(o);', 'k = list(o)'],
    'statics.Object.values': [
      'for (const v of Object.values(o)) { print(v); }',
      'for _key_1 in o:\n\tv = o[_key_1]\n\tprint(v)',
    ],
    'statics.Object.entries': [
      'for (const [k, v] of Object.entries(o)) { print(k, v); }',
      'for k in o:\n\tv = o[k]\n\tprint(k, v)',
    ],
  };

  const prelude = `
    import { print } from 'farmer';
    declare const xs: number[];
    declare const s: Set<number>;
    declare const o: Record<string, number>;
  `;

  const members = [
    ...ALLOWED_MEMBERS.array.map(name => `array.${name}`),
    ...ALLOWED_MEMBERS.set.map(name => `set.${name}`),
    ...ALLOWED_MEMBERS.object.map(name => `object.${name}`),
    ...ALLOWED_MEMBERS.statics.map(name => `statics.${name}`),
  ];

  it.each(members)('supports %s', member => {
    const example = EXAMPLES[member];
    expect(example, `add an example for ${member}`).toBeDefined();
    const out = py(`${prelude}${example[0]}`);
    expect(out).toBe(example[1]);
  });

  it('constructs sets and arrays', () => {
    const out = py(`
      const a = new Set<number>();
      const b = new Set([1, 2]);
      const c = new Set(a);
      const d: number[] = [];
    `);
    expect(out).toBe('a = set()\nb = {1, 2}\nc = set(a)\nd = []');
  });

  it('iterates arrays and sets directly', () => {
    const out = py(`
      import { print } from 'farmer';
      declare const xs: number[];
      declare const s: Set<number>;
      for (const x of xs) { print(x); }
      for (const y of s) { print(y); }
    `);
    expect(out).toBe('for x in xs:\n\tprint(x)\nfor y in s:\n\tprint(y)');
  });

  it('rejects Map', () => {
    const { errors } = transpileProject(
      [{ name: 'main', path: 'main.ts', source: 'const m = new Map();' }],
      farmer,
    );
    expect(errors[0]?.message).toMatch(/Map is not supported/);
  });
});

describe('for...of', () => {
  it('iterates the keys, values and entries of an object', () => {
    const out = py(`${IMPORT}
      const d = { a: 1 };
      for (const k of Object.keys(d)) { move(Direction.North); }
      for (const v of Object.values(d)) { move(Direction.North); }
      for (const [k2, v2] of Object.entries(d)) { move(Direction.North); }
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

  it('rejects conversions to a number', () => {
    fails('const a = Number("1");', /'Number' is not defined or not supported/);
    fails('const a = parseFloat("1");', /'parseFloat' is not defined or not supported/);
    fails('const a = +"1";', /Unary \+ converts to a number/);
    fails('declare const n: number; n.toString(2);', /toString\(\) expects 0/);
  });

  it('rejects unsupported methods', () => {
    fails('const a = [1]; a.map(x => x);', /The method 'map' is not supported/);
  });

  it('rejects syntax errors', () => {
    fails('let = ;', /main\.ts:1:\d+:/);
  });
});

describe('project', () => {
  it('builds a small save into valid python', () => {
    const dir = mkdtempSync(join(tmpdir(), 'farm-build-'));
    const srcDir = join(dir, 'save');
    const outDir = join(dir, 'out');
    mkdirSync(srcDir);
    try {
      writeFileSync(
        join(srcDir, 'counter.ts'),
        `
        import { move, Direction, getPosX } from 'farmer';

        let steps = 0;

        export function walk(count: number, direction = Direction.East): number {
          for (let i = 0; i < count; i++) {
            if (move(direction)) {
              steps += 1;
            }
          }
          return steps + getPosX();
        }
        `,
      );
      writeFileSync(
        join(srcDir, 'main.ts'),
        `
        import * as counter from './counter';

        const [first, second] = [counter.walk(2), counter.walk(3)];
        while (first < second) {
          counter.walk(1);
        }
        `,
      );

      const result = buildProject({ srcDir, outDir, farmerDir: join(root, 'types/farmer') });
      expect(result.errors).toEqual([]);
      const files = readdirSync(outDir).filter(file => file.endsWith('.py'));
      expect(files.toSorted()).toEqual(['counter.py', 'main.py']);

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
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('build failures', () => {
  const files = (sources: Record<string, string>) =>
    Object.entries(sources).map(([name, source]) => ({ name, path: `${name}.ts`, source }));

  it('reports only the syntax error, not the files that import the broken module', () => {
    const { errors, skipped, outputs } = transpileProject(
      files({
        broken: 'export function oops( {',
        user: "import { oops } from './broken'; export function user() { oops(); }",
        other: 'export const fine = 1;',
      }),
      farmer,
    );
    expect(errors.map(error => error.file)).toEqual(['broken.ts']);
    expect(skipped).toEqual([{ name: 'user', path: 'user.ts', because: 'broken' }]);
    expect(outputs.map(output => output.name)).toEqual(['other']);
  });

  it('keeps building the other files after a transpile error', () => {
    const { errors, outputs } = transpileProject(
      files({ bad: 'class A {}', good: 'export const x = 1;' }),
      farmer,
    );
    expect(errors).toHaveLength(1);
    expect(outputs.map(output => output.name)).toEqual(['good']);
  });

  it('reports a bug in the transpiler against the file instead of throwing', () => {
    const brokenFarmer = { functions: undefined, enums: undefined } as never;
    const { errors, outputs } = transpileProject(
      files({
        bug: "import { move } from 'farmer'; move();",
        good: 'export const x = 1;',
      }),
      brokenFarmer,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/bug\.ts:1:1: Internal transpiler error/);
    expect(errors[0].cause).toBeInstanceOf(Error);
    expect(outputs.map(output => output.name)).toEqual(['good']);
  });

  it('keeps the previous python file and reports it as out of date', () => {
    const dir = mkdtempSync(join(tmpdir(), 'farm-stale-'));
    const srcDir = join(dir, 'src');
    const outDir = join(dir, 'build');
    mkdirSync(srcDir);
    const options = { srcDir, outDir, farmerDir: join(root, 'types/farmer') };
    try {
      writeFileSync(join(srcDir, 'a.ts'), 'export const a = 1;\n');
      writeFileSync(join(srcDir, 'b.ts'), 'export const b = 2;\n');
      expect(buildProject(options)).toMatchObject({ errors: [], stale: [], skipped: [] });
      const before = readFileSync(join(outDir, 'a.py'), 'utf8');

      writeFileSync(join(srcDir, 'a.ts'), 'class Oops {}\n');
      writeFileSync(join(srcDir, 'b.ts'), 'export const b = 3;\n');
      const result = buildProject(options);
      expect(result.errors).toHaveLength(1);
      expect(result.stale).toEqual([join(outDir, 'a.py')]);
      expect(readFileSync(join(outDir, 'a.py'), 'utf8')).toBe(before);
      expect(readFileSync(join(outDir, 'b.py'), 'utf8')).toContain('b = 3');

      writeFileSync(join(srcDir, 'a.ts'), 'export const a = 4;\n');
      expect(buildProject(options).stale).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('saves', () => {
  const withSaves = (
    run: (options: { savesDir: string; outDir: string; farmerDir: string }) => void,
  ) => {
    const dir = mkdtempSync(join(tmpdir(), 'farm-saves-'));
    try {
      const savesDir = join(dir, 'saves');
      mkdirSync(join(savesDir, 'one'), { recursive: true });
      mkdirSync(join(savesDir, 'two'), { recursive: true });
      mkdirSync(join(savesDir, '.hidden'), { recursive: true });
      writeFileSync(join(savesDir, 'notes.txt'), 'not a save');
      run({ savesDir, outDir: join(dir, 'builds'), farmerDir: join(root, 'types/farmer') });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it('lists the directories of the saves directory as saves', () => {
    withSaves(({ savesDir }) => {
      expect(listSaves(savesDir)).toEqual(['one', 'two']);
      expect(listSaves(join(savesDir, 'missing'))).toEqual([]);
    });
  });

  it('builds every save into its own directory', () => {
    withSaves(options => {
      writeFileSync(
        join(options.savesDir, 'one/main.ts'),
        "import { a } from './util';\nexport const x = a;\n",
      );
      writeFileSync(join(options.savesDir, 'one/util.ts'), 'export const a = 1;\n');
      writeFileSync(join(options.savesDir, 'two/main.ts'), 'export const y = 2;\n');

      const results = buildSaves(options);
      expect(results.map(({ save }) => save)).toEqual(['one', 'two']);
      expect(results.every(({ result }) => result.errors.length === 0)).toBe(true);
      expect(readdirSync(join(options.outDir, 'one')).toSorted()).toEqual(['main.py', 'util.py']);
      expect(readdirSync(join(options.outDir, 'two'))).toEqual(['main.py']);
    });
  });

  it('keeps the saves separate, so one save cannot import another', () => {
    withSaves(options => {
      writeFileSync(join(options.savesDir, 'one/util.ts'), 'export const a = 1;\n');
      writeFileSync(
        join(options.savesDir, 'two/main.ts'),
        "import { a } from './util';\nexport const x = a;\n",
      );

      const [, two] = buildSaves(options);
      expect(two.result.errors[0]?.message).toMatch(/Cannot find the module '\.\/util'/);
    });
  });

  it('builds only the saves it is asked to', () => {
    withSaves(options => {
      writeFileSync(join(options.savesDir, 'one/main.ts'), 'export const x = 1;\n');
      writeFileSync(join(options.savesDir, 'two/main.ts'), 'export const y = 2;\n');

      buildSaves(options, ['two']);
      expect(readdirSync(options.outDir)).toEqual(['two']);
    });
  });

  it('removes the output of a save that was deleted', () => {
    withSaves(options => {
      writeFileSync(join(options.savesDir, 'one/main.ts'), 'export const x = 1;\n');
      writeFileSync(join(options.savesDir, 'two/main.ts'), 'export const y = 2;\n');
      buildSaves(options);

      rmSync(join(options.savesDir, 'two'), { recursive: true });
      expect(pruneSaves(options)).toEqual([join(options.outDir, 'two/main.py')]);
      expect(readdirSync(options.outDir)).toEqual(['one']);
    });
  });
});
