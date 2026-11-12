import type { LoadStrategy } from "@lakeql/datasource"
import { z } from "zod"

import { autoFillCompanionNames } from "./auto-fill"

/**
 * Re-exports the shared auto-fill derivation helpers so existing
 * `@lakeql/schema-generator/endpoint-schema` consumers reach them without a new
 * package.json exports subpath (NFR1).
 */
export {
  AUTO_FILL_WRITE_TIMESTAMP,
  autoFillCompanionNames,
  deriveAutoFillColumns,
  findReservedNameCollisions,
} from "./auto-fill"

/**
 * Regex pattern for field names: alphanumeric + underscore, no leading digit, max 64 chars.
 */
export const fieldNamePattern = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/u

/**
 * Regex pattern for metadata fields (tableName, catalog, schema): alphanumeric + underscore,
 * no leading digit, max 128 chars.
 */
export const metadataFieldPattern = /^[a-zA-Z_][a-zA-Z0-9_]{0,127}$/u

/**
 * Supported load strategies for the mutation write pipeline.
 */
export const loadStrategies = [
  "full_load",
  "full_load_append",
  "append",
] as const

/**
 * Canonical load-strategy union, owned by `@lakeql/datasource` and re-exported
 * here so the Zod `loadStrategies` enum and the datasource type cannot drift.
 */
export type { LoadStrategy } from "@lakeql/datasource"

// Compile-time assertion that the Zod const and the canonical datasource union
// stay in lockstep. Either side drifting produces a type error here.
type AssertSame<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : never
  : never
const _loadStrategyParity: AssertSame<
  (typeof loadStrategies)[number],
  LoadStrategy
> = true
void _loadStrategyParity

/**
 * Supported partitioning format granularities.
 */
export const partitioningFormats = [
  "year",
  "year/month",
  "year/month/day",
] as const
export type PartitioningFormat = (typeof partitioningFormats)[number]

/**
 * Supported date components for custom partition format segments.
 */
export const partitioningComponents = [
  "year",
  "month",
  "day",
  "hour",
  "minute",
  "second",
] as const
export type PartitioningComponent = (typeof partitioningComponents)[number]

/**
 * Validates a custom partitioning format string.
 * - If the value contains no `/` and no `:`, it must match fieldNamePattern (legacy single-field mode).
 * - If it contains `/` or `:`, each segment is validated:
 *   - Plain segments must match fieldNamePattern.
 *   - Colon segments must be `fieldname:component` where fieldname matches pattern
 *     and component is one of the supported partitioning components.
 *
 * Returns null if valid, or an error message string if invalid.
 */
export function validatePartitioningFormat(value: string): string | null {
  const isCustomFormat = value.includes("/") || value.includes(":")

  if (!isCustomFormat) {
    // Legacy single-field mode: must be a valid field name
    if (!fieldNamePattern.test(value)) {
      return `Invalid partition field name "${value}". Must match pattern: letters/underscores, no leading digit, max 64 chars.`
    }
    return null
  }

  // Custom format: parse and validate each segment
  const segments = value.split("/")
  for (const segment of segments) {
    if (segment === "") {
      return `Invalid partition format: empty segment found in "${value}".`
    }

    if (segment.includes(":")) {
      const parts = segment.split(":")
      if (parts.length !== 2) {
        return `Invalid partition segment "${segment}": expected format "fieldname:component".`
      }
      const [fieldName, component] = parts as [string, string]
      if (!fieldNamePattern.test(fieldName)) {
        return `Invalid field name "${fieldName}" in partition segment "${segment}".`
      }
      if (
        !partitioningComponents.includes(component as PartitioningComponent)
      ) {
        return `Invalid date component "${component}" in partition segment "${segment}". Expected one of: ${partitioningComponents.join(", ")}.`
      }
    } else if (!fieldNamePattern.test(segment)) {
      return `Invalid field name "${segment}" in partition format.`
    }
  }

  return null
}

/**
 * Partitioning configuration value:
 * - false: no partitioning (flat layout)
 * - string: partition by a named field or a custom partition-path format
 */
export type PartitioningValue = false | string

/**
 * Mutation pipeline configuration for an endpoint.
 */
export interface MutationConfig {
  /** Load strategy for the write pipeline. */
  loadStrategy: LoadStrategy
  /** Base path for endpoint data. */
  basePath: string
  /**
   * Partitioning mode. `false` disables partitioning (flat layout), or a string
   * for field-based/custom partition-path partitioning. An absent key resolves
   * to `false`.
   */
  partitioning?: PartitioningValue
  /**
   * Partition path granularity. One of `"year"`, `"year/month"`, or `"year/month/day"`.
   * @default "year/month/day"
   */
  partitioningFormat?: string
}

/**
 * Zod schema for the mutation configuration object.
 */
export const mutationConfigSchema = z
  .object({
    loadStrategy: z.enum(loadStrategies),
    basePath: z.string().min(1),
    partitioning: z.union([z.literal(false), z.string().min(1)]).optional(),
    partitioningFormat: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // Only a string partitioning value is validated here; `false` and an
    // absent key (which resolves to `false`) disable partitioning entirely.
    if (typeof data.partitioning !== "string") {
      return
    }

    const error = validatePartitioningFormat(data.partitioning)
    if (error) {
      ctx.addIssue({
        code: "custom",
        path: ["partitioning"],
        message: error,
      })
      return
    }

    // A custom format (contains / or :) carries its own granularity, so
    // partitioningFormat does not apply.
    const isCustomFormat =
      data.partitioning.includes("/") || data.partitioning.includes(":")
    if (isCustomFormat) {
      return
    }

    // Validate partitioningFormat for a non-custom single-field string.
    if (
      data.partitioningFormat !== undefined &&
      !partitioningFormats.includes(
        data.partitioningFormat as PartitioningFormat
      )
    ) {
      ctx.addIssue({
        code: "invalid_value",
        values: [...partitioningFormats],
        path: ["partitioningFormat"],
        message: `Invalid partitioning format. Expected one of: ${partitioningFormats.join(", ")}`,
      })
    }
  })

/**
 * Zod schema for the mutation field: either `false` (disabled) or a config object (enabled).
 */
export const mutationSchema = z.union([z.literal(false), mutationConfigSchema])

/**
 * Supported primitive types for field definitions.
 */
export const primitiveTypes = [
  "String",
  "Integer",
  "Float",
  "Boolean",
  "Date",
  "DateTime",
] as const

export type PrimitiveType = (typeof primitiveTypes)[number]

/**
 * Field-level validation refinement types.
 */
export type FieldValidation =
  | { type: "email" }
  | { type: "url" }
  | { type: "uuid" }
  | { type: "min"; value: number }
  | { type: "max"; value: number }
  | { type: "regex"; pattern: string }

/**
 * Field-level options for mutation input validation.
 */
export interface FieldOptions {
  /**
   * Whether the field is required in mutation input.
   * @default false
   */
  required?: boolean
  /**
   * Validation refinements to apply via Zod at runtime.
   * @default []
   */
  validations?: FieldValidation[]
  /**
   * Whether the field is read-only. Read-only fields appear in the query schema and Hive DDL but are excluded from the mutation input type.
   * @default false
   */
  readOnly?: boolean
  /**
   * Marks the field as server-populated at write time. A `"write_timestamp"`
   * auto-fill field is stamped from the write clock on every schema-writing
   * load; it is visible in the query type and the DDL (together with its
   * derived `_year`/`_month` companion columns) but excluded from the mutation
   * input. Valid only on a top-level `DateTime` field under an enabled
   * `append`/`full_load_append` mutation.
   */
  autoFill?: "write_timestamp"
}

/**
 * Zod schema for field validation refinements.
 */
export const fieldValidationSchema: z.ZodType<FieldValidation> = z.union([
  z.object({ type: z.literal("email") }),
  z.object({ type: z.literal("url") }),
  z.object({ type: z.literal("uuid") }),
  z.object({ type: z.literal("min"), value: z.number() }),
  z.object({ type: z.literal("max"), value: z.number() }),
  z.object({ type: z.literal("regex"), pattern: z.string() }),
])

/**
 * Zod schema for field-level options.
 */
export const fieldOptionsSchema: z.ZodType<FieldOptions> = z.object({
  required: z.boolean().optional(),
  validations: z.array(fieldValidationSchema).optional(),
  readOnly: z.boolean().optional(),
  // Declared on the SHARED options schema so the key is never silently
  // stripped on a non-DateTime field; the discriminated-union superRefine
  // rejects it on every non-DateTime member instead (C12).
  autoFill: z.literal("write_timestamp").optional(),
})

export interface ArrayItemDefinition {
  type: PrimitiveType | "Object"
  fields?: FieldDefinition[]
}

export interface FieldDefinition {
  name: string
  type: PrimitiveType | "Object" | "Array"
  fields?: FieldDefinition[]
  items?: ArrayItemDefinition
  options?: FieldOptions
}

/**
 * Maximum length of an auto-fill field's primary name. Derived companions
 * append the longest suffix `_month` (6 chars) and the field-name pattern
 * allows up to 64 chars, so an auto-fill primary is capped at 58 (= 64 − 6) so
 * a companion name can never exceed the pattern limit (C14). This is a
 * deliberate tightening of the field-name pattern for auto-fill fields only.
 */
export const AUTO_FILL_NAME_MAX_LENGTH = 58

/**
 * Zod schema for field definitions using a discriminated union on "type".
 * Supports recursive nesting via z.lazy for Object fields and Array items.
 *
 * A `superRefine` enforces the per-field auto-fill contract (C6/C12/C14):
 * `options.autoFill` is rejected on every non-`DateTime` member (proving the
 * key is not silently stripped), and a `DateTime` member carrying `autoFill`
 * must have a name no longer than {@link AUTO_FILL_NAME_MAX_LENGTH} chars. The
 * top-level-only rule (C13/C17) is enforced separately at the endpoint level.
 */
export const fieldDefinitionSchema: z.ZodType<FieldDefinition> = z
  .lazy(() =>
    z.discriminatedUnion("type", [
      z.object({
        name: z.string().regex(fieldNamePattern),
        type: z.literal("String"),
        options: fieldOptionsSchema.optional(),
      }),
      z.object({
        name: z.string().regex(fieldNamePattern),
        type: z.literal("Integer"),
        options: fieldOptionsSchema.optional(),
      }),
      z.object({
        name: z.string().regex(fieldNamePattern),
        type: z.literal("Float"),
        options: fieldOptionsSchema.optional(),
      }),
      z.object({
        name: z.string().regex(fieldNamePattern),
        type: z.literal("Boolean"),
        options: fieldOptionsSchema.optional(),
      }),
      z.object({
        name: z.string().regex(fieldNamePattern),
        type: z.literal("Date"),
        options: fieldOptionsSchema.optional(),
      }),
      z.object({
        name: z.string().regex(fieldNamePattern),
        type: z.literal("DateTime"),
        options: fieldOptionsSchema.optional(),
      }),
      z.object({
        name: z.string().regex(fieldNamePattern),
        type: z.literal("Object"),
        fields: z.array(fieldDefinitionSchema).min(1),
        options: fieldOptionsSchema.optional(),
      }),
      z.object({
        name: z.string().regex(fieldNamePattern),
        type: z.literal("Array"),
        items: z.union([
          z.object({ type: z.enum(primitiveTypes) }),
          z.object({
            type: z.literal("Object"),
            fields: z.array(fieldDefinitionSchema).min(1),
          }),
        ]),
        options: fieldOptionsSchema.optional(),
      }),
    ])
  )
  .superRefine((field, ctx) => {
    if (field.options?.autoFill === undefined) {
      return
    }

    // autoFill is valid only on a DateTime field (C6/C12).
    if (field.type !== "DateTime") {
      ctx.addIssue({
        code: "custom",
        path: ["options", "autoFill"],
        message: `Field "${field.name}" of type "${field.type}" cannot use autoFill. autoFill is only valid on a DateTime field.`,
      })
      return
    }

    // Cap the primary name so derived companions stay within the pattern (C14).
    if (field.name.length > AUTO_FILL_NAME_MAX_LENGTH) {
      ctx.addIssue({
        code: "custom",
        path: ["name"],
        message: `autoFill field "${field.name}" exceeds the ${AUTO_FILL_NAME_MAX_LENGTH}-character limit. autoFill fields are capped at ${AUTO_FILL_NAME_MAX_LENGTH} chars (64-char field-name pattern minus the longest "_month" companion suffix).`,
      })
    }
  })

/**
 * Canonical endpoint-definition schema version emitted by scaffolding and
 * Studio. The redesign drops v1 support with no compatibility shim (DD6).
 */
export const ENDPOINT_SCHEMA_VERSION = "2.0"

/**
 * Checks whether a value is the supported endpoint-definition schema version.
 * Used by create-endpoint / Studio pre-checks to surface the actionable
 * "v1 no longer supported" message before the generic Zod literal error
 * (FR5.1/DD6/C1).
 *
 * @param value - The `version` value read from an endpoint definition.
 * @returns `true` when `value` equals {@link ENDPOINT_SCHEMA_VERSION}.
 */
export function isSupportedVersion(value: unknown): boolean {
  return value === ENDPOINT_SCHEMA_VERSION
}

/**
 * Walks every descendant of the top-level fields (depth > 0) and reports any
 * field carrying `options.autoFill` at its precise Zod path. autoFill is a
 * top-level-only rule (C13/C17); a `superRefine` on the recursive field union
 * cannot know its own depth, so the walk runs at the endpoint level where the
 * top level is known.
 */
function reportNestedAutoFill(
  fields: FieldDefinition[],
  basePath: (string | number)[],
  ctx: z.RefinementCtx
): void {
  for (const [index, field] of fields.entries()) {
    if (field.options?.autoFill !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: [...basePath, index, "options", "autoFill"],
        message: `Field "${field.name}" cannot use autoFill. autoFill is only valid on a top-level field.`,
      })
    }

    if (field.type === "Object" && field.fields) {
      reportNestedAutoFill(field.fields, [...basePath, index, "fields"], ctx)
    }

    if (
      field.type === "Array" &&
      field.items?.type === "Object" &&
      field.items.fields
    ) {
      reportNestedAutoFill(
        field.items.fields,
        [...basePath, index, "items", "fields"],
        ctx
      )
    }
  }
}

/**
 * Reports the autoFill-vs-mutation contract violations at the endpoint level:
 * an autoFill field requires an enabled `append`/`full_load_append` mutation
 * (C11/C16), and no partition segment may reference a derived companion column
 * in any form (C15/FR6.3). Extracted from the endpoint superRefine to keep each
 * refinement focused.
 */
function reportAutoFillMutationIssues(
  definition: { fields: FieldDefinition[]; mutation?: MutationConfig | false },
  ctx: z.RefinementCtx
): void {
  const { fields, mutation } = definition
  const autoFillFields = fields.filter(
    (field) => field.options?.autoFill !== undefined
  )
  if (autoFillFields.length === 0) {
    return
  }

  const mutationEnabled = mutation !== undefined && mutation !== false
  const loadStrategy = mutationEnabled ? mutation.loadStrategy : undefined
  const autoFillAllowed =
    loadStrategy === "append" || loadStrategy === "full_load_append"

  if (!autoFillAllowed) {
    for (const field of autoFillFields) {
      ctx.addIssue({
        code: "custom",
        path: ["fields", fields.indexOf(field), "options", "autoFill"],
        message: mutationEnabled
          ? `autoFill field "${field.name}" requires loadStrategy "append" or "full_load_append"; "${loadStrategy}" overwrites the dataset and ignores a write-timestamp field.`
          : `autoFill field "${field.name}" requires an enabled mutation with loadStrategy "append" or "full_load_append". Without a write there is nothing to populate.`,
      })
    }
    return
  }

  // Reject any partition segment whose fieldName is a derived companion name,
  // in ANY form (bare `event_year` or `event_year:year`) (C15/FR6.3).
  if (!mutationEnabled || typeof mutation.partitioning !== "string") {
    return
  }

  const companionNames = new Set(
    autoFillFields.flatMap((field) => autoFillCompanionNames(field))
  )
  for (const segment of mutation.partitioning.split("/")) {
    const [segmentField = ""] = segment.split(":")
    if (companionNames.has(segmentField)) {
      const primary = segmentField.replace(/_(?:year|month)$/u, "")
      ctx.addIssue({
        code: "custom",
        path: ["mutation", "partitioning"],
        message: `Partition segment "${segment}" references derived companion column "${segmentField}", which is not a valid partition source. Use the primary field's component form, e.g. "${primary}:year".`,
      })
    }
  }
}

/**
 * Zod schema for the complete endpoint definition format.
 */
export const endpointDefinitionSchema = z
  .object({
    version: z.literal(ENDPOINT_SCHEMA_VERSION),
    tableName: z.string().regex(metadataFieldPattern),
    catalog: z.string().regex(metadataFieldPattern),
    schema: z.string().regex(metadataFieldPattern),
    /** Name of the configured DataSource this endpoint targets. When omitted, generation uses `"default"`. */
    dataSource: z.string().min(1).optional(),
    fields: z.array(fieldDefinitionSchema),
    mutation: mutationSchema.optional(),
  })
  .superRefine((definition, ctx) => {
    // (a) Top-level-only rule: reject autoFill on any nested descendant (C13/C17).
    for (const [index, field] of definition.fields.entries()) {
      if (field.type === "Object" && field.fields) {
        reportNestedAutoFill(field.fields, ["fields", index, "fields"], ctx)
      }

      if (
        field.type === "Array" &&
        field.items?.type === "Object" &&
        field.items.fields
      ) {
        reportNestedAutoFill(
          field.items.fields,
          ["fields", index, "items", "fields"],
          ctx
        )
      }
    }

    // (b) autoFill requires an enabled append/full_load_append mutation, and no
    // partition segment may reference a derived companion column (C11/C15/C16).
    reportAutoFillMutationIssues(definition, ctx)
  })

export type EndpointDefinitionFormat = z.infer<typeof endpointDefinitionSchema>

/**
 * Checks for duplicate field names at the same nesting level within a list of field definitions.
 * Returns an array of objects describing each duplicate found, including the field name and path.
 */
export function findDuplicateFieldNames(
  fields: FieldDefinition[],
  path: string[] = []
): { name: string; path: string[] }[] {
  const duplicates: { name: string; path: string[] }[] = []
  const seen = new Set<string>()

  for (const field of fields) {
    if (seen.has(field.name)) {
      duplicates.push({ name: field.name, path })
    } else {
      seen.add(field.name)
    }

    // Recurse into nested Object fields
    if (field.type === "Object" && field.fields) {
      duplicates.push(
        ...findDuplicateFieldNames(field.fields, [...path, field.name])
      )
    }

    // Recurse into Array items that are Objects
    if (
      field.type === "Array" &&
      field.items?.type === "Object" &&
      field.items.fields
    ) {
      duplicates.push(
        ...findDuplicateFieldNames(field.items.fields, [
          ...path,
          field.name,
          "items",
        ])
      )
    }
  }

  return duplicates
}
