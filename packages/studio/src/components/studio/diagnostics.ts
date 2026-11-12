import type { ValidationResult } from "@/core"

/**
 * Flattens the validity-gate diagnostics into human-readable lines for the
 * validity summary. Kept framework-free so it can be unit-tested without
 * rendering, and so the summary wording lives in one place.
 *
 * @param validation - The current validity-gate result from the core.
 * @returns One message per diagnostic, across the schema, duplicate, regex, and
 *   numeric-bound diagnostic kinds, in that order.
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
  ]
}
