#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { redactText } from './infra/redact.js';
import { createMcpServer } from './server.js';

async function main(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  const message = redactText(error instanceof Error ? error.message : 'Unknown startup failure.');
  process.stderr.write(`arkts-triage-mcp failed to start: ${message}\n`);
  process.exitCode = 1;
});
