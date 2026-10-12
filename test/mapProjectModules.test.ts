import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { mapProjectModules } from '../src/tools/mapProjectModules.js';

async function writeWorkspaceFile(
  root: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const target = path.join(root, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, 'utf8');
}

describe('mapProjectModules', () => {
  it('maps declared modules, local dependencies, and lockfile summary', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'arkts-module-map-'));
    try {
      await Promise.all([
        writeWorkspaceFile(
          root,
          'build-profile.json5',
          `{ modules: [
            { name: 'entry', srcPath: './entry' },
            { name: 'shared', srcPath: './shared' },
          ] }`,
        ),
        writeWorkspaceFile(root, 'oh-package.json5', `{ name: 'sample-workspace' }`),
        writeWorkspaceFile(
          root,
          'oh-package-lock.json5',
          `{ packages: { '@sample/entry': {}, '@sample/shared': {} } }`,
        ),
        writeWorkspaceFile(
          root,
          'entry/oh-package.json5',
          `{ name: '@sample/entry', dependencies: { '@sample/shared': 'file:../shared' } }`,
        ),
        writeWorkspaceFile(
          root,
          'entry/src/main/module.json5',
          `{ module: { name: 'entry', type: 'entry' } }`,
        ),
        writeWorkspaceFile(root, 'shared/oh-package.json5', `{ name: '@sample/shared' }`),
        writeWorkspaceFile(
          root,
          'shared/src/main/module.json5',
          `{ module: { name: 'shared', type: 'har' } }`,
        ),
        writeWorkspaceFile(
          root,
          'build/ignored/src/main/module.json5',
          `{ module: { name: 'ignored', type: 'har' } }`,
        ),
      ]);

      const report = await mapProjectModules({ workspaceRoot: root });

      expect(report.modules).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'entry', path: 'entry', relation: 'declared' }),
          expect.objectContaining({ name: 'shared', path: 'shared', relation: 'declared' }),
        ]),
      );
      expect(report.modules.some((module) => module.name === 'ignored')).toBe(false);
      expect(report.dependencies).toContainEqual({
        from: 'entry',
        to: 'shared',
        specifier: 'file:../shared',
        kind: 'workspace',
      });
      expect(report.lockfileSummary).toEqual({
        file: 'oh-package-lock.json5',
        packageCount: 2,
      });
      expect(report.warnings).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports invalid JSON5 without aborting other metadata', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'arkts-module-warning-'));
    try {
      await Promise.all([
        writeWorkspaceFile(root, 'feature/oh-package.json5', `{ name: '@sample/feature' }`),
        writeWorkspaceFile(root, 'feature/src/main/module.json5', `{ module: { name:`),
      ]);

      const report = await mapProjectModules({ workspaceRoot: root });

      expect(report.modules).toContainEqual(
        expect.objectContaining({ name: '@sample/feature', path: 'feature' }),
      );
      expect(report.warnings).toContainEqual(
        expect.objectContaining({ file: 'feature/src/main/module.json5' }),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
