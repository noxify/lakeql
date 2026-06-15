export type FieldType =
  | "String"
  | "Integer"
  | "Float"
  | "Boolean"
  | "Date"
  | "DateTime"
  | "Object"
  | "Array"

export type PrimitiveType =
  | "String"
  | "Integer"
  | "Float"
  | "Boolean"
  | "Date"
  | "DateTime"
export type ArrayItemType = PrimitiveType | "Object"

export type FieldValidation =
  | { type: "email" }
  | { type: "url" }
  | { type: "uuid" }
  | { type: "min"; value: number }
  | { type: "max"; value: number }
  | { type: "regex"; pattern: string }

export type FieldValidationType = FieldValidation["type"]

export interface FieldOptions {
  required?: boolean
  validations?: FieldValidation[]
}

export interface FieldDefinition {
  id: string
  name: string
  type: FieldType
  // For Object type
  fields?: FieldDefinition[]
  // For Array type
  arrayItemType?: ArrayItemType
  arrayItemFields?: FieldDefinition[] // when arrayItemType is "Object"
  // Field-level options (mutation validation)
  options?: FieldOptions
}

export type LoadStrategy = "full_load" | "full_load_append" | "append"

export type StorageType = "s3" | "minio"

export interface MutationConfig {
  loadStrategy: LoadStrategy
  type: StorageType
  bucket: string
  basePath: string
  region?: string
  endpoint?: string
}

export interface EndpointDefinition {
  version: "1.0"
  tableName: string
  catalog: string
  schema: string
  fields: FieldDefinition[]
  mutation?: false | MutationConfig
}

// Output JSON types (no id, no arrayItemType tracking)
export interface OutputField {
  name: string
  type: FieldType
  fields?: OutputField[]
  items?: { type: ArrayItemType; fields?: OutputField[] }
  options?: FieldOptions
}

export interface OutputDefinition {
  version: "1.0"
  tableName: string
  catalog: string
  schema: string
  fields: OutputField[]
  mutation?: false | MutationConfig
}

export const LOAD_STRATEGIES: LoadStrategy[] = [
  "full_load",
  "full_load_append",
  "append",
]

export const FIELD_TYPE_COLORS: Record<FieldType, string> = {
  String: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  Integer:
    "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  Float: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  Boolean:
    "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  Date: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  DateTime:
    "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  Object: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  Array: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
}

export const METADATA_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]{0,127}$/u
export const FIELD_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/u

export const ALL_TYPES: FieldType[] = [
  "String",
  "Integer",
  "Float",
  "Boolean",
  "Date",
  "DateTime",
  "Object",
  "Array",
]

export const ARRAY_ITEM_TYPES: ArrayItemType[] = [
  "String",
  "Integer",
  "Float",
  "Boolean",
  "Date",
  "DateTime",
  "Object",
]

export const MAX_DEPTH = 5

export const VALIDATION_TYPES: {
  type: FieldValidationType
  label: string
  hasValue?: "number" | "text"
}[] = [
  { type: "email", label: "Email" },
  { type: "url", label: "URL" },
  { type: "uuid", label: "UUID" },
  { type: "min", label: "Min", hasValue: "number" },
  { type: "max", label: "Max", hasValue: "number" },
  { type: "regex", label: "Regex", hasValue: "text" },
]

/**
 * Maps field types to their applicable validation types.
 * Only these validations will be shown in the field options popover.
 */
export const VALIDATIONS_BY_FIELD_TYPE: Record<
  FieldType,
  FieldValidationType[]
> = {
  String: ["email", "url", "uuid", "min", "max", "regex"],
  Integer: ["min", "max"],
  Float: ["min", "max"],
  Boolean: [],
  Date: [],
  DateTime: [],
  Object: [],
  Array: [],
}
