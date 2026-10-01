import { IMPORT, fails, py } from './helpers.ts';

const PRINT = "import { print } from 'farmer';\n";

describe('loops', () => {
  it('writes do...while as a loop that checks its condition at the end', () => {
    const out = py(`
      declare const n: number;
      function f() {
        let i = 0;
        do { i += 1; } while (i < n);
      }
    `);
    expect(out).toContain('i = 0\n\twhile True:\n\t\ti += 1\n\t\tif not i < n:\n\t\t\tbreak');
  });

  it('rejects continue inside do...while, which would skip the condition', () => {
    fails('declare const n: number; do { if (n) { continue; } } while (n);', /continue/);
  });

  it('supports break and continue', () => {
    const out = py(`${PRINT}
      for (let i = 0; i < 3; i++) {
        if (i === 1) { continue; }
        if (i === 2) { break; }
        print(i);
      }
    `);
    expect(out).toBe(
      'for i in range(3):\n\tif i == 1:\n\t\tcontinue\n\tif i == 2:\n\t\tbreak\n\tprint(i)',
    );
  });

  it('nests a loop that cannot be written as range inside one that can', () => {
    const out = py(`${PRINT}
      declare const n: number;
      for (let i = 0; i < 3; i++) {
        for (let j = n; j > 0; j = j - 1) { print(j); }
      }
    `);
    expect(out).toBe('for i in range(3):\n\tj = n\n\twhile j > 0:\n\t\tprint(j)\n\t\tj = j - 1');
  });

  it('rejects continue in a loop that cannot be written as range', () => {
    fails('declare const n: number; for (let i = 0; n; i += n) { continue; }', /continue/);
  });

  it('loops over the keys of an object with for...in', () => {
    const out = py(`${PRINT}
      const o = { a: 1 };
      for (const k in o) { print(k); }
    `);
    expect(out).toBe('o = {"a": 1}\nfor k in o:\n\tprint(k)');
  });

  it('counts down and by steps', () => {
    const out = py(`${PRINT}
      for (let i = 5; i >= 1; i--) { print(i); }
      for (let j = 0; j < 10; j += 3) { print(j); }
    `);
    expect(out).toContain('for i in range(5, 0, -1):');
    expect(out).toContain('for j in range(0, 10, 3):');
  });

  it('includes the limit of <= when it is not a literal', () => {
    const out = py(`${PRINT}
      declare const n: number;
      for (let i = 0; i <= n; i++) { print(i); }
    `);
    expect(out).toContain('for i in range(n + 1):');
  });

  it('writes a loop that changes its own counter as a while loop', () => {
    const out = py(`${PRINT}
      for (let i = 0; i < 10; i++) { if (i === 3) { i += 2; } print(i); }
    `);
    expect(out).toContain('i = 0\nwhile i < 10:');
    expect(out).toContain('\ti += 1');
  });

  it('writes a for loop without a condition as an endless loop', () => {
    expect(py('for (;;) { break; }')).toBe('while True:\n\tbreak');
  });

  it('puts statements of a loop body without braces in the loop', () => {
    expect(py('declare let x: number; while (x) x = 0;')).toBe('while x:\n\tx = 0');
  });
});

describe('statements', () => {
  it('defines functions before the code that uses them', () => {
    expect(py('f(); function f() {}')).toBe('def f():\n\tpass\n\n\nf()');
  });

  it('writes empty blocks as pass', () => {
    expect(py('declare const x: number; if (x) {} else {}')).toBe('if x:\n\tpass\nelse:\n\tpass');
  });

  it('supports statements without braces', () => {
    expect(py('declare const x: number; let y = 0; if (x) y = 1; else y = 2;')).toBe(
      'y = 0\nif x:\n\ty = 1\nelse:\n\ty = 2',
    );
  });

  it('declares every variable of a multiple declaration', () => {
    expect(py('let a = 1, b = 2, c;')).toBe('a = 1\nb = 2\nc = None');
  });

  it('declares globals for every way of assigning a module variable', () => {
    const out = py(`
      let a = 0;
      let b = 0;
      let c = 0;
      let d = { n: 0 };
      function f() {
        a += 1;
        b++;
        [c, a] = [a, c];
        d.n = 1;
      }
    `);
    expect(out).toContain('def f():\n\tglobal a, b, c\n');
    expect(out).not.toContain('global d');
  });

  it('does not declare a global for a local with the same name', () => {
    const out = py(`
      let a = 0;
      function f() { let a = 1; a += 1; return a; }
    `);
    expect(out).toContain('def f():\n\ta = 1\n\ta += 1\n\treturn a');
  });

  it('skips directives and types', () => {
    expect(
      py(`
        'use strict';
        interface Shape { size: number }
        type Id = number;
        declare const x: number;
        export interface Other {}
      `),
    ).toBe('');
  });

  it('exports are plain definitions', () => {
    expect(py('export const a = 1; export function f() {} export let b = 2;')).toBe(
      'def f():\n\tpass\n\n\na = 1\nb = 2',
    );
  });

  it('defines top level arrow functions as functions', () => {
    expect(py('export const double = (n: number) => n * 2;')).toBe(
      'def double(n):\n\treturn n * 2',
    );
  });
});

describe('functions', () => {
  it('supports literal defaults', () => {
    expect(py('function f(a = -1, b = undefined, c = "x", d = true, e = null) {}')).toBe(
      'def f(a=-1, b=None, c="x", d=True, e=None):\n\tpass',
    );
  });

  it('supports rest parameters and spread arguments', () => {
    const out = py(`${PRINT}
      declare const xs: number[];
      function f(...args: number[]) { print(...args); }
      f(1, ...xs);
    `);
    expect(out).toBe('def f(*args):\n\tprint(*args)\n\n\nf(1, *xs)');
  });

  it('rejects a required parameter after an optional one', () => {
    fails('function f(a = 1, b: number) {}', /required parameter cannot follow an optional one/);
  });

  it('rejects destructured parameters', () => {
    fails('function f([a]: number[]) {}', /Destructured parameters are not supported/);
    fails('function f({ a }: { a: number }) {}', /Destructured parameters are not supported/);
  });

  it('rejects nested functions', () => {
    fails('function f() { function g() {} }', /Nested functions are not supported/);
    fails('function f() { const g = () => 1; }', /only be declared at the top level/);
  });

  it('rejects async and generator functions', () => {
    fails('async function f() {}', /Async and generator functions are not supported/);
    fails('function* f() {}', /Async and generator functions are not supported/);
  });

  it('avoids python keywords for names', () => {
    expect(py('function pass(lambda: number) { return lambda; } pass(1);')).toBe(
      'def pass_(lambda_):\n\treturn lambda_\n\n\npass_(1)',
    );
  });
});

describe('expressions', () => {
  it('keeps and flattens boolean operators', () => {
    const out = py(`
      declare const a: boolean;
      declare const b: boolean;
      declare const c: boolean;
      const r = a && b && c;
      const s = a || b && c;
      const t = (a || b) && c;
    `);
    expect(out).toBe('r = a and b and c\ns = a or b and c\nt = (a or b) and c');
  });

  it('compares with null and undefined', () => {
    const out = py(`
      declare const x: number | null;
      const a = x === null;
      const b = x !== undefined;
      const c = x == null;
    `);
    expect(out).toBe('a = x == None\nb = x != None\nc = x == None');
  });

  it('writes numbers and strings the way python reads them', () => {
    expect(py('const n = 1_000 + 0xff + 1.5 + 1e3;')).toBe('n = 1000 + 255 + 1.5 + 1000');
    expect(py('const s = "a\\"b\\n";')).toBe('s = "a\\"b\\n"');
  });

  it('writes template literals as concatenation', () => {
    const out = py(`
      declare const a: number;
      const x = \`\${a}\`;
      const y = \`n=\${a}!\`;
      const z = \`\`;
      const w = \`plain\`;
    `);
    expect(out).toBe('x = str(a)\ny = "n=" + str(a) + "!"\nz = ""\nw = "plain"');
  });

  it('applies compound assignments to variables and object members', () => {
    const out = py(`
      let x = 1;
      x -= 2;
      x *= 3;
      x /= 4;
      x %= 5;
      x **= 2;
      const o = { n: 1 };
      o.n += 1;
      o.n++;
      o["m"] = 2;
    `);
    expect(out).toBe(
      [
        'x = 1',
        'x -= 2',
        'x *= 3',
        'x /= 4',
        'x %= 5',
        'x **= 2',
        'o = {"n": 1}',
        'o["n"] += 1',
        'o["n"] += 1',
        'o["m"] = 2',
      ].join('\n'),
    );
  });

  it('removes keys with delete', () => {
    const out = py(`
      declare const k: string;
      const o: Record<string, number> = {};
      delete o.a;
      delete o[k];
    `);
    expect(out).toBe('o = {}\no.pop("a")\no.pop(k)');
  });

  it('ignores type assertions', () => {
    const out = py(`
      declare const u: unknown;
      const a = (1 as number) + (2 satisfies number);
      const b = <number>3;
      const c = (u as number)!;
    `);
    expect(out).toBe('a = 1 + 2\nb = 3\nc = u');
  });

  it('uses math helpers', () => {
    const out = py(`
      declare const a: number;
      const p = Math.max(a, 1) + Math.min(a, 2) + Math.abs(a);
      const q = Math.floor(a / 2);
      const r = Math.floor(a);
    `);
    expect(out).toBe('p = max(a, 1) + min(a, 2) + abs(a)\nq = a // 2\nr = a // 1');
  });

  it('keeps precedence when operands are themselves operations', () => {
    expect(py('declare const a: number; const x = (a + 1) * (a - 1) / (a % 2);')).toBe(
      'x = (a + 1) * (a - 1) / (a % 2)',
    );
    expect(py('declare const a: number; const x = a - (a - 1);')).toBe('x = a - (a - 1)');
  });
});

describe('modules and the game api', () => {
  it('reaches the game through a namespace import', () => {
    const out = py(`
      import * as farmer from 'farmer';
      farmer.move(farmer.Direction.North);
      const e = farmer.Entities.Bush;
    `);
    expect(out).toBe('move(North)\ne = Entities.Bush');
  });

  it('uses the python names of the game directly', () => {
    expect(py(`${IMPORT} move(Direction.West); const e = Entities.Dead_Pumpkin;`)).toBe(
      'move(West)\ne = Entities.Dead_Pumpkin',
    );
  });

  it('imports exported constants and functions from other modules', () => {
    const out = py(
      `
        import { LIMIT, run as go } from './lib';
        import * as lib from './lib';
        go(lib.LIMIT + LIMIT);
        lib.run(1);
      `,
      { lib: 'export const LIMIT = 3;\nexport function run(n: number) { return n; }' },
    );
    expect(out).toBe('import lib\n\nlib.run(lib.LIMIT + lib.LIMIT)\nlib.run(1)');
  });

  it('rejects things that cannot be imported', () => {
    fails("import { x } from './missing';", /Cannot find the module '\.\/missing'/);
    fails("import { x } from './a/b';", /Cannot find the module '\.\/a\/b'/);
    fails("import { nope } from './lib';", /'lib' does not export 'nope'/, {
      lib: 'export const yes = 1;',
    });
    fails("import { hidden } from './lib';", /'lib' does not export 'hidden'/, {
      lib: 'const hidden = 1;',
    });
    fails("import fs from 'node:fs';", /Cannot import 'node:fs'/);
    fails("import f from 'farmer';", /Default imports are not supported/);
    fails("import f from './lib';", /Default imports are not supported/, {
      lib: 'export const a = 1;',
    });
  });

  it('rejects default exports and re-exports', () => {
    fails('export default 1;', /Default and re-exports are not supported/);
    fails("export * from './lib';", /Default and re-exports are not supported/, {
      lib: 'export const a = 1;',
    });
  });

  it('rejects assigning to an imported value', () => {
    fails("import { n } from './lib'; n = 2;", /Cannot assign to 'n'/, {
      lib: 'export let n = 1;',
    });
    fails("import * as lib from './lib'; lib.n = 2;", /Cannot assign to an imported value/, {
      lib: 'export let n = 1;',
    });
  });
});

describe('unsupported syntax', () => {
  it.each([
    ['switch', 'switch (1) { }', /SwitchStatement is not supported/],
    ['try', 'try { } catch { }', /TryStatement is not supported/],
    ['throw', 'throw 1;', /ThrowStatement is not supported/],
    ['labels', 'a: while (true) { break a; }', /LabeledStatement is not supported/],
    ['classes', 'class A {}', /ClassDeclaration is not supported/],
    ['this', 'function f() { return this; }', /ThisExpression is not supported/],
    ['await', 'declare const p: number; const x = await p;', /AwaitExpression is not supported/],
    ['regular expressions', 'const r = /a/;', /Regular expressions are not supported/],
    ['bigint', 'const b = 1n;', /BigInt is not supported/],
    ['bitwise operators', 'const x = 1 | 2;', /The '\|' operator is not supported/],
    ['typeof', 'const x = typeof 1;', /The 'typeof' operator is not supported/],
    ['void', 'const x = void 0;', /The 'void' operator is not supported/],
    ['unary plus', 'const x = +"1";', /Unary \+ converts to a number/],
    ['spread in arrays', 'declare const a: number[]; const x = [...a];', /Spread is not supported/],
    ['array holes', 'const x = [1, , 2];', /Array holes are not supported/],
    ['object spread', 'declare const o: object; const x = { ...o };', /Only plain key: value/],
    ['object methods', 'const x = { m() {} };', /Only plain key: value/],
    [
      'object destructuring',
      'declare const o: { a: number }; const { a } = o;',
      /Object destructuring/,
    ],
    [
      'assignments as values',
      'let a = 1; const b = (a = 2);',
      /Assignments can only be used as statements/,
    ],
    [
      'increments as values',
      'let a = 1; const b = a++;',
      /Assignments can only be used as statements/,
    ],
    [
      'chained assignments',
      'let a = 1; let b = 1; a = b = 2;',
      /Chained assignments are not supported/,
    ],
    ['logical assignments', 'let a = 1; a ||= 2;', /The '\|\|=' operator is not supported/],
    ['optional calls', 'declare const f: () => void; f?.();', /Optional calls are not supported/],
    ['math functions', 'const x = Math.round(1.5);', /Math\.round is not supported/],
    ['other constructors', 'const x = new Date();', /Only Set can be constructed/],
    ['unknown names', 'const x = foo;', /'foo' is not defined or not supported/],
    ['unknown calls', 'foo();', /'foo' is not defined or not supported/],
    [
      'unknown methods',
      'declare const o: number[]; o.map(1);',
      /The method 'map' is not supported/,
    ],
    [
      'calling a computed member',
      'declare const o: { a: () => void }; o["a"]();',
      /Only named functions can be called/,
    ],
  ])('rejects %s', (_name, source, message) => {
    fails(source, message);
  });

  it('points at the first unsupported syntax with a line and column', () => {
    fails('const a = 1;\nconst b = 2;\n  switch (a) {}', /main\.ts:3:3: SwitchStatement/);
  });
});
