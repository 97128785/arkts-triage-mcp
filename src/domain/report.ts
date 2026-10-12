export const TRIAGE_SCHEMA_VERSION = 'arkts-triage/v1' as const;

export type DiagnosticKind = 'arkts' | 'arkui' | 'module' | 'permission' | 'native' | 'unknown';

export type Confidence = 'high' | 'medium' | 'low';

export interface EvidenceLine {
  logLine: number;
  text: string;
}

export interface FirstFailure {
  kind: DiagnosticKind;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  diagnosticId?: string;
  evidence: EvidenceLine[];
}

export interface CascadeError {
  logLine: number;
  text: string;
}

export interface ReportModule {
  name: string;
  path: string;
  relation: 'declared' | 'inferred';
}

export interface TriageReport {
  schemaVersion: typeof TRIAGE_SCHEMA_VERSION;
  status: 'diagnosed' | 'insufficientEvidence';
  summary: string;
  confidence: Confidence;
  firstFailure?: FirstFailure;
  cascadeErrors: CascadeError[];
  modules: ReportModule[];
  nextChecks: string[];
  limitations: string[];
}

export interface AnalyzeBuildLogInput {
  logText: string;
  workspaceRoot?: string | undefined;
  maxEvidenceLines?: number | undefined;
}
