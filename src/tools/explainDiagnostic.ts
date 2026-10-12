import catalogJson from '../catalog/diagnosticCatalog.json' with { type: 'json' };
import type {
  DiagnosticCatalog,
  DiagnosticExplanation,
  DiagnosticRule,
} from '../domain/diagnostics.js';

const catalog = catalogJson as DiagnosticCatalog;

function normalizeDiagnosticId(value: string): string {
  return value.trim().toLowerCase();
}

function findById(diagnosticId: string): DiagnosticRule | undefined {
  const normalized = normalizeDiagnosticId(diagnosticId);
  return catalog.entries.find(
    (rule) =>
      normalizeDiagnosticId(rule.id) === normalized ||
      rule.aliases.some((alias) => normalizeDiagnosticId(alias) === normalized),
  );
}

function findByErrorText(errorText: string): DiagnosticRule | undefined {
  return catalog.entries.find((rule) =>
    rule.patterns.some((pattern) => new RegExp(pattern, 'i').test(errorText)),
  );
}

function toExplanation(
  rule: DiagnosticRule,
  matchedBy: 'diagnosticId' | 'errorPattern',
): DiagnosticExplanation {
  return {
    schemaVersion: 'arkts-diagnostic-explanation/v1',
    status: 'matched',
    catalogVersion: catalog.catalogVersion,
    matchedBy,
    diagnosticId: rule.id,
    category: rule.category,
    applicability: rule.applicability,
    summary: rule.summary,
    repairDirections: [...rule.repairDirections],
    unknowns: [...rule.unknowns],
    references: [...rule.references],
  };
}

export function explainDiagnostic(input: {
  diagnosticId?: string | undefined;
  errorText?: string | undefined;
}): DiagnosticExplanation {
  if (input.diagnosticId) {
    const match = findById(input.diagnosticId);
    if (match) {
      return toExplanation(match, 'diagnosticId');
    }
  }

  if (input.errorText) {
    const match = findByErrorText(input.errorText);
    if (match) {
      return toExplanation(match, 'errorPattern');
    }
  }

  return {
    schemaVersion: 'arkts-diagnostic-explanation/v1',
    status: 'unclassified',
    catalogVersion: catalog.catalogVersion,
    category: 'unknown',
    applicability: 'No maintained catalog rule matched the supplied diagnostic.',
    summary: 'The original diagnostic must be preserved and investigated from its local evidence.',
    repairDirections: [
      'Use the first concrete file, line, code, or loader message as the investigation entry.',
      'Confirm the relevant compiler or platform documentation before proposing an API change.',
    ],
    unknowns: [
      'No compiler conclusion can be derived from an unmatched text fragment.',
      'A new rule requires a reproducible fixture and a primary reference.',
    ],
    references: [],
  };
}

export function getDiagnosticCatalogVersion(): string {
  return catalog.catalogVersion;
}
