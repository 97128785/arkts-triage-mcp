import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeBuildLog, truncateLogText } from '../src/tools/analyzeBuildLog.js';

interface FixtureExpectation {
  status: 'diagnosed';
  confidence: 'high' | 'medium' | 'low';
  firstFailure: Record<string, unknown>;
  cascadeErrorCount: number;
  forbiddenStrings: string[];
}

const fixtureRoot = path.resolve(import.meta.dirname, 'fixtures');

describe('analyzeBuildLog fixtures', async () => {
  const fixtureNames = (await readdir(fixtureRoot)).sort();

  for (const fixtureName of fixtureNames) {
    it(`matches ${fixtureName}`, async () => {
      const directory = path.join(fixtureRoot, fixtureName);
      const [logText, expectedText] = await Promise.all([
        readFile(path.join(directory, 'input.log'), 'utf8'),
        readFile(path.join(directory, 'expected.json'), 'utf8'),
      ]);
      const expected = JSON.parse(expectedText) as FixtureExpectation;
      const report = await analyzeBuildLog({ logText });

      expect(report.status).toBe(expected.status);
      expect(report.confidence).toBe(expected.confidence);
      expect(report.firstFailure).toMatchObject(expected.firstFailure);
      expect(report.cascadeErrors).toHaveLength(expected.cascadeErrorCount);
      const serialized = JSON.stringify(report);
      for (const forbidden of expected.forbiddenStrings) {
        expect(serialized).not.toContain(forbidden);
      }
    });
  }
});

describe('analyzeBuildLog fallback behavior', () => {
  it('returns insufficient evidence for summary-only logs', async () => {
    const report = await analyzeBuildLog({
      logText: '[Hvigor] BUILD FAILED\nTask compileArkTS failed\n',
    });

    expect(report.status).toBe('insufficientEvidence');
    expect(report.firstFailure).toBeUndefined();
  });

  it('keeps a bounded head and tail for oversized logs', () => {
    const result = truncateLogText(`head\n${'x'.repeat(2048)}\ntail`, 256);

    expect(result.truncated).toBe(true);
    expect(result.text).toContain('head');
    expect(result.text).toContain('LOG TRUNCATED');
    expect(result.text).toContain('tail');
    expect(Buffer.byteLength(result.text)).toBeLessThanOrEqual(260);
  });

  it('strips ANSI sequences before returning evidence', async () => {
    const report = await analyzeBuildLog({
      logText:
        '\u001b[31mERROR: ArkTS File: entry/src/main/ets/A.ets:3:2 [ARKTS_TYPE_ASSIGNMENT] Type X is not assignable to type Y.\u001b[0m',
    });

    expect(JSON.stringify(report)).not.toContain('\u001b');
  });

  it('does not treat an informational source location as a failure', async () => {
    const report = await analyzeBuildLog({
      logText: [
        'INFO: compiled entry/src/main/ets/Normal.ets:1:1',
        "ERROR: File: entry/src/main/ets/Failure.ets:9:4 [ARKTS_TYPE_ASSIGNMENT] Type 'string' is not assignable to type 'number'.",
      ].join('\n'),
    });

    expect(report.firstFailure).toMatchObject({
      file: 'entry/src/main/ets/Failure.ets',
      line: 9,
      column: 4,
    });
  });
});
