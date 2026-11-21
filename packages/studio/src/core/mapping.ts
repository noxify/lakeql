import type {
  ArrayItemDefinition,
  EndpointDefinitionFormat,
  FieldDefinition,
  FieldOptions,
} from "@lakeql/schema-generator/endpoint-schema"

import type {
  EditorArrayItem,
  EditorField,
  EditorMutation,
  EditorState,
} from "./model"
import { createFieldId, DEFAULT_PARTITIONING_FORMAT } from "./model"
import {
  resolvePartitionString,
  serializePartitionSegments,
} from "./partitioning"

/**
 * Returns `true` when a field's options carry no authored value and should be
 * omitted from the export entirely (rather than emitted as empty defaults).
 */
function optionsAreEmpty(options: FieldOptions | undefined): boolean {
  if (options === undefined) {
    return true
  }
  const hasRequired = options.required === true
  const hasReadOnly = options.readOnly === true
  const hasValidations =
    options.validations !== undefined && options.validations.length > 0
  const hasAutoFill = options.autoFill !== undefined
  return !hasRequired && !hasReadOnly && !hasValidations && !hasAutoFill
}

/**
 * Normalizes a field's options for export: drops `required`/`readOnly` when
 * `false` and an empty `validations` array, preserves an `autoFill` marker, and
 * returns `undefined` when nothing meaningful remains.
 */
function toDefinitionOptions(
  options: FieldOptions | undefined
): FieldOptions | undefined {
  if (optionsAreEmpty(options)) {
    return undefined
  }
  // `options` is defined and non-empty here.
  const source = options as FieldOptions
  const result: FieldOptions = {}
  if (source.required === true) {
    result.required = true
  }
  if (source.readOnly === true) {
    result.readOnly = true
  }
  if (source.validations !== undefined && source.validations.length > 0) {
    result.validations = source.validations.map((validation) => ({
      ...validation,
    }))
  }
  if (source.autoFill !== undefined) {
    result.autoFill = source.autoFill
  }
  return result
}

/**
 * Maps an editor array item to its export shape, recursing into `Object`
 * children.
 */
function toDefinitionArrayItem(item: EditorArrayItem): ArrayItemDefinition {
  if (item.type === "Object") {
    return {
      type: "Object",
      fields: (item.fields ?? []).map(toDefinitionField),
    }
  }
  return { type: item.type }
}

/**
 * Maps a single editor field to its export `FieldDefinition`, stripping the
 * client-side `id`, omitting empty `options`, and recursing into structural
 * children.
 */
function toDefinitionField(field: EditorField): FieldDefinition {
  const base: FieldDefinition = {
    name: field.name,
    type: field.type,
  }

  if (field.type === "Object") {
    base.fields = (field.fields ?? []).map(toDefinitionField)
  } else if (field.type === "Array" && field.items !== undefined) {
    base.items = toDefinitionArrayItem(field.items)
  }

  const options = toDefinitionOptions(field.options)
  if (options !== undefined) {
    base.options = options
  }

  return base
}

/**
 * Maps the editor mutation to its export value: the literal `false` when
 * disabled, or a config object when enabled.
 *
 * When enabled, `partitioning` is always emitted explicitly (an enabled
 * mutation never relies on the absent-key default, which is now `false`, C8),
 * and `partitioningFormat` is omitted when partitioning is disabled, a custom
 * string, or equal to the effective default (`"year/month/day"`).
 */
function toDefinitionMutation(
  mutation: EditorMutation,
  fields: EditorField[]
): EndpointDefinitionFormat["mutation"] {
  if (!mutation.enabled) {
    return false
  }

  const config: NonNullable<
    Exclude<EndpointDefinitionFormat["mutation"], false>
  > = {
    loadStrategy: mutation.loadStrategy,
    basePath: mutation.basePath,
  }

  const { partitioningFormat } = mutation
  // Segments are held by field id; the export is the unchanged name-based
  // string, resolved against the live field names.
  const partitioning =
    mutation.partitioning === false
      ? false
      : serializePartitionSegments(mutation.partitioning, fields)

  // Always emit an explicit `partitioning` for an enabled mutation: an absent
  // key now resolves to `false`, so omitting it would silently change meaning
  // (C8/FR2.2). The exporter never relies on the absent-key default.
  config.partitioning = partitioning

  // `partitioningFormat` is only meaningful in the non-custom modes: a legacy
  // single-field string (no `/` or `:`). It is omitted when partitioning is
  // off, a custom format string, or equal to the effective default.
  const partitioningIsOff = partitioning === false
  const partitioningIsCustom =
    typeof partitioning === "string" &&
    (partitioning.includes("/") || partitioning.includes(":"))
  const formatIsDefault = partitioningFormat === DEFAULT_PARTITIONING_FORMAT

  if (!partitioningIsOff && !partitioningIsCustom && !formatIsDefault) {
    config.partitioningFormat = partitioningFormat
  }

  return config
}

/**
 * Projects the live editor state onto the canonical export definition.
 *
 * This is the single boundary between the UI shape and the export shape. It
 * strips every client-side `id`, omits an empty `dataSource`, omits empty field
 * `options`, emits `mutation: false` when disabled, and omits partitioning keys
 * whose values equal the effective runtime defaults — producing the minimal
 * JSON a hand-written definition would contain.
 *
 * The result is a candidate value: it is not guaranteed to be schema-valid
 * (the editor may hold transient invalid states). Validation is the concern of
 * the validity gate, which is built on top of this function.
 *
 * No field is injected on export: a write-timestamp column is now an explicit
 * auto-fill field the author declares (`options.autoFill`), so the exported
 * `fields` are exactly the authored fields.
 *
 * @param state - The live editor state.
 * @returns A candidate {@link EndpointDefinitionFormat} with minimal keys.
 */
export function toDefinition(state: EditorState): EndpointDefinitionFormat {
  const fields = state.fields.map(toDefinitionField)

  const definition: EndpointDefinitionFormat = {
    version: state.version,
    tableName: state.tableName,
    catalog: state.catalog,
    schema: state.schema,
    fields,
    mutation: toDefinitionMutation(state.mutation, state.fields),
  }

  if (state.dataSource !== "") {
    definition.dataSource = state.dataSource
  }

  return definition
}

/**
 * Materializes an export array item back into editor shape, assigning fresh
 * `id`s to any `Object` children.
 */
function fromDefinitionArrayItem(item: ArrayItemDefinition): EditorArrayItem {
  if (item.type === "Object") {
    return {
      type: "Object",
      fields: (item.fields ?? []).map(fromDefinitionField),
    }
  }
  return { type: item.type }
}

/**
 * Materializes an export field back into an {@link EditorField}, assigning a
 * fresh client-side `id` and recursing into structural children.
 */
function fromDefinitionField(field: FieldDefinition): EditorField {
  const editorField: EditorField = {
    id: createFieldId(),
    name: field.name,
    type: field.type,
  }

  if (field.type === "Object") {
    editorField.fields = (field.fields ?? []).map(fromDefinitionField)
  } else if (field.type === "Array" && field.items !== undefined) {
    editorField.items = fromDefinitionArrayItem(field.items)
  }

  if (field.options !== undefined) {
    editorField.options = {
      ...field.options,
      ...(field.options.validations === undefined
        ? {}
        : {
            validations: field.options.validations.map((validation) => ({
              ...validation,
            })),
          }),
    }
  }

  return editorField
}

/**
 * Materializes the export mutation value back into an {@link EditorMutation},
 * resolving an absent `partitioning` to `false` (off, C8) and filling in the
 * effective-default `partitioningFormat` so the UI controls always have a
 * concrete value to display.
 */
function fromDefinitionMutation(
  mutation: EndpointDefinitionFormat["mutation"],
  fields: EditorField[]
): EditorMutation {
  if (mutation === undefined || mutation === false) {
    return { enabled: false }
  }

  // An absent `partitioning` key now resolves to `false` (off), not timestamp
  // (C8). The editor's narrowed `partitioning` type excludes `true`, so a
  // legacy `true` is coerced to `false` here as well.
  const rawPartitioning = mutation.partitioning ?? false
  // A string is resolved to id-based segments against the imported fields; a
  // name that cannot be resolved uniquely stays an unresolved segment.
  const partitioning =
    typeof rawPartitioning === "string"
      ? resolvePartitionString(rawPartitioning, fields)
      : false
  return {
    enabled: true,
    loadStrategy: mutation.loadStrategy,
    basePath: mutation.basePath,
    partitioning,
    partitioningFormat:
      mutation.partitioningFormat ?? DEFAULT_PARTITIONING_FORMAT,
  }
}

/**
 * Builds a live editor state from a parsed definition — the inverse of
 * {@link toDefinition}.
 *
 * Assigns fresh client-side `id`s throughout and materializes the effective
 * defaults into the controls (empty `dataSource` when absent, concrete
 * partitioning values) so the UI shows what each value is. The identity
 * `toDefinition(fromDefinition(def))` is semantically equal to `def`. Partition
 * segments are resolved from names to field ids; a name that is missing or
 * duplicated stays an unresolved segment so it round-trips unchanged.
 *
 * @param def - A definition already parsed against the canonical schema.
 * @returns A live {@link EditorState} seeded from the definition.
 */
export function fromDefinition(def: EndpointDefinitionFormat): EditorState {
  const fields = def.fields.map(fromDefinitionField)
  return {
    version: def.version,
    tableName: def.tableName,
    catalog: def.catalog,
    schema: def.schema,
    dataSource: def.dataSource ?? "",
    fields,
    mutation: fromDefinitionMutation(def.mutation, fields),
  }
}
