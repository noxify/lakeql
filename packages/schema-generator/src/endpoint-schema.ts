import { z } from "zod"

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

export type LoadStrategy = (typeof loadStrategies)[number]

/**
 * Mutation pipeline configuration for an endpoint.
 */
export interface MutationConfig {
  /** Load strategy for the write pipeline. */
  loadStrategy: LoadStrategy
  /** S3 base path for endpoint data. */
  basePath: string
}

/**
 * Zod schema for the mutation configuration object.
 */
export const mutationConfigSchema = z.object({
  loadStrategy: z.enum(loadStrategies),
  basePath: z.string().min(1),
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
  /** Whether the field is required in mutation input. Default: false. */
  required?: boolean
  /** Validation refinements to apply via Zod. */
  validations?: FieldValidation[]
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
 * Zod schema for field definitions using a discriminated union on "type".
 * Supports recursive nesting via z.lazy for Object fields and Array items.
 */
export const fieldDefinitionSchema: z.ZodType<FieldDefinition> = z.lazy(() =>
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

/**
 * Zod schema for the complete endpoint definition format.
 */
export const endpointDefinitionSchema = z.object({
  version: z.literal("1.0"),
  tableName: z.string().regex(metadataFieldPattern),
  catalog: z.string().regex(metadataFieldPattern),
  schema: z.string().regex(metadataFieldPattern),
  fields: z.array(fieldDefinitionSchema),
  mutation: mutationSchema.optional(),
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
