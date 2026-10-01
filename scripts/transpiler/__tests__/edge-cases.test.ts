import { transpileProject } from '../transpile.ts';

import { IMPORT, farmer, fails, py } from './helpers.ts';

const PRINT = "import { print } from 'farmer';\n";

describe('imports and exports', () => {
  it('skips type-only imports', () => {
    const out = py(
      `
      import type { Entities } from 'farmer';
      import { type Direction, move } from 'farmer';
      import type { T } from './lib';
      import { type U, f } from './lib';
      move();
      f();
    `,
      { lib: 'export function f() {}\nexport type T = number;\nexport type U = number;' },
    );
    expect(out).toBe('import lib\n\nmove()\nlib.f()');
  });

  it('ignores imports of names the game only has as types', () => {
    expect(py("import { Drone, move } from 'farmer'; move();")).toBe('move()');
  });

  it('exports with an export list', () => {
    const out = py("import { a, b } from './lib';\nconst c = a + b;", {
      lib: 'const a = 1;\nconst b = 2;\nexport { a, b };\nexport { nothing };',
    });
    expect(out).toBe('import lib\n\nc = lib.a + lib.b');
  });

  it('does not let an export list expose what is not declared', () => {
    fails("import { x } from './lib';", /'lib' does not export 'x'/, {
      lib: 'export { x };',
    });
  });

  it('rejects members a module does not export', () => {
    fails("import * as lib from './lib'; lib.nope();", /'lib' does not export 'nope'/, {
      lib: 'export const a = 1;',
    });
  });

  it('rejects members the game does not provide', () => {
    fails(
      "import * as farmer from 'farmer'; farmer.nothing();",
      /'nothing' is not provided by the game/,
    );
  });

  it('uses an enum as a value', () => {
    expect(py("import { Unlocks } from 'farmer'; const u = Unlocks;")).toBe('u = Unlocks');
  });

  it('rejects using a module as a value', () => {
    fails(
      "import * as lib from './lib'; const x = lib;",
      /can only be used to access its members/,
      {
        lib: 'export const a = 1;',
      },
    );
    fails(
      "import * as farmer from 'farmer'; const x = farmer;",
      /can only be used to access its members/,
    );
  });

  it('rejects calling things that are not functions', () => {
    fails("import { Entities } from 'farmer'; Entities();", /This cannot be called/);
    fails("import * as lib from './lib'; lib();", /can only be used to access its members/, {
      lib: 'export const a = 1;',
    });
  });

  it('allows a variable without a value at the top level', () => {
    expect(py('let x; export let y;')).toBe('x = None\ny = None');
  });
});

describe('functions', () => {
  it('rejects a destructured rest parameter', () => {
    fails('function f(...[a, b]: number[]) {}', /Destructured parameters are not supported/);
  });

  it('allows an empty return', () => {
    expect(py('function f() { return; }')).toBe('def f():\n\treturn');
  });

  it('skips types and empty statements inside functions', () => {
    const out = py(`
      function f() {
        interface Shape { size: number }
        type Id = number;
        declare const x: number;
        declare function g(): void;
        ;
        return 1;
      }
    `);
    expect(out).toBe('def f():\n\treturn 1');
  });

  it('rejects labels on break and continue', () => {
    fails('while (true) { break a; }', /Labels are not supported/);
    fails('while (true) { continue a; }', /Labels are not supported/);
  });
});

describe('patterns', () => {
  it('skips the holes of a pattern', () => {
    const out = py(`
      declare const xs: number[];
      const [, b, , d] = xs;
    `);
    expect(out).toBe('b = xs[1]\nd = xs[3]');
  });

  it('evaluates the value of a hole', () => {
    const out = py(`
      import { getPosX } from 'farmer';
      const [, b] = [getPosX(), 2];
    `);
    expect(out).toBe('get_pos_x()\nb = 2');
  });

  it('indexes the result of a call', () => {
    const out = py(`
      import { getCompanion } from 'farmer';
      const [a, b] = getCompanion();
    `);
    expect(out).toBe('_tmp_1 = get_companion()\na = _tmp_1[0]\nb = _tmp_1[1]');
  });

  it('copies a value that the pattern assigns to', () => {
    const out = py(`
      let p: number[] = [1, 2];
      let q = 0;
      [p, q] = p;
    `);
    expect(out).toContain('_tmp_1 = p\np = _tmp_1[0]\nq = _tmp_1[1]');
  });

  it('rejects defaults and rest elements in patterns', () => {
    fails('declare const xs: number[]; const [a = 1] = xs;', /Rest and default values in patterns/);
    fails(
      'declare const xs: number[]; const [...rest] = xs;',
      /Rest and default values in patterns/,
    );
  });

  it('rejects object destructuring, including a rest property', () => {
    fails(
      'declare const o: { a: number }; const { a, ...rest } = o;',
      /Object destructuring is not supported/,
    );
  });

  it('rejects assigning to things that are not variables or members', () => {
    fails(
      'declare const o: { a: number }; let a = 0; ({ a } = o);',
      /Cannot assign to a ObjectPattern/,
    );
    fails('declare const xs: number[]; xs.length = 0;', /Cannot assign to 'length'/);
    fails('declare const s: Set<number>; s.size = 0;', /Cannot assign to 'size'/);
  });
});

describe('loops', () => {
  it('falls back to a while loop when the counter is not compared directly', () => {
    const a = py(`${PRINT} declare const n: number; for (let i = 0; n > i; i++) { print(i); }`);
    expect(a).toContain('while n > i:');
    const b = py(`${PRINT} declare const j: number; for (let i = 0; j < 10; i++) { print(i); }`);
    expect(b).toContain('while j < 10:');
  });

  it('falls back to a while loop when the direction does not match the step', () => {
    expect(py(`${PRINT} for (let i = 0; i > 0; i++) { print(i); }`)).toContain('while i > 0:');
    expect(py(`${PRINT} for (let i = 10; i < 20; i--) { print(i); }`)).toContain('while i < 20:');
  });

  it('writes <= and >= limits that are not literals', () => {
    const out = py(`${PRINT}
      declare const m: number;
      for (let i = 10; i >= m; i--) { print(i); }
    `);
    expect(out).toContain('for i in range(10, m - 1, -1):');
  });

  it('does not treat changes to another variable as changing the counter', () => {
    const out = py(`${PRINT}
      declare const o: { n: number };
      let j = 0;
      for (let i = 0; i < 3; i++) { j++; o.n++; o.n = 1; print(i); }
    `);
    expect(out).toContain('for i in range(3):');
  });

  it('starts a loop with an assignment to an existing variable', () => {
    const out = py(`${PRINT}
      declare const n: number;
      let i = 0;
      for (i = 0; n; i++) { print(i); }
    `);
    expect(out).toContain('i = 0\nwhile n:\n\tprint(i)\n\ti += 1');
  });

  it('loops with an existing variable', () => {
    const out = py(`${PRINT}
      declare const xs: number[];
      declare const o: { a: number };
      let x = 0;
      let k = '';
      for (x of xs) { print(x); }
      for (k of Object.keys(o)) { print(k); }
      for (x of Object.values(o)) { print(x); }
    `);
    expect(out).toContain('for x in xs:');
    expect(out).toContain('for k in o:');
    expect(out).toContain('for _key_1 in o:\n\tx = o[_key_1]');
  });

  it('loops with an existing pair of variables over entries', () => {
    const out = py(`${PRINT}
      declare const o: { a: number };
      let k = '';
      let v = 0;
      for ([k, v] of Object.entries(o)) { print(k, v); }
    `);
    expect(out).toContain('for k in o:\n\tv = o[k]');
  });

  it('rejects loop variables that are not names or patterns of names', () => {
    fails(
      'declare const xs: { a: number }[]; for (const { a } of xs) {}',
      /Unsupported loop variable/,
    );
    fails(
      'declare const xs: number[]; declare const o: { a: number }; for (o.a of xs) {}',
      /Unsupported loop variable/,
    );
  });

  it('only loops over the entries of an object with a [key, value] pattern', () => {
    fails(
      'declare const o: { a: number }; for (const entry of Object.entries(o)) {}',
      /pattern of the form \[key, value\]/,
    );
    fails(
      'declare const o: { a: number }; for (const [a, b, c] of Object.entries(o)) {}',
      /pattern of the form \[key, value\]/,
    );
    fails(
      'declare const o: { a: number }; for (const [a, [b]] of Object.entries(o)) {}',
      /pattern of the form \[key, value\]/,
    );
  });

  it('loops over a member of a variable', () => {
    const out = py(`${PRINT}
      declare const o: { inner: { a: number }; list: { a: number }[] };
      declare const i: number;
      for (const v of Object.values(o.inner)) { print(v); }
      for (const w of Object.values(o.list[i])) { print(w); }
      for (const x of Object.values(o.list[0])) { print(x); }
    `);
    expect(out).toContain('for _key_1 in o["inner"]:\n\tv = o["inner"][_key_1]');
    expect(out).toContain('for _key_2 in o["list"][i]:');
    expect(out).toContain('for _key_3 in o["list"][0]:');
  });

  it('needs the object of a loop to be a variable', () => {
    fails(
      'declare function make(): object; for (const v of Object.values(make())) {}',
      /Store the object in a variable/,
    );
  });

  it('only treats Object.keys, values and entries of one argument as loops over an object', () => {
    // Anything else is evaluated like any other expression, which fails here.
    fails(
      'declare function f(n: number): number[]; for (const x of f(1)) {}',
      /not supported|not defined/,
    );
    fails(
      'declare const o: object; for (const x of Object["keys"](o)) {}',
      /Only named functions can be called|not supported/,
    );
    fails(
      'declare const o: object; for (const x of Object.freeze(o)) {}',
      /Object\.freeze can only be used/,
    );
    fails(
      'declare const o: object; for (const x of Object.keys()) {}',
      /Object\.keys can only be used/,
    );
    fails('declare const o: object; for (const x of Foo.keys(o)) {}', /'Foo' is not defined/);
  });
});

describe('loop bodies with functions', () => {
  it('does not look inside functions for changes to the counter', () => {
    const out = py(`
      import { spawnDrone } from 'farmer';
      for (let i = 0; i < 3; i++) {
        spawnDrone(() => { i = 5; });
        spawnDrone(function () { i = 6; });
      }
    `);
    expect(out).toContain('for i in range(3):');
    expect(out).toContain('spawn_drone(_arrow_1)');
    expect(out).toContain('spawn_drone(_arrow_2)');
  });

  it('looks through template literals in a loop body', () => {
    const out = py(`${PRINT}
      for (let i = 0; i < 3; i++) { print(\`n=\${i}\`); }
    `);
    expect(out).toContain('for i in range(3):\n\tprint("n=" + str(i))');
  });

  it('rejects a function declared in a loop', () => {
    fails('for (let i = 0; i < 3; i++) { function g() {} }', /Nested functions are not supported/);
  });
});

describe('statements', () => {
  it('rejects variables that are declared without code', () => {
    // `declare` is skipped at the top level and inside functions.
    expect(py('declare const x: number;')).toBe('');
    expect(py('function f() { declare const x: number; }')).toBe('def f():\n\tpass');
  });

  it('counts down with --', () => {
    expect(py('let x = 1; x--;')).toBe('x = 1\nx -= 1');
  });

  it('rejects expressions that do nothing', () => {
    fails('1;', /This expression has no effect/);
    fails('declare const x: number; !x;', /This expression has no effect/);
    fails('declare const x: number; -x;', /This expression has no effect/);
    fails('declare const x: number; x + 1;', /BinaryExpression cannot be used as a statement/);
    fails('declare const x: number; x;', /Identifier cannot be used as a statement/);
  });

  it('only deletes properties', () => {
    fails('declare const x: number; delete x;', /Only properties can be deleted/);
  });

  it('runs an optional chain used as a statement for what it needs', () => {
    const out = py('declare const a: { b: number } | null; a?.b;');
    expect(out).toBe('_tmp_1 = None\nif a != None:\n\t_tmp_1 = a["b"]');
  });
});

describe('expressions', () => {
  it('chains several optional accesses', () => {
    const out = py(`
      declare const a: { b: { c: number } | null } | null;
      const x = a?.b?.c;
    `);
    expect(out).toBe(
      '_tmp_1 = None\nif a != None and a["b"] != None:\n\t_tmp_1 = a["b"]["c"]\nx = _tmp_1',
    );
  });

  it('reads optional computed members', () => {
    const out = py('declare const a: number[] | null; declare const i: number; const x = a?.[i];');
    expect(out).toContain('if a != None:\n\t_tmp_1 = a[i]');
  });

  it('needs the object of an optional access to be a variable or a member', () => {
    fails(
      "import { getCompanion } from 'farmer'; const y = getCompanion()?.[0];",
      /`\?\.` needs to read it twice/,
    );
    fails(
      'declare const a: { b: number } | null; const y = (a?.b)?.toFixed;',
      /`\?\.` needs to read it twice/,
    );
  });

  it('writes number and string keys of objects', () => {
    expect(py("const o = { 1: 'a', 'b-c': 2, d: 3 };")).toBe('o = {1: "a", "b-c": 2, "d": 3}');
  });

  it('skips the right side of || when the left side is true', () => {
    const out = py(`
      declare const a: boolean;
      declare const b: boolean;
      const r = a || (b ? true : false);
    `);
    expect(out).toContain('_tmp_2 = a\nif not _tmp_2:');
  });

  it('rejects constructing more than a set', () => {
    fails('const x = new Set(1, 2);', /Set takes at most one argument/);
    fails(
      'declare const ns: { Thing: new () => object }; const x = new ns.Thing();',
      /Only Set can be constructed/,
    );
    fails('const x = new Map();', /Map is not supported/);
  });

  it('uses Math.random', () => {
    expect(py('const r = Math.random();')).toBe('r = random()');
  });

  it('checks the number of arguments of methods', () => {
    fails('declare const xs: number[]; xs.pop(1, 2);', /pop\(\) expects 0 to 1 argument\(s\)/);
    fails('declare const xs: number[]; xs.push();', /push\(\) expects 1 argument\(s\)/);
  });

  it('only supports the two forms of splice', () => {
    fails(
      'declare const xs: number[]; declare const n: number; xs.splice(0, n);',
      /Only splice\(index, 0, value\)/,
    );
    fails('declare const xs: number[]; xs.splice(0, 2);', /Only splice\(index, 0, value\)/);
    fails('declare const xs: number[]; xs.splice(0);', /Only splice\(index, 0, value\)/);
  });

  it('rejects Object functions outside of loops', () => {
    fails(
      'declare const o: object; const x = Object.entries(o);',
      /can only be used as the subject of a for\.\.\.of loop/,
    );
  });
});

describe('failures of the transpiler itself', () => {
  it('reports a thrown error that is not an Error', () => {
    const throwing = {
      get functions(): never {
        throw 'a string';
      },
      enums: new Set<string>(),
    } as never;
    const { errors } = transpileProject(
      [{ name: 'main', path: 'main.ts', source: "import { move } from 'farmer'; move();" }],
      throwing,
    );
    expect(errors[0].message).toMatch(/main\.ts:1:1: Internal transpiler error: a string/);
  });

  it('keeps the real declarations available to the other tests', () => {
    expect(IMPORT).toContain('farmer');
    expect(farmer.functions.size).toBeGreaterThan(0);
  });
});
