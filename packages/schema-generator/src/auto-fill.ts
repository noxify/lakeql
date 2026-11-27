import type { FieldDefinition } from "./endpoint-schema"

/**
 * Describes the write-timestamp auto-fill contract shared by codegen and the
 * runtime write pipeline (NFR1 — a single source of truth so companion names
 * cannot drift).
 *
 * Given a primary DateTime field named `<name>` carrying
 * `options.autoFill === "write_timestamp"`, the server populates three columns
 * on every schema-writing load (`append`, `full_load_append`):
 *
 * - `<name>` — the ISO write timestamp;
 * - `<name>_year` — the UTC year (Integer);
 * - `<name>_month` — the UTC month 1–12 (Integer).
 */
export const AUTO_FILL_WRITE_TIMESTAMP = {
  kind: "write_timestamp",
  /** Suffix of the derived year companion column. */
  yearSuffix: "_year",
  /** Suffix of the derived month companion column. */
  monthSuffix: "_month",
} as const

/**
 * Returns `true` when the field is a top-level write-timestamp auto-fill field.
 *
 * @param field - The field definition to inspect.
 * @returns Whether the field carries `options.autoFill === "write_timestamp"`.
 */
function isAutoFillField(field: FieldDefinition): boolean {
  return field.options?.autoFill === "write_timestamp"
}

/**
 * Derives the companion `FieldDefinition`s for a write-timestamp auto-fill
 * field. The companions are Integer fields (`<name>_year`, `<name>_month`) that
 * codegen expands into the codegen-local field list and the runtime populates
 * from the same write clock.
 *
 * @param field - The field to derive companions for.
 * @returns The derived companion field definitions, or `[]` when `field` is not
 *   a write-timestamp auto-fill field.
 */
export function deriveAutoFillColumns(
  field: FieldDefinition
): FieldDefinition[] {
  if (!isAutoFillField(field)) {
    return []
  }

  return [
    {
      name: `${field.name}${AUTO_FILL_WRITE_TIMESTAMP.yearSuffix}`,
      type: "Integer",
    },
    {
      name: `${field.name}${AUTO_FILL_WRITE_TIMESTAMP.monthSuffix}`,
      type: "Integer",
    },
  ]
}

/**
 * Returns the derived companion column names for a write-timestamp auto-fill
 * field (`<name>_year`, `<name>_month`).
 *
 * @param field - The field to derive companion names for.
 * @returns The companion names, or `[]` when `field` is not a write-timestamp
 *   auto-fill field.
 */
export function autoFillCompanionNames(field: FieldDefinition): string[] {
  return deriveAutoFillColumns(field).map((column) => column.name)
}

/**
 * Finds reserved-name collisions among top-level fields (C3/C14). Under Option
 * Y the companion columns are computed, never stored, so a plain duplicate
 * check cannot catch them: this helper derives the full reserved set (every
 * top-level auto-fill field's own name plus its derived companion names) and
 * reports any OTHER top-level field — including a second auto-fill primary —
 * whose name collides with a reserved name.
 *
 * @param fields - The top-level field definitions to check. Nested fields are
 *   intentionally ignored; auto-fill is top-level only (C13).
 * @returns One entry per colliding field, naming the colliding field and the
 *   reserved name it collides with.
 */
export function findReservedNameCollisions(
  fields: FieldDefinition[]
): { name: string; reservedName: string }[] {
  const autoFillFields = fields.filter(isAutoFillField)

  // Map every reserved name to the auto-fill field that owns it.
  const reserved = new Map<string, string>()
  for (const field of autoFillFields) {
    for (const companion of autoFillCompanionNames(field)) {
      if (!reserved.has(companion)) {
        reserved.set(companion, field.name)
      }
    }
  }

  const collisions: { name: string; reservedName: string }[] = []
  for (const field of fields) {
    // A field collides when its name is a companion reserved by ANOTHER field.
    const owner = reserved.get(field.name)
    if (owner !== undefined && owner !== field.name) {
      collisions.push({ name: field.name, reservedName: field.name })
    }
  }

  return collisions
}
