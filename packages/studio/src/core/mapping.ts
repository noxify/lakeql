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
import {
  createFieldId,
  DEFAULT_PARTITIONING,
  DEFAULT_PARTITIONING_FORMAT,
} from "./model"

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
  return !hasRequired && !hasReadOnly && !hasValidations
}

/**
 * Normalizes a field's options for export: drops `required`/`readOnly` when
 * `false` and an empty `validations` array, and returns `undefined` when
 * nothing meaningful remains.
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
 * When enabled, `partitioning` is omitted when it equals the effective default
 * (`true`), and `partitioningFormat` is omitted when partitioning is disabled,
 * a custom string, or equal to the effective default (`"year/month/day"`).
 */
function toDefinitionMutation(
  mutation: EditorMutation
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

  const { partitioning, partitioningFormat } = mutation

  // Omit `partitioning` when it equals the effective runtime default.
  if (partitioning !== DEFAULT_PARTITIONING) {
    config.partitioning = partitioning
  }

  // `partitioningFormat` is only meaningful in the non-custom modes:
  // `partitioning === true` (absent, treated as true) or a legacy single-field
  // string (no `/` or `:`). It is omitted when partitioning is off, a custom
  // format string, or equal to the effective default.
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
 * @param state - The live editor state.
 * @returns A candidate {@link EndpointDefinitionFormat} with minimal keys.
 */
export function toDefinition(state: EditorState): EndpointDefinitionFormat {
  const definition: EndpointDefinitionFormat = {
    version: state.version,
    tableName: state.tableName,
    catalog: state.catalog,
    schema: state.schema,
    fields: state.fields.map(toDefinitionField),
    mutation: toDefinitionMutation(state.mutation),
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
 * filling in the effective-default `partitioning`/`partitioningFormat` so the
 * UI controls always have a concrete value to display.
 */
function fromDefinitionMutation(
  mutation: EndpointDefinitionFormat["mutation"]
): EditorMutation {
  if (mutation === undefined || mutation === false) {
    return { enabled: false }
  }

  const partitioning = mutation.partitioning ?? DEFAULT_PARTITIONING
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
 * `toDefinition(fromDefinition(def))` is semantically equal to `def`.
 *
 * @param def - A definition already parsed against the canonical schema.
 * @returns A live {@link EditorState} seeded from the definition.
 */
export function fromDefinition(def: EndpointDefinitionFormat): EditorState {
  return {
    version: def.version,
    tableName: def.tableName,
    catalog: def.catalog,
    schema: def.schema,
    dataSource: def.dataSource ?? "",
    fields: def.fields.map(fromDefinitionField),
    mutation: fromDefinitionMutation(def.mutation),
  }
}
