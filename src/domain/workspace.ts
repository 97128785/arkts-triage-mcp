export const MODULE_MAP_SCHEMA_VERSION = 'arkts-module-map/v1' as const;

export interface ProjectModule {
  name: string;
  path: string;
  relation: 'declared' | 'inferred';
  moduleType?: string;
  sourceFiles: string[];
}

export interface ModuleDependency {
  from: string;
  to: string;
  specifier: string;
  kind: 'workspace' | 'package';
}

export interface MetadataWarning {
  file: string;
  message: string;
}

export interface ModuleMapReport {
  schemaVersion: typeof MODULE_MAP_SCHEMA_VERSION;
  modules: ProjectModule[];
  dependencies: ModuleDependency[];
  lockfileSummary?: {
    file: string;
    packageCount: number;
  };
  warnings: MetadataWarning[];
}

export interface SymbolMatch {
  path: string;
  line: number;
  column: number;
  kind: 'declaration' | 'reference';
  context: string;
}

export interface TraceSymbolReport {
  schemaVersion: 'arkts-symbol-trace/v1';
  status: 'ok' | 'unavailable';
  symbol: string;
  matches: SymbolMatch[];
  truncated: boolean;
  error?: {
    code: 'RG_NOT_FOUND' | 'RG_FAILED';
    message: string;
  };
}
