import * as py from '../py.ts';

const x = py.name('x');

describe('builders', () => {
  it('builds names, constants and accesses', () => {
    expect(py.name('a')).toMatchObject({ nodeType: 'Name', id: 'a', ctx: { nodeType: 'Load' } });
    expect(py.name('a', true).ctx.nodeType).toBe('Store');
    expect(py.constant(1)).toMatchObject({ nodeType: 'Constant', value: 1 });
    expect(py.none()).toMatchObject({ nodeType: 'Constant', value: null });
    expect(py.attribute(x, 'y')).toMatchObject({ nodeType: 'Attribute', attr: 'y' });
    expect(py.subscript(x, py.constant(0), true).ctx.nodeType).toBe('Store');
    expect(py.call(x, [py.constant(1)])).toMatchObject({ nodeType: 'Call', keywords: [] });
  });

  it('flattens a chain of the same boolean operator', () => {
    const chain = py.boolOp('And', py.boolOp('And', x, py.name('y')), py.name('z'));
    expect(chain.values).toHaveLength(3);
  });

  it('keeps different boolean operators nested', () => {
    const mixed = py.boolOp('Or', py.boolOp('And', x, py.name('y')), py.name('z'));
    expect(mixed.values).toHaveLength(2);
    expect(mixed.values[0].nodeType).toBe('BoolOp');
  });

  it('does not change the operands of a boolean operation', () => {
    const left = py.boolOp('And', x, py.name('y'));
    py.boolOp('And', left, py.name('z'));
    expect(left.values).toHaveLength(2);
  });

  it('returns a copy of an expression that can be assigned to', () => {
    const load = py.name('a');
    const store = py.toStore(load);
    expect(store.ctx.nodeType).toBe('Store');
    expect(load.ctx.nodeType).toBe('Load');
    expect(store).not.toBe(load);
  });

  it('aligns the defaults of a function with its last parameters', () => {
    const fn = py.functionDef(
      'f',
      [{ name: 'a' }, { name: 'b', fallback: py.constant(1) }, { name: 'c', fallback: py.none() }],
      'rest',
      [py.pass()],
    );
    expect(fn.args.args.map((arg: { arg: string }) => arg.arg)).toEqual(['a', 'b', 'c']);
    expect(fn.args.defaults).toHaveLength(2);
    expect(fn.args.vararg.arg).toBe('rest');
  });

  it('has no vararg unless there is a rest parameter', () => {
    expect(py.functionDef('f', [], null, [py.pass()]).args.vararg).toBeUndefined();
  });
});

describe('assertSupported', () => {
  it('accepts what the game supports', () => {
    const module = py.moduleNode([
      py.importStatement('world'),
      py.functionDef('f', [{ name: 'a', fallback: py.constant('x') }], null, [
        py.globalStatement(['g']),
        py.assign(py.name('y', true), py.binary(x, 'FloorDiv', py.constant(2))),
        py.ifStatement(py.compare(x, 'NotIn', py.list([])), [py.returnStatement(py.none())]),
        py.forStatement(py.name('i', true), py.call(py.name('range'), [py.constant(3)]), [
          py.continueStatement(),
        ]),
      ]),
      py.whileStatement(py.constant(true), [py.breakStatement()]),
      py.expression(py.call(py.name('print'), [py.dict([py.constant('k')], [py.set([])])])),
    ]);
    expect(() => py.assertSupported(module)).not.toThrow();
  });

  it.each(['IfExp', 'Lambda', 'ListComp', 'JoinedStr', 'Delete', 'With', 'ClassDef', 'Try'])(
    'rejects %s anywhere in the tree',
    nodeType => {
      const unsupported = { nodeType, lineno: 1, col_offset: 0 };
      const module = py.moduleNode([
        py.functionDef('f', [], null, [py.assign(py.name('a', true), unsupported)]),
      ]);
      expect(() => py.assertSupported(module)).toThrow(new RegExp(nodeType));
    },
  );

  it.each([
    ['an object', {}],
    ['an array', [1]],
    ['undefined', undefined],
    ['a bigint', 1n],
  ])('rejects a constant that is %s', (_description, value) => {
    const module = py.moduleNode([
      py.assign(py.name('a', true), { nodeType: 'Constant', lineno: 1, col_offset: 0, value }),
    ]);
    expect(() => py.assertSupported(module)).toThrow(/constant/);
  });

  it.each([
    ['a string', 'x'],
    ['a number', 1.5],
    ['a boolean', false],
    ['null', null],
  ])('accepts a constant that is %s', (_description, value) => {
    const module = py.moduleNode([py.assign(py.name('a', true), py.constant(value))]);
    expect(() => py.assertSupported(module)).not.toThrow();
  });

  it('rejects operators the game does not have', () => {
    const bitwise = py.binary(x, 'Add', py.constant(1));
    bitwise.op = { nodeType: 'BitOr', lineno: 1, col_offset: 0 };
    expect(() => py.assertSupported(py.moduleNode([py.expression(bitwise)]))).toThrow(/BitOr/);
  });
});

describe('printModule', () => {
  const assignment = py.assign(py.name('x', true), py.constant(1));
  const print = (...body: ReturnType<typeof py.pass>[]) => py.printModule(py.moduleNode(body));

  it('starts with a header saying the file is generated', () => {
    expect(print(assignment)).toBe(`${py.GENERATED_HEADER}\n\nx = 1\n`);
  });

  it('prints an empty module as just the header', () => {
    expect(print()).toBe(`${py.GENERATED_HEADER}\n`);
  });

  it('keeps imports together and separates them from the code with a blank line', () => {
    expect(print(py.importStatement('a'), py.importStatement('b'), assignment)).toBe(
      `${py.GENERATED_HEADER}\n\nimport a\nimport b\n\nx = 1\n`,
    );
  });

  it('puts two blank lines around definitions', () => {
    const def = (name: string) => py.functionDef(name, [], null, [py.pass()]);
    expect(print(assignment, def('f'), def('g'), assignment)).toBe(
      `${py.GENERATED_HEADER}\n\nx = 1\n\n\ndef f():\n    pass\n\n\ndef g():\n    pass\n\n\nx = 1\n`,
    );
  });

  it('keeps plain statements next to each other', () => {
    expect(print(assignment, assignment)).toBe(`${py.GENERATED_HEADER}\n\nx = 1\nx = 1\n`);
  });

  it('refuses to print a module with unsupported nodes', () => {
    const lambda = { nodeType: 'Lambda', lineno: 1, col_offset: 0 };
    expect(() => print(py.assign(py.name('f', true), lambda))).toThrow(/Lambda/);
  });
});
