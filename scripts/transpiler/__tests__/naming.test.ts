import { pyFunctionName, pyIdent, toSnakeCase } from '../naming.ts';

describe('toSnakeCase', () => {
  it.each([
    ['getPosX', 'get_pos_x'],
    ['doAFlip', 'do_a_flip'],
    ['quickPrint', 'quick_print'],
    ['numItems', 'num_items'],
    ['x2Y', 'x2_y'],
    ['parseHTML', 'parse_html'],
    ['HTMLParser', 'html_parser'],
    ['a', 'a'],
    ['print', 'print'],
    ['already_snake', 'already_snake'],
    ['Dead_Pumpkin', 'dead_pumpkin'],
    ['_private', '_private'],
  ])('converts %s to %s', (name, expected) => {
    expect(toSnakeCase(name)).toBe(expected);
  });
});

describe('pyIdent', () => {
  it.each(['pass', 'def', 'lambda', 'global', 'is', 'not', 'None', 'True', 'False', 'elif'])(
    'adds an underscore to the python keyword %s',
    keyword => {
      expect(pyIdent(keyword)).toBe(`${keyword}_`);
    },
  );

  it('leaves other names alone', () => {
    expect(pyIdent('worldEdge')).toBe('worldEdge');
    expect(pyIdent('print')).toBe('print');
    // `none` is not a keyword, only `None` is.
    expect(pyIdent('none')).toBe('none');
  });

  it('replaces the dollar signs python cannot have in names', () => {
    expect(pyIdent('$value')).toBe('_value');
    expect(pyIdent('a$b$')).toBe('a_b_');
  });
});

describe('pyFunctionName', () => {
  it('converts to snake case and avoids keywords', () => {
    expect(pyFunctionName('getWorldEdge')).toBe('get_world_edge');
    expect(pyFunctionName('pass')).toBe('pass_');
    expect(pyFunctionName('isValid')).toBe('is_valid');
    expect(pyFunctionName('is')).toBe('is_');
  });
});
