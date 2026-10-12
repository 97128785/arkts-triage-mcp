import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  resolvePathWithinWorkspace,
  resolveWorkspaceRoot,
  WorkspaceBoundaryError,
} from '../src/infra/fileBoundary.js';
import { redactText } from '../src/infra/redact.js';
import { analyzeBuildLog } from '../src/tools/analyzeBuildLog.js';
import { mapProjectModules } from '../src/tools/mapProjectModules.js';

describe('workspace security boundary', () => {
  it('rejects lexical parent traversal', async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), 'arkts-boundary-parent-'));
    const root = path.join(parent, 'workspace');
    const outside = path.join(parent, 'outside.json5');
    try {
      await mkdir(root);
      await writeFile(outside, '{}');
      const resolvedRoot = await resolveWorkspaceRoot(root);

      await expect(
        resolvePathWithinWorkspace(resolvedRoot, '../outside.json5'),
      ).rejects.toMatchObject({
        code: 'PATH_OUTSIDE_WORKSPACE',
      });
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('rejects symlinks that resolve outside workspaceRoot', async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), 'arkts-boundary-link-'));
    const root = path.join(parent, 'workspace');
    const outside = path.join(parent, 'outside.json5');
    try {
      await mkdir(root);
      await writeFile(outside, '{}');
      await symlink(outside, path.join(root, 'linked.json5'));
      const resolvedRoot = await resolveWorkspaceRoot(root);

      await expect(resolvePathWithinWorkspace(resolvedRoot, 'linked.json5')).rejects.toBeInstanceOf(
        WorkspaceBoundaryError,
      );
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('does not follow metadata directory symlinks', async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), 'arkts-boundary-scan-'));
    const root = path.join(parent, 'workspace');
    const outside = path.join(parent, 'outside-module');
    try {
      await mkdir(root);
      await mkdir(outside);
      await writeFile(path.join(outside, 'oh-package.json5'), `{ name: '@secret/outside' }`);
      await symlink(outside, path.join(root, 'linked-module'));

      const report = await mapProjectModules({ workspaceRoot: root });
      expect(report.modules).toEqual([]);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('redacts common credentials without returning their values', () => {
    const redacted = redactText(
      'Authorization: Bearer abc.def token=secret password: hunter2 Cookie: sid=private',
    );

    expect(redacted).not.toMatch(/abc\.def|secret|hunter2|private/);
    expect(redacted.match(/\[REDACTED\]/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it('rejects an unreadable workspace passed to log analysis', async () => {
    await expect(
      analyzeBuildLog({
        logText: 'ERROR: failure',
        workspaceRoot: path.join(os.tmpdir(), 'arkts-workspace-that-does-not-exist'),
      }),
    ).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
  });
});
