import type { FieldDefinition } from "@/pipeline/schema"

/**
 * Formats a list of field definitions into an indented tree string for display.
 *
 * Example output:
 *   event_id: String
 *   timestamp: DateTime
 *   metadata: Object
 *     source: String
 *     version: Float
 *   tags: Array<String>
 *   dimensions: Array<Object>
 *     key: String
 *     value: String
 */
export function formatFieldTree(fields: FieldDefinition[], indent = 0): string {
  const lines: string[] = []
  const prefix = "  ".repeat(indent + 1)

  for (const field of fields) {
    if (field.type === "Object") {
      lines.push(`${prefix}${field.name}: Object`)
      if (field.fields) {
        lines.push(formatFieldTree(field.fields, indent + 1))
      }
    } else if (field.type === "Array") {
      const itemType = field.items?.type ?? "Unknown"
      lines.push(`${prefix}${field.name}: Array<${itemType}>`)
      if (field.items?.type === "Object" && field.items.fields) {
        lines.push(formatFieldTree(field.items.fields, indent + 1))
      }
    } else {
      lines.push(`${prefix}${field.name}: ${field.type}`)
    }
  }

  return lines.filter((line) => line.length > 0).join("\n")
}
