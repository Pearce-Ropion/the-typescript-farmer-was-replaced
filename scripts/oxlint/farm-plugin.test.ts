import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';

import plugin from './farm-plugin.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester();
const rule = plugin.rules['no-unsupported-collection-member'];

const ts = (code: string) => ({ code, filename: 'farm.ts' });

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

tester.run('no-classes', plugin.rules['no-classes'], {
  valid: [ts('function f() { return { a: 1 }; }'), ts('const o = { a: 1 }; o.a = 2;')],
  invalid: [
    { ...ts('class A {}'), errors: [{ messageId: 'class' }] },
    { ...ts('const B = class {};'), errors: [{ messageId: 'class' }] },
    { ...ts('export class C extends Object { m() {} }'), errors: [{ messageId: 'class' }] },
  ],
});

tester.run('no-lambdas', plugin.rules['no-lambdas'], {
  valid: [
    ts('function f(a: number) { return a; }'),
    ts('export function g() { return 1; }'),
    ts('function h() { for (const x of [1]) { x; } }'),
    // Methods of a class are left to no-classes.
    ts('class A { m() { return 1; } }'),
  ],
  invalid: [
    { ...ts('const f = () => 1;'), errors: [{ messageId: 'lambda' }] },
    { ...ts('const f = function () {};'), errors: [{ messageId: 'lambda' }] },
    {
      ...ts('[1].includes(1); run(() => 1); function run(f: () => number) { f(); }'),
      errors: [{ messageId: 'lambda' }],
    },
    { ...ts('const o = { m() {} };'), errors: [{ messageId: 'lambda' }] },
    {
      ...ts('const f = async () => { await 1; };'),
      errors: [{ messageId: 'lambda' }],
    },
  ],
});

tester.run('no-number-conversion', plugin.rules['no-number-conversion'], {
  valid: [
    ts('const a = 1 + 2; const b = -a; const s = String(a); const t = a.toString();'),
    ts('function parseFloat(x: string) { return x; } parseFloat("1");'),
    ts('const Number = (x: string) => x; Number("1");'),
    ts('const n = Math.floor(1.5) + Math.abs(-1);'),
  ],
  invalid: [
    {
      ...ts('const a = Number("1");'),
      errors: [{ messageId: 'conversion', data: { name: 'Number' } }],
    },
    {
      ...ts('const a = parseFloat("1.5");'),
      errors: [{ messageId: 'conversion', data: { name: 'parseFloat' } }],
    },
    {
      ...ts('const a = parseInt("1", 10);'),
      errors: [{ messageId: 'conversion', data: { name: 'parseInt' } }],
    },
    {
      ...ts('const a = Number.parseFloat("1"); const b = Number.parseInt("1");'),
      errors: [
        { messageId: 'conversion', data: { name: 'Number.parseFloat' } },
        { messageId: 'conversion', data: { name: 'Number.parseInt' } },
      ],
    },
    {
      ...ts('const a = new Number("1");'),
      errors: [{ messageId: 'conversion', data: { name: 'Number' } }],
    },
    { ...ts('const a = +"1";'), errors: [{ messageId: 'conversion', data: { name: '+value' } }] },
  ],
});
