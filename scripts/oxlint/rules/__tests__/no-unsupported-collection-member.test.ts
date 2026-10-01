import { tester, ts } from '../../utils/testing.ts';
import rule from '../no-unsupported-collection-member.ts';

tester.run('no-unsupported-collection-member', rule, {
  valid: [
    ts('const xs: number[] = []; xs.push(1); xs.pop(); const n = xs.length; xs[0] = n;'),
    ts('const xs = [1, 2]; xs.shift(); xs.unshift(0); xs.splice(0, 0, 3); xs.includes(1);'),
    ts('const xs = [1]; xs.splice(0, 1); xs.splice(1, 0, 2);'),
    // toString() becomes str(), which works for every value.
    ts(
      'const xs = [1]; const o = { a: 1 }; const s = new Set<number>(); xs.toString(); o.toString(); s.toString();',
    ),
    ts('const s = new Set<number>(); s.add(1); s.delete(1); s.has(1); const n = s.size;'),
    ts('const o = { a: 1 }; o.a = 2; const v = o.a; const w = o["a"];'),
    ts('interface Item { power: number } const item: Item = { power: 1 }; item.power = 2;'),
    ts('for (const key of Object.keys({ a: 1 })) { key; }'),
    // Receivers of an unknown type can't be checked.
    ts('declare const unknown: any; unknown.whatever();'),
    ts('import { things } from "./things"; things.map(x => x);'),
    // Other objects named like a collection method are not collections.
    ts('const map = { get: () => 1 }; const Map = 1; Map;'),
    {
      code: 'const xs = [1]; xs.map(x => x);',
      filename: 'farm.ts',
      options: [{ array: ['map'] }],
    },
  ],
  invalid: [
    {
      ...ts('const xs = [1, 2]; xs.map(x => x);'),
      errors: [
        {
          messageId: 'member',
          data: {
            name: 'map',
            kind: 'arrays',
            allowed: 'length, push, pop, shift, unshift, splice, includes',
          },
        },
      ],
    },
    {
      ...ts('const xs: number[] = []; xs.forEach(x => x);'),
      errors: [{ messageId: 'member' }],
    },
    {
      // Reading an unsupported member is reported too, not just calling it.
      ...ts('const xs = [1]; const f = xs.map;'),
      errors: [{ messageId: 'member' }],
    },
    {
      ...ts('function f(xs: Array<number>) { return xs.slice(1); }'),
      errors: [{ messageId: 'member' }],
    },
    {
      ...ts('function f(xs = [1]) { xs.reverse(); }'),
      errors: [{ messageId: 'member' }],
    },
    {
      ...ts('function list(): number[] { return []; } list().concat([1]);'),
      errors: [{ messageId: 'member' }],
    },
    {
      // Every other form of splice: too many arguments, too few, or a count the game can't express.
      ...ts(`const xs = [1, 2, 3];
        xs.splice(0, 0, 2, 3);
        xs.splice(0, 1, 2);
        xs.splice(0);
        xs.splice(0, 2);
        xs.splice(0, 0);
        xs.splice(0, 1, ...xs);
        xs.splice(...xs);`),
      errors: Array.from({ length: 7 }, () => ({ messageId: 'splice' })),
    },
    {
      ...ts('const s = new Set<number>(); s.clear(); s.forEach(() => 1);'),
      errors: [{ messageId: 'member' }, { messageId: 'member' }],
    },
    {
      ...ts('function f(s: ReadonlySet<string>) { return s.keys(); }'),
      errors: [{ messageId: 'member' }],
    },
    {
      ...ts('const o = { a: 1 }; o.hasOwnProperty("a");'),
      errors: [{ messageId: 'call', data: { name: 'hasOwnProperty' } }],
    },
    {
      ...ts('interface Item { power: number } function f(item: Item) { item.valueOf(); }'),
      errors: [{ messageId: 'call' }],
    },
    {
      ...ts('type Bag = Record<string, number>; const bag: Bag = {}; bag.hasOwnProperty("a");'),
      errors: [{ messageId: 'call' }],
    },
    {
      // Only the argument-less form is translated (to str(value)).
      ...ts('const xs = [1]; xs.toString(2); const f = xs.toString;'),
      errors: [{ messageId: 'member' }, { messageId: 'member' }],
    },
    {
      ...ts('const xs = [1]; const copy = Array.from(xs); Object.assign({}, {});'),
      errors: [{ messageId: 'static' }, { messageId: 'static' }],
    },
    {
      ...ts('const m = new Map(); const w = new WeakSet();'),
      errors: [{ messageId: 'collection' }, { messageId: 'collection' }],
    },
    {
      ...ts('const xs = [1]; xs.push(1); xs.map(x => x);'),
      options: [{ array: ['push'] }],
      errors: [{ messageId: 'member' }],
    },
  ],
});

// How the rule works out what kind of collection a value is.
tester.run('no-unsupported-collection-member (types of values)', rule, {
  valid: [
    // Anything it cannot work out is left alone.
    ts('function f(x: string | number) { x.foo(); }'),
    ts('function f(x: ns.Collection) { x.foo(); }'),
    ts('const thing = new Foo(); thing.bar();'),
    ts('const thing = new ns.Thing(); thing.bar();'),
    // Values taken apart by destructuring are not tracked.
    ts('declare const xs: number[][]; const [first] = xs; first.foo();'),
    ts('declare const o: { a: number[] }; const { a } = o; a.foo();'),
    ts('foo.bar().map(g);'),
    ts('Object["keys"]({}).map(g);'),
    ts('(1 + 2).foo();'),
    ts('unknownVariable.foo();'),
    ts('unknownFunction().foo();'),
    ts('const value = 1; value().foo();'),
    ts('let later; later().foo();'),
    // The result of the same unknown value is remembered.
    ts('const u = unknownThing(); u.a(); u.b();'),
    // A value defined in terms of itself has no kind.
    ts('const a = b; const b = a; a.foo();'),
  ],
  invalid: [
    {
      ...ts('function f(o: { a: number }) { o.foo(); }'),
      errors: [{ messageId: 'call' }],
    },
    {
      ...ts('function f(xs: readonly number[]) { xs.map(g); }'),
      errors: [{ messageId: 'member' }],
    },
    {
      ...ts('function f(xs: number[] | null) { xs?.map(g); }'),
      errors: [{ messageId: 'member' }],
    },
    {
      ...ts(`
        function f(a: Partial<number[]>, b: Readonly<Set<number>>, c: Required<Record<string, number>>) {
          a.map(g);
          b.clear();
          c.hasOwnProperty('x');
        }
      `),
      errors: [{ messageId: 'member' }, { messageId: 'member' }, { messageId: 'call' }],
    },
    { ...ts('const a = new Array(3); a.map(g);'), errors: [{ messageId: 'member' }] },
    { ...ts('const keys = Object.keys({}); keys.map(g);'), errors: [{ messageId: 'member' }] },
    {
      ...ts('const make = (): number[] => []; make().map(g);'),
      errors: [{ messageId: 'member' }],
    },
    {
      ...ts('const make = function (): Set<number> { return new Set(); }; make().clear();'),
      errors: [{ messageId: 'member' }],
    },
    { ...ts('function f(...args: number[]) { args.map(g); }'), errors: [{ messageId: 'member' }] },
    { ...ts('function f(...args) { args.map(g); }'), errors: [{ messageId: 'member' }] },
    {
      // Naming nothing as allowed leaves nothing to suggest.
      ...ts('const xs = [1]; xs.push(1);'),
      options: [{ array: [] }],
      errors: [
        {
          messageId: 'member',
          data: { name: 'push', kind: 'arrays', allowed: 'nothing' },
        },
      ],
    },
  ],
});
