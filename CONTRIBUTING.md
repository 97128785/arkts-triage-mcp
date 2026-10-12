# Contributing

Contributions should keep `arkts-triage-mcp` deterministic, local-first, and evidence-based.

## Development

Requirements:

- Node.js 20.19 or newer;
- npm;
- ripgrep (`rg`) for symbol tracing.

```sh
git clone https://github.com/97128785/arkts-triage-mcp.git
cd arkts-triage-mcp
npm ci
npm run check
npm run smoke
npm pack --dry-run
```

## Change Scope

- Keep changes focused and avoid unrelated refactors.
- Do not add model APIs, telemetry, build execution, device control, or automatic source edits.
- Preserve the `realpath` workspace boundary and shell-free process execution.
- Keep stdout reserved for MCP protocol messages.
- Do not read dependency, generated, Git history, or build directories.

## Diagnostic Rules

Every new or changed diagnostic rule must include:

1. an anonymous `input.log` fixture;
2. a stable `expected.json`;
3. a primary technical reference;
4. explicit applicability;
5. bounded repair directions;
6. unresolved questions that the tool must not guess.

Never include production logs, credentials, private source paths, user data, or proprietary code.

## Pull Requests

Before opening a pull request:

```sh
npm run check
npm run smoke
npm pack --dry-run
git diff --check
```

Describe the evidence or fixture that motivates the change, its security impact, and the commands actually run. A successful fixture or protocol call must not be described as a real HarmonyOS build passing.
