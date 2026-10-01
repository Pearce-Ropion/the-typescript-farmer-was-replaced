import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { farmerFunctionName, loadFarmerInfo } from '../farmer.ts';

import { farmer } from './helpers.ts';

describe('loadFarmerInfo', () => {
  const withDeclarations = (files: Record<string, string>, run: (dir: string) => void) => {
    const dir = mkdtempSync(join(tmpdir(), 'farm-declarations-'));
    try {
      mkdirSync(dir, { recursive: true });
      for (const [name, source] of Object.entries(files)) {
        writeFileSync(join(dir, name), source);
      }
      run(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it('finds the exported functions and enums', () => {
    withDeclarations(
      {
        'a.d.ts': `
          export declare function doThing(): void;
          export declare enum Mode { A, B }
          export interface Shape { size: number }
          export type Alias = number;
          export declare const value: number;
        `,
        'b.d.ts':
          'export declare function other(x: number): number;\nexport declare enum Kind { X }',
      },
      dir => {
        const info = loadFarmerInfo(dir);
        expect([...info.functions].toSorted()).toEqual(['doThing', 'other']);
        expect([...info.enums].toSorted()).toEqual(['Kind', 'Mode']);
      },
    );
  });

  it('ignores names that are not exported', () => {
    withDeclarations(
      {
        'a.d.ts':
          'declare function hidden(): void;\ndeclare enum Hidden { A }\nexport declare function shown(): void;',
      },
      dir => {
        const info = loadFarmerInfo(dir);
        expect([...info.functions]).toEqual(['shown']);
        expect([...info.enums]).toEqual([]);
      },
    );
  });

  it('ignores index.d.ts and files that are not declarations', () => {
    withDeclarations(
      {
        'index.d.ts': 'export declare function fromIndex(): void;',
        'notes.txt': 'export declare function fromNotes(): void;',
        'code.ts': 'export function fromCode() {}',
        'real.d.ts': 'export declare function real(): void;',
      },
      dir => {
        expect([...loadFarmerInfo(dir).functions]).toEqual(['real']);
      },
    );
  });

  it('reads the real declarations of the game', () => {
    expect(farmer.functions).toContain('harvest');
    expect(farmer.functions).toContain('measureEntity');
    expect(farmer.enums).toContain('Entities');
    expect(farmer.enums).toContain('Direction');
    expect(farmer.enums).toContain('Unlocks');
    expect(farmer.functions).not.toContain('Entities');
  });
});

describe('farmerFunctionName', () => {
  it('converts to snake case', () => {
    expect(farmerFunctionName('getPosX')).toBe('get_pos_x');
    expect(farmerFunctionName('quickPrint')).toBe('quick_print');
  });

  it('translates the typed variants of measure to measure', () => {
    expect(farmerFunctionName('measureEntity')).toBe('measure');
    expect(farmerFunctionName('measurePos')).toBe('measure');
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
    const actual = new Set([...farmer.functions].map(farmerFunctionName));
    expect([...actual].toSorted()).toEqual(expected.toSorted());
  });
});
