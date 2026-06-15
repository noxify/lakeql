import { v4 as uuidv4 } from "uuid"

import type {
  FieldDefinition,
  EndpointDefinition,
  OutputDefinition,
  OutputField,
  FieldType,
  ArrayItemType,
  MutationConfig,
  FieldOptions,
  FieldValidation,
} from "./endpoint-types"

export function generateId(): string {
  return uuidv4()
}

export function buildOutputField(field: FieldDefinition): OutputField | null {
  const out: OutputField = { name: field.name, type: field.type }

  if (field.type === "Object") {
    const children = (field.fields ?? [])
      .filter((f) => f.name.trim() !== "")
      .map(buildOutputField)
      .filter((f): f is OutputField => f !== null)
    if (children.length === 0) {
      return null
    }
    out.fields = children
  } else if (field.type === "Array") {
    const itemType = field.arrayItemType ?? "String"
    if (itemType === "Object") {
      const children = (field.arrayItemFields ?? [])
        .filter((f) => f.name.trim() !== "")
        .map(buildOutputField)
        .filter((f): f is OutputField => f !== null)
      if (children.length === 0) {
        return null
      }
      out.items = { type: "Object", fields: children }
    } else {
      out.items = { type: itemType }
    }
  }

  // Include options only when they have meaningful content
  if (field.options) {
    const opts: FieldOptions = {}
    if (field.options.required) {
      opts.required = true
    }
    if (field.options.validations && field.options.validations.length > 0) {
      opts.validations = field.options.validations
    }
    if (opts.required || opts.validations) {
      out.options = opts
    }
  }

  return out
}

export function buildOutputJSON(def: EndpointDefinition): OutputDefinition {
  const output: OutputDefinition = {
    version: "1.0",
    tableName: def.tableName,
    catalog: def.catalog,
    schema: def.schema,
    fields: def.fields
      .filter((f) => f.name.trim() !== "")
      .map(buildOutputField)
      .filter((f): f is OutputField => f !== null),
  }

  if (def.mutation && typeof def.mutation === "object") {
    output.mutation = {
      loadStrategy: def.mutation.loadStrategy,
      type: def.mutation.type,
      bucket: def.mutation.bucket,
      basePath: def.mutation.basePath,
      ...(def.mutation.region ? { region: def.mutation.region } : {}),
      ...(def.mutation.endpoint ? { endpoint: def.mutation.endpoint } : {}),
    }
  }

  return output
}

function parseOutputField(field: OutputField): FieldDefinition {
  const base: FieldDefinition = {
    id: generateId(),
    name: field.name,
    type: field.type as FieldType,
  }

  if (field.type === "Object" && field.fields) {
    base.fields = field.fields.map(parseOutputField)
  } else if (field.type === "Array" && field.items) {
    const itemType = field.items.type as ArrayItemType
    base.arrayItemType = itemType
    if (itemType === "Object" && field.items.fields) {
      base.arrayItemFields = field.items.fields.map(parseOutputField)
    }
  }

  if (field.options) {
    base.options = {}
    if (field.options.required) {
      base.options.required = true
    }
    if (field.options.validations && field.options.validations.length > 0) {
      base.options.validations = field.options.validations as FieldValidation[]
    }
  }

  return base
}

export function parseImportedJSON(json: unknown): EndpointDefinition | null {
  try {
    const obj = json as Record<string, unknown>
    if (!obj || typeof obj !== "object") {
      return null
    }
    if (obj.version !== "1.0") {
      return null
    }

    const def: EndpointDefinition = {
      version: "1.0",
      tableName: (obj.tableName as string) ?? "",
      catalog: (obj.catalog as string) ?? "",
      schema: (obj.schema as string) ?? "",
      fields: ((obj.fields as OutputField[]) ?? []).map(parseOutputField),
    }

    if (obj.mutation && typeof obj.mutation === "object") {
      const mutation = obj.mutation as Record<string, unknown>
      def.mutation = {
        loadStrategy:
          (mutation.loadStrategy as MutationConfig["loadStrategy"]) ??
          "full_load",
        type: (mutation.type as MutationConfig["type"]) ?? "s3",
        bucket: (mutation.bucket as string) ?? "",
        basePath: (mutation.basePath as string) ?? "",
        ...(mutation.region ? { region: mutation.region as string } : {}),
        ...(mutation.endpoint ? { endpoint: mutation.endpoint as string } : {}),
      }
    } else if (obj.mutation === false) {
      def.mutation = false
    }

    return def
  } catch {
    return null
  }
}

export function getDuplicateNames(fields: FieldDefinition[]): Set<string> {
  const seen = new Set<string>()
  const dupes = new Set<string>()
  for (const f of fields) {
    if (f.name) {
      if (seen.has(f.name)) {
        dupes.add(f.name)
      } else {
        seen.add(f.name)
      }
    }
  }
  return dupes
}
