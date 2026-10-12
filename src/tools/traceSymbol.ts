import path from 'node:path';
import type { TraceSymbolReport } from '../domain/workspace.js';
import { resolveWorkspaceRoot } from '../infra/fileBoundary.js';
import {
  nodeProcessRunner,
  ProcessExecutionError,
  type ProcessRunner,
} from '../infra/processRunner.js';
import { redactText } from '../infra/redact.js';

const DEFAULT_MAX_RESULTS = 20;
const MAX_RESULTS = 30;
const MAX_CONTEXT_LENGTH = 240;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchKind(context: string, symbol: string): 'declaration' | 'reference' {
  const escaped = escapeRegExp(symbol);
  const declarationPattern = new RegExp(
    `\\b(?:class|interface|struct|enum|type|function|namespace|const|let|var)\\s+${escaped}\\b|@Component\\s+(?:export\\s+)?struct\\s+${escaped}\\b`,
  );
  return declarationPattern.test(context) ? 'declaration' : 'reference';
}

function parseRipgrepLine(
  line: string,
  workspaceRoot: string,
  symbol: string,
): TraceSymbolReport['matches'][number] | undefined {
  const match = /^(.*):(\d+):(\d+):(.*)$/.exec(line);
  if (!match?.[1] || !match[2] || !match[3]) {
    return undefined;
  }

  const absolutePath = path.resolve(workspaceRoot, match[1]);
  const relativePath = path.relative(workspaceRoot, absolutePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return undefined;
  }

  const context = redactText(match[4] ?? '')
    .trim()
    .slice(0, MAX_CONTEXT_LENGTH);
  return {
    path: relativePath.split(path.sep).join('/'),
    line: Number.parseInt(match[2], 10),
    column: Number.parseInt(match[3], 10),
    kind: matchKind(context, symbol),
    context,
  };
}

export function buildTraceSymbolArgs(symbol: string): string[] {
  return [
    '--line-number',
    '--column',
    '--no-heading',
    '--color=never',
    '--with-filename',
    '--fixed-strings',
    '--glob',
    '*.ets',
    '--glob',
    '*.ts',
    '--glob',
    '*.json5',
    '--glob',
    '!node_modules/**',
    '--glob',
    '!oh_modules/**',
    '--glob',
    '!build/**',
    '--glob',
    '!.hvigor/**',
    '--glob',
    '!.git/**',
    '--',
    symbol,
    '.',
  ];
}

export async function traceSymbol(
  input: { workspaceRoot: string; symbol: string; maxResults?: number | undefined },
  runner: ProcessRunner = nodeProcessRunner,
): Promise<TraceSymbolReport> {
  const workspaceRoot = await resolveWorkspaceRoot(input.workspaceRoot);
  const symbol = input.symbol.trim();
  if (!symbol || symbol.length > 200 || /[\r\n]/.test(symbol) || symbol.includes('\0')) {
    throw new Error('symbol must contain 1-200 characters and no control line breaks.');
  }
  const maxResults = Math.min(MAX_RESULTS, Math.max(1, input.maxResults ?? DEFAULT_MAX_RESULTS));
  const args = buildTraceSymbolArgs(symbol);

  try {
    const output = await runner.run({
      executable: 'rg',
      args,
      cwd: workspaceRoot,
      timeoutMs: 10_000,
    });
    const parsed = output.stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => parseRipgrepLine(line, workspaceRoot, symbol))
      .filter((match): match is NonNullable<typeof match> => match !== undefined);
    return {
      schemaVersion: 'arkts-symbol-trace/v1',
      status: 'ok',
      symbol,
      matches: parsed.slice(0, maxResults),
      truncated: parsed.length > maxResults,
    };
  } catch (error) {
    if (error instanceof ProcessExecutionError) {
      return {
        schemaVersion: 'arkts-symbol-trace/v1',
        status: 'unavailable',
        symbol,
        matches: [],
        truncated: false,
        error: {
          code: error.code === 'EXECUTABLE_NOT_FOUND' ? 'RG_NOT_FOUND' : 'RG_FAILED',
          message:
            error.code === 'EXECUTABLE_NOT_FOUND'
              ? 'ripgrep (rg) is required for symbol tracing and was not found.'
              : 'ripgrep failed without returning source matches.',
        },
      };
    }
    throw error;
  }
}
