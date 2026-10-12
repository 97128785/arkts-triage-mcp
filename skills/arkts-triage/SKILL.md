---
name: arkts-triage
description: Diagnose the first substantive HarmonyOS, ArkTS, or ArkUI failure from logs and workspace evidence. Use for Hvigor build failures, ArkTS diagnostics, or native load cascades. Do not auto-fix code.
---

# ArkTS Triage

Use the MCP tools to build an evidence chain. Do not run Hvigor, install packages, control a device, or modify project files.

## Workflow

1. Start at the user-visible entry or the earliest logged operation.
2. Call `analyze_build_log` with the supplied log. Include `workspaceRoot` only when the user explicitly provided or approved it.
3. Treat `firstFailure` as a candidate. Preserve its file, line, diagnostic ID, and bounded evidence.
4. If a workspace is available, call `map_project_modules` and identify the owning module from declared metadata.
5. Call `trace_symbol` only for a symbol present in the evidence or the reported source boundary.
6. Call `explain_diagnostic` with the exact diagnostic ID first. Fall back to the original error text only when no ID exists.
7. Trace the invariant in this order:
   - Entry: user action, route, task, import, or loader operation.
   - Parameters/state: values, types, state ownership, module declarations, permissions, or ABI inputs.
   - Bridge: ArkTS/KMP, ArkTS/native, package export, callback, or lifecycle boundary.
   - Output: compiler result, callback value, rendered state, package artifact, or loader result.
8. Keep at least one competing explanation until the evidence excludes it.

## Evidence Labels

Label every important statement:

- `confirmed`: directly supported by the same log, source location, or parsed metadata.
- `inferred`: consistent with evidence but not directly observed.
- `unknown`: requires another log, artifact, source version, runtime result, or official reference.

Never rename `confidence` to `rootCause`. A successful tool call does not prove that a real HarmonyOS build passed.

## Repair Direction

Propose the smallest repair direction at the earliest broken boundary. Do not invent ArkTS or ArkUI APIs. For an unclassified diagnostic, retain the original text and request the missing evidence instead of guessing.

For native or Kotlin candidates, stop at the cross-language evidence unless matching source and artifacts are available. Check HAP contents, ABI, BuildID, dependency versions, and exported symbols before assigning ownership.

## Response Shape

Return:

1. Candidate ownership and confidence.
2. Confirmed evidence with file or log locations.
3. Earliest broken invariant along entry -> parameters/state -> bridge -> output.
4. Competing explanation and why it remains or was excluded.
5. Minimal repair direction.
6. Verification performed and remaining unknowns.
