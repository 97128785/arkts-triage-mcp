# Security Policy

## Supported Versions

Security fixes are applied to the latest published minor version.

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |
| Earlier | No        |

## Reporting a Vulnerability

Do not open a public issue for an unpatched vulnerability or include private logs, source code, credentials, or workspace paths.

Use the repository's private vulnerability reporting flow:

1. Open the GitHub repository.
2. Go to **Security > Advisories**.
3. Select **Report a vulnerability**.
4. Include affected versions, reproduction steps, impact, and a minimal sanitized fixture.

If private vulnerability reporting is unavailable, open a public issue containing no exploit details and ask the maintainer for a private contact channel.

## Security Boundaries

The project is expected to preserve these invariants:

- local stdio operation with no telemetry or model API;
- `realpath` validation for every workspace read;
- no traversal of dependency, build, generated, or Git directories;
- literal `rg` queries executed with argument arrays and `shell: false`;
- bounded, redacted log evidence;
- stdout reserved for MCP protocol messages;
- no build, package installation, device, or source-modification behavior.

Reports that demonstrate a boundary escape, credential disclosure, command injection, protocol corruption, or unbounded data return are treated as security issues.
