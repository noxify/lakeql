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

export interface ArrayItemDefinition {
  type: PrimitiveType | "Object"
  fields?: FieldDefinition[]
}

export interface FieldDefinition {
  name: string
  type: PrimitiveType | "Object" | "Array"
  fields?: FieldDefinition[]
  items?: ArrayItemDefinition
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
    }),
    z.object({
      name: z.string().regex(fieldNamePattern),
      type: z.literal("Integer"),
    }),
    z.object({
      name: z.string().regex(fieldNamePattern),
      type: z.literal("Float"),
    }),
    z.object({
      name: z.string().regex(fieldNamePattern),
      type: z.literal("Boolean"),
    }),
    z.object({
      name: z.string().regex(fieldNamePattern),
      type: z.literal("Date"),
    }),
    z.object({
      name: z.string().regex(fieldNamePattern),
      type: z.literal("DateTime"),
    }),
    z.object({
      name: z.string().regex(fieldNamePattern),
      type: z.literal("Object"),
      fields: z.array(fieldDefinitionSchema).min(1),
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
