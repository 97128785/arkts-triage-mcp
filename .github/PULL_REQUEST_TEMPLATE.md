## Summary

Describe the focused behavior or documentation change.

## Evidence

List the anonymous fixture, diagnostic reference, or reproducible workspace metadata that supports the change.

## Security Impact

Confirm whether the change affects workspace boundaries, redaction, process execution, stdout, or returned evidence.

## Verification

- [ ] `npm run check`
- [ ] `npm run smoke`
- [ ] `npm pack --dry-run`
- [ ] `git diff --check`

## Limitations

List behavior that remains inferred, unsupported, or unverified. Do not claim that a fixture or protocol call proves a real HarmonyOS build passed.
