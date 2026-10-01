import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildProject, pruneSaves } from '../project.ts';

import { root } from './helpers.ts';

interface Project {
  srcDir: string;
  outDir: string;
  farmerDir: string;
  write: (name: string, source: string) => void;
}

const withProject = (run: (project: Project) => void) => {
  const dir = mkdtempSync(join(tmpdir(), 'farm-project-'));
  const srcDir = join(dir, 'src');
  const outDir = join(dir, 'out');
  mkdirSync(srcDir);
  try {
    run({
      srcDir,
      outDir,
      farmerDir: join(root, 'types/farmer'),
      write: (name, source) => {
        mkdirSync(join(srcDir, name, '..'), { recursive: true });
        writeFileSync(join(srcDir, name), source);
      },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const outputs = (outDir: string) => readdirSync(outDir).toSorted();

describe('buildProject', () => {
  it('writes one python file for each typescript file', () => {
    withProject(project => {
      project.write('a.ts', 'export const a = 1;\n');
      project.write('b.ts', 'export const b = 2;\n');
      const result = buildProject(project);
      expect(result.errors).toEqual([]);
      expect(result.written.map(path => path.split('/').pop())).toEqual(['a.py', 'b.py']);
      expect(outputs(project.outDir)).toEqual(['a.py', 'b.py']);
      expect(readFileSync(join(project.outDir, 'a.py'), 'utf8')).toContain('a = 1');
    });
  });

  it('only reads typescript files directly in the directory', () => {
    withProject(project => {
      project.write('main.ts', 'export const a = 1;\n');
      project.write('main.test.ts', 'export const test = 1;\n');
      project.write('types.d.ts', 'export declare const t: number;\n');
      project.write('notes.md', 'not code\n');
      project.write('nested/inner.ts', 'export const inner = 1;\n');
      expect(buildProject(project).errors).toEqual([]);
      expect(outputs(project.outDir)).toEqual(['main.py']);
    });
  });

  it('does not rewrite files that did not change', () => {
    withProject(project => {
      project.write('a.ts', 'export const a = 1;\n');
      project.write('b.ts', 'export const b = 2;\n');
      expect(buildProject(project).written).toHaveLength(2);
      expect(buildProject(project).written).toEqual([]);

      project.write('b.ts', 'export const b = 3;\n');
      const result = buildProject(project);
      expect(result.written.map(path => path.split('/').pop())).toEqual(['b.py']);
    });
  });

  it('removes the python of a deleted file', () => {
    withProject(project => {
      project.write('a.ts', 'export const a = 1;\n');
      project.write('b.ts', 'export const b = 2;\n');
      buildProject(project);

      rmSync(join(project.srcDir, 'b.ts'));
      const result = buildProject(project);
      expect(result.removed.map(path => path.split('/').pop())).toEqual(['b.py']);
      expect(outputs(project.outDir)).toEqual(['a.py']);
    });
  });

  it('leaves python files it did not generate alone', () => {
    withProject(project => {
      project.write('a.ts', 'export const a = 1;\n');
      mkdirSync(project.outDir);
      writeFileSync(join(project.outDir, 'handwritten.py'), 'print("mine")\n');
      writeFileSync(join(project.outDir, 'readme.txt'), 'notes\n');

      const result = buildProject(project);
      expect(result.removed).toEqual([]);
      expect(outputs(project.outDir)).toEqual(['a.py', 'handwritten.py', 'readme.txt']);
    });
  });

  it('creates the output directory', () => {
    withProject(project => {
      project.write('a.ts', 'export const a = 1;\n');
      expect(() => readdirSync(project.outDir)).toThrow();
      buildProject(project);
      expect(outputs(project.outDir)).toEqual(['a.py']);
    });
  });

  it('reports files skipped because of an import and keeps their previous python', () => {
    withProject(project => {
      project.write('lib.ts', 'export function f() { return 1; }\n');
      project.write('main.ts', "import { f } from './lib';\nf();\n");
      expect(buildProject(project)).toMatchObject({ errors: [], skipped: [], stale: [] });

      project.write('lib.ts', 'export function f( {\n');
      const result = buildProject(project);
      expect(result.errors.map(error => error.file)).toEqual([join(project.srcDir, 'lib.ts')]);
      expect(result.skipped).toMatchObject([{ name: 'main', because: 'lib' }]);
      expect(result.stale.map(path => path.split('/').pop())).toEqual(['lib.py', 'main.py']);
    });
  });

  it('has nothing stale when a file fails for the first time', () => {
    withProject(project => {
      project.write('bad.ts', 'class A {}\n');
      const result = buildProject(project);
      expect(result.errors).toHaveLength(1);
      expect(result.stale).toEqual([]);
    });
  });
});

describe('pruneSaves', () => {
  it('leaves files that were not generated, and the directory they are in', () => {
    withProject(project => {
      const savesDir = join(project.srcDir, '..', 'saves');
      const outDir = join(project.srcDir, '..', 'builds');
      mkdirSync(join(savesDir, 'kept'), { recursive: true });
      mkdirSync(join(outDir, 'gone'), { recursive: true });
      writeFileSync(
        join(outDir, 'gone/generated.py'),
        '# Generated from TypeScript. Do not edit; edit the source and rebuild.\nx = 1\n',
      );
      writeFileSync(join(outDir, 'gone/handwritten.py'), 'print("mine")\n');
      writeFileSync(join(outDir, 'gone/notes.txt'), 'notes\n');
      writeFileSync(join(outDir, 'loose-file.txt'), 'not a directory\n');

      const removed = pruneSaves({ savesDir, outDir, farmerDir: project.farmerDir });
      expect(removed).toEqual([join(outDir, 'gone/generated.py')]);
      expect(readdirSync(join(outDir, 'gone')).toSorted()).toEqual(['handwritten.py', 'notes.txt']);
      expect(readdirSync(outDir).toSorted()).toEqual(['gone', 'loose-file.txt']);
    });
  });

  it('has nothing to do before anything was built', () => {
    withProject(project => {
      expect(
        pruneSaves({
          savesDir: project.srcDir,
          outDir: join(project.outDir, 'x'),
          farmerDir: project.farmerDir,
        }),
      ).toEqual([]);
    });
  });
});
