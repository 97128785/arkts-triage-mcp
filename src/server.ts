import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { redactText } from './infra/redact.js';
import { analyzeBuildLog } from './tools/analyzeBuildLog.js';
import { explainDiagnostic } from './tools/explainDiagnostic.js';
import { mapProjectModules } from './tools/mapProjectModules.js';
import { traceSymbol } from './tools/traceSymbol.js';

const analyzeBuildLogSchema = {
  logText: z.string().describe('Hvigor, ArkTS, ArkUI, or native loader log text.'),
  workspaceRoot: z
    .string()
    .min(1)
    .optional()
    .describe('Explicit workspace root for local mapping.'),
  maxEvidenceLines: z.number().int().min(1).max(30).optional(),
};

const mapProjectModulesSchema = {
  workspaceRoot: z.string().min(1).describe('Explicit HarmonyOS workspace root.'),
};

const traceSymbolSchema = {
  workspaceRoot: z.string().min(1).describe('Explicit HarmonyOS workspace root.'),
  symbol: z
    .string()
    .min(1)
    .max(200)
    .describe('Literal symbol text; regular expressions are disabled.'),
  maxResults: z.number().int().min(1).max(30).optional(),
};

const explainDiagnosticSchema = {
  diagnosticId: z.string().min(1).optional(),
  errorText: z.string().min(1).max(10_000).optional(),
};

function successResult(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value as Record<string, unknown>,
  };
}

function errorResult(error: unknown) {
  const message = redactText(error instanceof Error ? error.message : 'Unexpected tool failure.');
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

export function createMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: 'arkts-triage-mcp',
      version: '0.1.0',
    },
    {
      instructions:
        'Analyze only user-supplied logs and explicit workspace roots. Treat findings as evidence-backed candidates, not proven root causes.',
    },
  );

  server.registerTool(
    'analyze_build_log',
    {
      title: 'Analyze ArkTS Build Log',
      description:
        'Return the first substantive failure candidate, bounded evidence, cascades, module context, and next checks.',
      inputSchema: analyzeBuildLogSchema,
    },
    async (input) => {
      try {
        return successResult(await analyzeBuildLog(input));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'map_project_modules',
    {
      title: 'Map HarmonyOS Project Modules',
      description:
        'Read allowed JSON5 metadata under workspaceRoot and return modules, declared dependencies, and parse warnings.',
      inputSchema: mapProjectModulesSchema,
    },
    async (input) => {
      try {
        return successResult(await mapProjectModules(input));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'trace_symbol',
    {
      title: 'Trace ArkTS Symbol',
      description:
        'Use ripgrep with fixed arguments and fixed source globs to locate bounded declarations and references.',
      inputSchema: traceSymbolSchema,
    },
    async (input) => {
      try {
        return successResult(await traceSymbol(input));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'explain_diagnostic',
    {
      title: 'Explain Maintained Diagnostic',
      description:
        'Match a versioned local rule by diagnostic ID or maintained text pattern and return bounded repair directions.',
      inputSchema: explainDiagnosticSchema,
    },
    async (input) => {
      try {
        if (!input.diagnosticId && !input.errorText) {
          throw new Error('Provide diagnosticId or errorText.');
        }
        return successResult(explainDiagnostic(input));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  return server;
}
