# Supported Diagnostics

Catalog schema: `arkts-diagnostic-catalog/v1`

Catalog version: `2026.10.1`

| Diagnostic ID                  | Category   | Maintained signal                                       |
| ------------------------------ | ---------- | ------------------------------------------------------- |
| `ARKTS_TYPE_ASSIGNMENT`        | ArkTS      | Incompatible assignment or structural typing diagnostic |
| `ARKTS_PROPERTY_NOT_FOUND`     | ArkTS      | Missing member or unresolved name                       |
| `ARKUI_STATE_MUTATION`         | ArkUI      | State ownership or mutation rejection                   |
| `ARKUI_OBSERVED_OBJECT`        | ArkUI      | Untracked nested object update                          |
| `ARKTS_MODULE_NOT_FOUND`       | Module     | Unresolved import                                       |
| `ARKTS_UNDECLARED_DEPENDENCY`  | Module     | Missing module-level dependency declaration             |
| `ARKTS_PERMISSION_DECLARATION` | Permission | Missing module profile permission                       |
| `ARKTS_PERMISSION_DENIED`      | Permission | Effective authorization failure                         |
| `NATIVE_DLOPEN_FAILED`         | Native     | Shared object load failure                              |
| `NATIVE_UNDEFINED_SYMBOL`      | Native     | Shared-library symbol contract mismatch                 |

## Rule Policy

- Rules are local JSON data and never call a model or remote classifier.
- Exact IDs take precedence over maintained regular-expression patterns.
- Pattern matches are explanations, not reconstructed compiler decisions.
- Each rule states applicability, repair directions, unknowns, and references.
- Unmatched diagnostics return `unclassified` with the original investigation boundary preserved.
- New rules require an anonymous fixture, stable assertions, and a primary technical reference.

The catalog intentionally does not prescribe replacement APIs. API availability depends on SDK version and must be checked against current official documentation and the project's effective dependencies.
