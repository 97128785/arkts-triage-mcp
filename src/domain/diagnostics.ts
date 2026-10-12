import type { DiagnosticKind } from './report.js';

export interface DiagnosticRule {
  id: string;
  aliases: string[];
  category: DiagnosticKind;
  patterns: string[];
  applicability: string;
  summary: string;
  repairDirections: string[];
  unknowns: string[];
  references: string[];
}

export interface DiagnosticCatalog {
  schemaVersion: 'arkts-diagnostic-catalog/v1';
  catalogVersion: string;
  entries: DiagnosticRule[];
}

export interface DiagnosticExplanation {
  schemaVersion: 'arkts-diagnostic-explanation/v1';
  status: 'matched' | 'unclassified';
  catalogVersion: string;
  matchedBy?: 'diagnosticId' | 'errorPattern';
  diagnosticId?: string;
  category: DiagnosticKind;
  applicability: string;
  summary: string;
  repairDirections: string[];
  unknowns: string[];
  references: string[];
}
