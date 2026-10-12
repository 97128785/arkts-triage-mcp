import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = path.resolve(import.meta.dirname, '..');
const fixturePath = path.join(root, 'test/fixtures/01-type-assignment/input.log');
const serverPath = path.join(root, 'dist/index.js');
const logText = await readFile(fixturePath, 'utf8');

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
  stderr: 'pipe',
});
const client = new Client({ name: 'arkts-triage-smoke-client', version: '0.1.0' });

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const result = await client.callTool({
    name: 'analyze_build_log',
    arguments: { logText },
  });
  const textContent = result.content.find((item) => item.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('analyze_build_log returned no text content.');
  }
  const report = JSON.parse(textContent.text);
  if (
    report.status !== 'diagnosed' ||
    report.firstFailure?.diagnosticId !== 'ARKTS_TYPE_ASSIGNMENT'
  ) {
    throw new Error('Smoke fixture did not produce the expected first failure.');
  }
  process.stdout.write(
    `${JSON.stringify({
      tools: tools.tools.map((tool) => tool.name),
      status: report.status,
      firstFailure: report.firstFailure,
    })}\n`,
  );
} finally {
  await client.close();
}
