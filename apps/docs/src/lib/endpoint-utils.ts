import { v4 as uuidv4 } from "uuid"

import type {
  FieldDefinition,
  EndpointDefinition,
  OutputDefinition,
  OutputField,
  FieldType,
  ArrayItemType,
} from "./endpoint-types"

export function generateId(): string {
  return uuidv4()
}

export function buildOutputField(field: FieldDefinition): OutputField {
  const out: OutputField = { name: field.name, type: field.type }

  if (field.type === "Object") {
    out.fields = (field.fields ?? [])
      .filter((f) => f.name.trim() !== "")
      .map(buildOutputField)
  } else if (field.type === "Array") {
    const itemType = field.arrayItemType ?? "String"
    out.items =
      itemType === "Object"
        ? {
            type: "Object",
            fields: (field.arrayItemFields ?? [])
              .filter((f) => f.name.trim() !== "")
              .map(buildOutputField),
          }
        : { type: itemType }
  }

  return out
}

export function buildOutputJSON(def: EndpointDefinition): OutputDefinition {
  return {
    version: "1.0",
    tableName: def.tableName,
    catalog: def.catalog,
    schema: def.schema,
    fields: def.fields
      .filter((f) => f.name.trim() !== "")
      .map(buildOutputField),
  }
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

    return {
      version: "1.0",
      tableName: (obj.tableName as string) ?? "",
      catalog: (obj.catalog as string) ?? "",
      schema: (obj.schema as string) ?? "",
      fields: ((obj.fields as OutputField[]) ?? []).map(parseOutputField),
    }
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
