import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProcessOutput, ProcessRequest, ProcessRunner } from '../src/infra/processRunner.js';
import { ProcessExecutionError } from '../src/infra/processRunner.js';
import { traceSymbol } from '../src/tools/traceSymbol.js';

describe('traceSymbol', () => {
  it('passes the symbol as one literal rg argument with fixed globs', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'arkts-trace-args-'));
    let captured: ProcessRequest | undefined;
    const runner: ProcessRunner = {
      async run(request): Promise<ProcessOutput> {
        captured = request;
        return { stdout: '', stderr: '', exitCode: 1 };
      },
    };

    try {
      const symbol = 'Target; touch /tmp/not-executed';
      await traceSymbol({ workspaceRoot: root, symbol }, runner);

      expect(captured?.executable).toBe('rg');
      expect(captured?.args.at(-2)).toBe(symbol);
      expect(captured?.args).toContain('--fixed-strings');
      expect(captured?.args).toEqual(
        expect.arrayContaining([
          '!node_modules/**',
          '!oh_modules/**',
          '!build/**',
          '!.hvigor/**',
          '!.git/**',
        ]),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('finds declarations and references while excluding generated dependencies', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'arkts-trace-real-'));
    try {
      await mkdir(path.join(root, 'src'), { recursive: true });
      await mkdir(path.join(root, 'oh_modules', 'ignored'), { recursive: true });
      await writeFile(
        path.join(root, 'src', 'Example.ets'),
        'export class TimelineStore {}\nconst store = new TimelineStore();\n',
      );
      await writeFile(
        path.join(root, 'oh_modules', 'ignored', 'Generated.ets'),
        'class TimelineStore {}\n',
      );

      const report = await traceSymbol({ workspaceRoot: root, symbol: 'TimelineStore' });

      expect(report.status).toBe('ok');
      expect(report.matches).toHaveLength(2);
      expect(report.matches.map((match) => match.kind)).toEqual(['declaration', 'reference']);
      expect(report.matches.every((match) => match.path === 'src/Example.ets')).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns a structured unavailable result when rg is missing', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'arkts-trace-missing-'));
    const runner: ProcessRunner = {
      async run() {
        throw new ProcessExecutionError('EXECUTABLE_NOT_FOUND', 'missing');
      },
    };

    try {
      const report = await traceSymbol({ workspaceRoot: root, symbol: 'Target' }, runner);
      expect(report).toMatchObject({
        status: 'unavailable',
        error: { code: 'RG_NOT_FOUND' },
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
