import path from 'node:path';
import type {
  AnalyzeBuildLogInput,
  DiagnosticKind,
  FirstFailure,
  TriageReport,
} from '../domain/report.js';
import { TRIAGE_SCHEMA_VERSION } from '../domain/report.js';
import { isWithinWorkspace, resolveWorkspaceRoot } from '../infra/fileBoundary.js';
import { sanitizeLogText } from '../infra/redact.js';
import { mapProjectModules } from './mapProjectModules.js';

const MAX_LOG_BYTES = 1024 * 1024;
const DEFAULT_EVIDENCE_LINES = 12;
const MAX_EVIDENCE_LINES = 30;
const MAX_CASCADE_ERRORS = 12;
const TRUNCATION_MARKER = '\n[... LOG TRUNCATED BY arkts-triage-mcp ...]\n';

interface FailureCandidate {
  logLine: number;
  text: string;
  kind: DiagnosticKind;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  diagnosticId?: string;
}

export interface TruncatedLog {
  text: string;
  truncated: boolean;
}

export function truncateLogText(logText: string, maxBytes = MAX_LOG_BYTES): TruncatedLog {
  const bytes = Buffer.from(logText, 'utf8');
  if (bytes.byteLength <= maxBytes) {
    return { text: logText, truncated: false };
  }

  const markerBytes = Buffer.byteLength(TRUNCATION_MARKER);
  const retainedBytes = Math.max(0, maxBytes - markerBytes);
  const headBytes = Math.ceil(retainedBytes / 2);
  const tailBytes = retainedBytes - headBytes;
  return {
    text:
      bytes.subarray(0, headBytes).toString('utf8') +
      TRUNCATION_MARKER +
      bytes.subarray(bytes.byteLength - tailBytes).toString('utf8'),
    truncated: true,
  };
}

export function classifyDiagnostic(text: string): DiagnosticKind {
  if (
    /\b(dlopen failed|undefined symbol|symbol lookup error|unsatisfiedlinkerror|shared object\b|musl)\b/i.test(
      text,
    ) ||
    /\bNATIVE_[A-Z0-9_]+\b/.test(text)
  ) {
    return 'native';
  }
  if (
    /\b(permission|requestpermissions|user_grant|system_grant)\b/i.test(text) ||
    /\bARKTS_PERMISSION_[A-Z0-9_]+\b/.test(text)
  ) {
    return 'permission';
  }
  if (
    /@(State|Prop|Link|ObjectLink|Observed|Track)\b|state management|observable|ARKUI_/i.test(text)
  ) {
    return 'arkui';
  }
  if (
    /\b(cannot find module|module not found|undeclared dependency|oh-package\.json5|dependency)\b/i.test(
      text,
    ) ||
    /\bARKTS_(MODULE|UNDECLARED_DEPENDENCY)/.test(text)
  ) {
    return 'module';
  }
  if (
    /\b(ArkTS|Type .+ is not assignable|Property .+ does not exist|Cannot find name|arkts-)\b/i.test(
      text,
    )
  ) {
    return 'arkts';
  }
  return 'unknown';
}

function isSummaryLine(text: string): boolean {
  return [
    /^\s*(?:\[.*?\]\s*)?BUILD FAILED\b/i,
    /\bTask .+ failed\b/i,
    /\bHvigor build failed\b/i,
    /\bCompilation failed with \d+ errors?\b/i,
    /\bProcess finished with exit code\b/i,
    /\bdaemon (?:stopped|disappeared|exited)\b/i,
  ].some((pattern) => pattern.test(text));
}

function extractLocation(
  text: string,
): { file: string; line: number; column?: number } | undefined {
  const match =
    /File:\s*((?:[A-Za-z]:)?[^"'()[\]]+?\.(?:ets|ts|json5|cpp|cc|c|h|hpp|kt|java)):(\d+)(?::(\d+))?/i.exec(
      text,
    ) ??
    /((?:[A-Za-z]:)?(?:\/|\.{0,2}\/)?[^\s"'()[\]]+?\.(?:ets|ts|json5|cpp|cc|c|h|hpp|kt|java)):(\d+)(?::(\d+))?/i.exec(
      text,
    );
  if (!match?.[1] || !match[2]) {
    return undefined;
  }

  const column = match[3] ? Number.parseInt(match[3], 10) : undefined;
  return {
    file: match[1],
    line: Number.parseInt(match[2], 10),
    ...(column === undefined ? {} : { column }),
  };
}

function extractDiagnosticId(text: string): string | undefined {
  const bracketMatch = /\[((?:ARKTS|ARKUI|NATIVE|OHOS)[A-Z0-9_-]{3,})\]/i.exec(text);
  if (bracketMatch?.[1]) {
    return bracketMatch[1];
  }
  const compilerMatch = /\b((?:TS|ETS)\d{3,5})\b/.exec(text);
  return compilerMatch?.[1];
}

function normalizeReportedPath(file: string, workspaceRoot?: string): string {
  if (!workspaceRoot || !path.isAbsolute(file)) {
    return file.replaceAll('\\', '/');
  }
  const resolved = path.resolve(file);
  if (!isWithinWorkspace(workspaceRoot, resolved)) {
    return file.replaceAll('\\', '/');
  }
  return path.relative(workspaceRoot, resolved).split(path.sep).join('/');
}

function extractCandidates(lines: string[], workspaceRoot?: string): FailureCandidate[] {
  const candidates: FailureCandidate[] = [];
  lines.forEach((text, index) => {
    if (isSummaryLine(text)) {
      return;
    }

    const location = extractLocation(text);
    const diagnosticId = extractDiagnosticId(text);
    const kind = classifyDiagnostic(text);
    const hasErrorSignal =
      /\b(error|exception|failed|failure|cannot|denied|undefined symbol|not found|not assignable|does not exist|not declared|not observable)\b/i.test(
        text,
      );
    if ((!hasErrorSignal && !diagnosticId) || (!location && !diagnosticId && kind === 'unknown')) {
      return;
    }

    const message = text.trim().slice(0, 600);
    candidates.push({
      logLine: index + 1,
      text,
      kind,
      message,
      ...(location
        ? {
            file: normalizeReportedPath(location.file, workspaceRoot),
            line: location.line,
            ...(location.column === undefined ? {} : { column: location.column }),
          }
        : {}),
      ...(diagnosticId ? { diagnosticId } : {}),
    });
  });
  return candidates;
}

function collectEvidence(
  lines: string[],
  candidateLine: number,
  maxEvidenceLines: number,
): Array<{ logLine: number; text: string }> {
  const before = Math.floor((maxEvidenceLines - 1) / 2);
  const startIndex = Math.max(0, candidateLine - 1 - before);
  const endIndex = Math.min(lines.length, startIndex + maxEvidenceLines);
  return lines
    .slice(startIndex, endIndex)
    .map((text, offset) => ({ logLine: startIndex + offset + 1, text }));
}

function nextChecksFor(kind: DiagnosticKind): string[] {
  const common = [
    'Confirm this is the earliest concrete failure in the same build invocation.',
    'Inspect the producer and consumer contract at the reported boundary before editing code.',
  ];
  const specific: Record<DiagnosticKind, string> = {
    arkts:
      'Check the exact ArkTS declaration, import, and compiler diagnostic at the source location.',
    arkui: 'Trace state ownership and mutation from component input to rendered output.',
    module:
      'Compare module imports with build-profile.json5, oh-package.json5, and the effective lockfile.',
    permission:
      'Verify declaration, runtime authorization result, and call order against official permission documentation.',
    native:
      'Verify the packaged HAP ABI, shared objects, BuildIDs, dependencies, and exported symbols.',
    unknown: 'Collect the first ERROR with its file, line, code, and surrounding context.',
  };
  return [...common, specific[kind]];
}

function summaryFor(candidate: FailureCandidate): string {
  const location = candidate.file
    ? ` at ${candidate.file}${candidate.line ? `:${candidate.line}` : ''}${
        candidate.column ? `:${candidate.column}` : ''
      }`
    : '';
  return `First substantive ${candidate.kind} failure candidate${location}.`;
}

export async function analyzeBuildLog(input: AnalyzeBuildLogInput): Promise<TriageReport> {
  const evidenceLimit = Math.min(
    MAX_EVIDENCE_LINES,
    Math.max(1, input.maxEvidenceLines ?? DEFAULT_EVIDENCE_LINES),
  );
  const sanitized = sanitizeLogText(input.logText);
  const truncated = truncateLogText(sanitized);
  const lines = truncated.text.split('\n');

  let resolvedWorkspaceRoot: string | undefined;
  let modules: TriageReport['modules'] = [];
  const limitations: string[] = [
    'The first failure is selected by deterministic log rules and remains a candidate, not a compiler-proven root cause.',
  ];

  if (input.workspaceRoot) {
    resolvedWorkspaceRoot = await resolveWorkspaceRoot(input.workspaceRoot);
    const moduleMap = await mapProjectModules({ workspaceRoot: resolvedWorkspaceRoot });
    modules = moduleMap.modules.map(({ name, path: modulePath, relation }) => ({
      name,
      path: modulePath,
      relation,
    }));
    if (moduleMap.warnings.length > 0) {
      limitations.push(
        `${moduleMap.warnings.length} project metadata file(s) could not be fully interpreted.`,
      );
    }
  } else {
    limitations.push(
      'No workspaceRoot was supplied; module mapping and source correlation were skipped.',
    );
  }

  if (truncated.truncated) {
    limitations.push(
      'The log exceeded 1 MiB; only its beginning and end were retained after redaction.',
    );
  }

  const candidates = extractCandidates(lines, resolvedWorkspaceRoot);
  const first = candidates[0];
  if (!first) {
    return {
      schemaVersion: TRIAGE_SCHEMA_VERSION,
      status: 'insufficientEvidence',
      summary:
        'Insufficient evidence: no concrete error location, diagnostic ID, or classified failure was found.',
      confidence: 'low',
      cascadeErrors: [],
      modules,
      nextChecks: [
        'Provide the first ERROR and up to 20 lines before and after it.',
        'Include the source file location or diagnostic code when available.',
      ],
      limitations,
    };
  }

  const firstFailure: FirstFailure = {
    kind: first.kind,
    message: first.message,
    evidence: collectEvidence(lines, first.logLine, evidenceLimit),
    ...(first.file ? { file: first.file } : {}),
    ...(first.line === undefined ? {} : { line: first.line }),
    ...(first.column === undefined ? {} : { column: first.column }),
    ...(first.diagnosticId ? { diagnosticId: first.diagnosticId } : {}),
  };
  const confidence =
    first.file && first.line && first.diagnosticId
      ? 'high'
      : first.file || first.diagnosticId || first.kind !== 'unknown'
        ? 'medium'
        : 'low';

  return {
    schemaVersion: TRIAGE_SCHEMA_VERSION,
    status: 'diagnosed',
    summary: summaryFor(first),
    confidence,
    firstFailure,
    cascadeErrors: candidates.slice(1, MAX_CASCADE_ERRORS + 1).map(({ logLine, text }) => ({
      logLine,
      text: text.slice(0, 600),
    })),
    modules,
    nextChecks: nextChecksFor(first.kind),
    limitations,
  };
}
