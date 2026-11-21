import type { ValidationResult } from "@/core"

/**
 * Flattens the validity-gate diagnostics into human-readable lines for the
 * validity summary. Kept framework-free so it can be unit-tested without
 * rendering, and so the summary wording lives in one place.
 *
 * @param validation - The current validity-gate result from the core.
 * @returns One message per diagnostic, across the schema, duplicate, regex,
 *   numeric-bound, the four auto-fill diagnostic kinds, and unresolved
 *   partition segments, in that order.
 */
export function summarizeDiagnostics(validation: ValidationResult): string[] {
  return [
    ...validation.schemaIssues.map((issue) => {
      const path = issue.path.join(".")
      return path === "" ? issue.message : `${path}: ${issue.message}`
    }),
    ...validation.duplicates.map((duplicate) =>
      duplicate.path.length > 0
        ? `Duplicate field "${duplicate.name}" at ${duplicate.path.join(".")}`
        : `Duplicate field "${duplicate.name}"`
    ),
    ...validation.badRegex.map(
      (bad) => `Invalid regex "${bad.pattern}": ${bad.message}`
    ),
    ...validation.badNumber.map(
      (bad) => `${bad.kind === "min" ? "Min" : "Max"} must be a finite number`
    ),
    ...validation.reservedNames.map(
      (collision) =>
        `Name "${collision.name}" collides with an auto-fill reserved column`
    ),
    ...validation.autoFillPlacement.map((bad) =>
      bad.reason === "non-datetime"
        ? `Auto-fill field "${bad.name}" must be a DateTime field`
        : `Auto-fill field "${bad.name}" must be top-level, not nested`
    ),
    ...validation.autoFillMutation.map(
      (bad) =>
        `Auto-fill field "${bad.name}" requires an append/full-load-append mutation`
    ),
    ...validation.companionPartition.map(
      (bad) =>
        `Partition segment "${bad.segment}" references derived column "${bad.companionName}"; use "${bad.primaryName}:year"`
    ),
    ...validation.unresolvedPartition.map((bad) =>
      bad.reason === "missing"
        ? `Partition field "${bad.name}" does not exist`
        : `Partition field "${bad.name}" matches more than one field`
    ),
  ]
}
