import {
  fieldNamePattern,
  metadataFieldPattern,
  primitiveTypes,
} from "@lakeql/schema-generator/endpoint-schema"

import type { EditorArrayItemType, EditorFieldType } from "@/core"

/**
 * The selectable field types shown in the tree's type picker: the six schema
 * primitives followed by the two structural kinds. Order is stable so the
 * picker renders deterministically.
 */
export const fieldTypeOptions: readonly EditorFieldType[] = [
  ...primitiveTypes,
  "Object",
  "Array",
]

/**
 * The selectable item types for an `Array` field: any primitive or `Object`.
 * `Array` is intentionally absent — the schema forbids `Array` of `Array`.
 */
export const arrayItemTypeOptions: readonly EditorArrayItemType[] = [
  ...primitiveTypes,
  "Object",
]

/**
 * The inline message shown when a metadata field (`tableName`, `catalog`,
 * `schema`) violates `metadataFieldPattern`.
 */
export const METADATA_FIELD_RULE =
  "Letters, digits and underscores only, no leading digit, max 128 characters."

/**
 * The inline message shown when a field `name` violates `fieldNamePattern`.
 */
export const FIELD_NAME_RULE =
  "Letters, digits and underscores only, no leading digit, max 64 characters."

/**
 * Validates a controlled metadata input against the canonical
 * `metadataFieldPattern`, returning the inline error message, or `undefined`
 * when the value is empty (incomplete, not yet an error) or valid.
 *
 * The pattern itself is imported from `@lakeql/schema-generator/endpoint-schema`
 * so the control-level message can never drift from the export gate, which
 * remains the single source of validity.
 *
 * @param value - The current input value.
 * @returns The inline error message, or `undefined` when there is none to show.
 */
export function metadataFieldError(value: string): string | undefined {
  if (value === "") {
    return undefined
  }
  return metadataFieldPattern.test(value) ? undefined : METADATA_FIELD_RULE
}

/**
 * Validates a controlled field-name input against the canonical
 * `fieldNamePattern`, returning the inline error message, or `undefined` when
 * the value is empty (incomplete) or valid.
 *
 * @param value - The current field-name value.
 * @returns The inline error message, or `undefined` when there is none to show.
 */
export function fieldNameError(value: string): string | undefined {
  if (value === "") {
    return undefined
  }
  return fieldNamePattern.test(value) ? undefined : FIELD_NAME_RULE
}
