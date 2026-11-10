import type { FieldValidation } from "@lakeql/schema-generator/endpoint-schema"
import { fieldValidationSchema } from "@lakeql/schema-generator/endpoint-schema"

import type { EditorFieldType } from "@/core"

/**
 * The validation refinement kinds the editor can add, as the discriminant
 * strings of {@link FieldValidation}.
 */
export type ValidationKind = FieldValidation["type"]

/**
 * All supported validation kinds, in the order the picker offers them (Req
 * 4.2).
 */
export const validationKinds: readonly ValidationKind[] = [
  "email",
  "url",
  "uuid",
  "min",
  "max",
  "regex",
]

/**
 * The human-readable label shown for each validation kind in the picker and the
 * validation rows.
 */
export const validationKindLabels: Record<ValidationKind, string> = {
  email: "Email",
  url: "URL",
  uuid: "UUID",
  min: "Min",
  max: "Max",
  regex: "Regex",
}

/**
 * The validation kinds that make runtime sense for a given field type, so the
 * panel offers only type-valid controls (task 13):
 *
 * - String-like types (`String`, `Date`, `DateTime`) accept the string
 *   refinements (`email`, `url`, `uuid`, `regex`) plus length bounds
 *   (`min`/`max`).
 * - Numeric types (`Integer`, `Float`) accept only the numeric bounds
 *   (`min`/`max`).
 * - `Boolean`, `Object`, and `Array` carry no refinements.
 *
 * This gates which kinds can be *added*; an already-present refinement that no
 * longer fits (for example after a type change) is still editable and surfaces
 * through the validity gate rather than vanishing, per the design.
 *
 * @param type - The field's current type.
 * @returns The validation kinds offered for that type, in picker order.
 */
export function validationKindsForType(
  type: EditorFieldType
): readonly ValidationKind[] {
  switch (type) {
    case "String":
    case "Date":
    case "DateTime": {
      return ["email", "url", "uuid", "min", "max", "regex"]
    }
    case "Integer":
    case "Float": {
      return ["min", "max"]
    }
    default: {
      return []
    }
  }
}

/**
 * Builds a default {@link FieldValidation} for a newly added kind, seeding the
 * value-carrying kinds with an incomplete-until-filled value the user then
 * edits: `min`/`max` seed `NaN` (rendered as an empty input and blocked by the
 * export gate until a finite number is entered) and `regex` seeds an empty
 * pattern. This avoids silently exporting an unintended default such as `0`.
 *
 * @param kind - The validation kind to create.
 * @returns A fresh {@link FieldValidation} of that kind.
 */
export function createValidation(kind: ValidationKind): FieldValidation {
  switch (kind) {
    case "min": {
      return { type: "min", value: Number.NaN }
    }
    case "max": {
      return { type: "max", value: Number.NaN }
    }
    case "regex": {
      return { type: "regex", pattern: "" }
    }
    default: {
      return { type: kind }
    }
  }
}

/**
 * The three partitioning modes the mutation form offers.
 *
 * - `timestamp`: partition by write timestamp (the value `true`).
 * - `off`: no partitioning (the value `false`).
 * - `field`: a field/custom partition string (any non-empty string).
 */
export type PartitioningMode = "timestamp" | "off" | "field"

/**
 * Derives the {@link PartitioningMode} from a partitioning value
 * (`boolean | string`).
 *
 * @param partitioning - The current partitioning value.
 * @returns The mode the UI should show selected.
 */
export function partitioningModeOf(
  partitioning: boolean | string
): PartitioningMode {
  if (partitioning === true) {
    return "timestamp"
  }
  if (partitioning === false) {
    return "off"
  }
  return "field"
}

/**
 * Whether a partitioning value is a "custom" string — one containing `/` or
 * `:`. In custom mode (and when partitioning is off) `partitioningFormat` is
 * not an active setting, matching `validatePartitioningFormat` ignoring it
 * there (Req 5.7).
 *
 * @param partitioning - The current partitioning value.
 * @returns `true` when the value is a custom format string.
 */
export function isCustomPartitioning(partitioning: boolean | string): boolean {
  return (
    typeof partitioning === "string" &&
    (partitioning.includes("/") || partitioning.includes(":"))
  )
}

/**
 * Whether the `partitioningFormat` granularity control should be offered for a
 * given partitioning value: only in the non-custom, enabled modes
 * (`timestamp`, or a legacy single-field string), never when off or custom.
 *
 * An empty string — the transient seed when the user first enters "field" mode
 * — is treated as incomplete, not a legacy single-field string, so the
 * granularity control stays hidden until a non-empty field name is typed.
 *
 * @param partitioning - The current partitioning value.
 * @returns `true` when the format control is active.
 */
export function offersPartitioningFormat(
  partitioning: boolean | string
): boolean {
  if (partitioning === false) {
    return false
  }
  if (partitioning === "") {
    return false
  }
  return !isCustomPartitioning(partitioning)
}

/**
 * Validates a single validation entry against the canonical
 * `fieldValidationSchema` and, for `regex`, additionally checks the pattern is
 * constructible (matching the export gate, which the CLI emits as
 * `new RegExp(pattern)`).
 *
 * This is the per-panel Zod rule for the validations editor: it reuses the
 * schema's own building block rather than reimplementing the refinement shape,
 * so the inline message can never drift from the export gate.
 *
 * @param validation - The validation entry to check.
 * @returns An inline error message, or `undefined` when the entry is valid.
 */
export function validationError(
  validation: FieldValidation
): string | undefined {
  const parsed = fieldValidationSchema.safeParse(validation)
  if (!parsed.success) {
    return parsed.error.issues[0]?.message ?? "Invalid validation"
  }

  if (validation.type === "regex") {
    if (validation.pattern === "") {
      return "Enter a regular expression pattern."
    }
    try {
      // Construct exactly as the CLI does — `new RegExp(pattern)`, no flags —
      // so this matches the generated code and the export gate.
      // eslint-disable-next-line no-new, require-unicode-regexp
      new RegExp(validation.pattern)
    } catch (error) {
      return `Not a constructible regular expression: ${
        error instanceof Error ? error.message : String(error)
      }`
    }
  }

  if (
    (validation.type === "min" || validation.type === "max") &&
    Number.isNaN(validation.value)
  ) {
    return "Enter a number."
  }

  return undefined
}
