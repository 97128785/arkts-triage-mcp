import { describe, expect, it } from 'vitest';
import { explainDiagnostic, getDiagnosticCatalogVersion } from '../src/tools/explainDiagnostic.js';

describe('explainDiagnostic', () => {
  it('matches a maintained diagnostic ID exactly', () => {
    const explanation = explainDiagnostic({ diagnosticId: 'ARKTS_MODULE_NOT_FOUND' });

    expect(explanation).toMatchObject({
      status: 'matched',
      matchedBy: 'diagnosticId',
      diagnosticId: 'ARKTS_MODULE_NOT_FOUND',
      category: 'module',
    });
    expect(explanation.repairDirections.length).toBeGreaterThan(0);
    expect(explanation.unknowns.length).toBeGreaterThan(0);
  });

  it('matches only maintained error patterns', () => {
    const explanation = explainDiagnostic({
      errorText: "Type 'string' is not assignable to type 'number'.",
    });

    expect(explanation).toMatchObject({
      status: 'matched',
      matchedBy: 'errorPattern',
      diagnosticId: 'ARKTS_TYPE_ASSIGNMENT',
    });
  });

  it('preserves uncertainty for unclassified text', () => {
    const explanation = explainDiagnostic({ errorText: 'Unknown vendor diagnostic ZX-9.' });

    expect(explanation.status).toBe('unclassified');
    expect(explanation.category).toBe('unknown');
    expect(explanation.references).toEqual([]);
  });

  it('publishes a versioned local catalog', () => {
    expect(getDiagnosticCatalogVersion()).toMatch(/^\d{4}\.\d{2}\.\d+$/);
  });
});
