import { fieldNamePattern, primitiveTypes } from "@/pipeline/schema"
import type {
  ArrayItemDefinition,
  FieldDefinition,
  PrimitiveType,
} from "@/pipeline/schema"

/**
 * Maximum nesting depth for Object/Array fields.
 */
export const MAX_NESTING_DEPTH = 5

/**
 * All available field types for selection.
 */
export const allFieldTypes = [...primitiveTypes, "Object", "Array"] as const
export type FieldType = (typeof allFieldTypes)[number]

/**
 * Types available for Array element selection (no nested Array).
 */
export const arrayElementTypes = [...primitiveTypes, "Object"] as const
export type ArrayElementType = (typeof arrayElementTypes)[number]

/**
 * The current input mode/step within the field builder state machine.
 */
export type InputMode =
  | "name" // Prompting for field name
  | "type" // Prompting for field type selection
  | "array-item-type" // Prompting for array element type
  | "done-or-add" // Prompting to add another field or finish

/**
 * A nesting stack entry representing a level in the field hierarchy.
 */
export interface NestingLevel {
  /** The name of the parent field that created this nesting level */
  parentFieldName: string
  /** Whether this is an array item context (Object inside an Array) */
  isArrayItem: boolean
  /** Fields defined at the parent level (before entering this nesting) */
  parentFields: FieldDefinition[]
}

/**
 * Validation result for field names.
 */
export interface FieldNameValidation {
  valid: boolean
  error?: string
}

/**
 * Internal state for the field builder state machine.
 */
export interface FieldBuilderState {
  /** Current input mode */
  mode: InputMode
  /** Fields defined at the current nesting level */
  currentFields: FieldDefinition[]
  /** Stack of nesting levels (for Object/Array nesting) */
  nestingStack: NestingLevel[]
  /** Current field name being defined (held between name → type steps) */
  currentFieldName: string
  /** Validation error to display */
  error: string | null
}

/**
 * Validates a field name against the required pattern and checks for duplicates.
 */
export function validateFieldName(
  name: string,
  existingFields: FieldDefinition[]
): FieldNameValidation {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: "Field name cannot be empty" }
  }

  if (!fieldNamePattern.test(name)) {
    if (/^\d/u.test(name)) {
      return {
        valid: false,
        error:
          "Field name must not start with a digit. Use letters or underscore as first character.",
      }
    }
    if (name.length > 64) {
      return {
        valid: false,
        error: "Field name must be at most 64 characters long",
      }
    }
    return {
      valid: false,
      error:
        "Field name must contain only alphanumeric characters and underscores (a-z, A-Z, 0-9, _)",
    }
  }

  const isDuplicate = existingFields.some((f) => f.name === name)
  if (isDuplicate) {
    return {
      valid: false,
      error: `Field name "${name}" already exists at this level. Please choose a different name.`,
    }
  }

  return { valid: true }
}

/**
 * Computes the breadcrumb trail from the nesting stack.
 * Returns a string like "root > address > street"
 */
export function computeBreadcrumb(nestingStack: NestingLevel[]): string {
  const parts = ["root", ...nestingStack.map((level) => level.parentFieldName)]
  return parts.join(" > ")
}

/**
 * Returns the list of available field types based on the current nesting depth.
 * At max depth, Object and Array types are excluded.
 */
export function getAvailableFieldTypes(currentDepth: number): FieldType[] {
  if (currentDepth >= MAX_NESTING_DEPTH) {
    return [...primitiveTypes]
  }
  return [...allFieldTypes]
}

/**
 * Returns available array element types based on the current nesting depth.
 * At max depth - 1, Object is excluded since it would exceed max depth.
 */
export function getAvailableArrayElementTypes(
  currentDepth: number
): ArrayElementType[] {
  // Object inside Array adds one more nesting level
  if (currentDepth + 1 >= MAX_NESTING_DEPTH) {
    return [...primitiveTypes]
  }
  return [...arrayElementTypes]
}

/**
 * Creates the initial state for the field builder.
 */
export function createInitialState(
  initialFields?: FieldDefinition[]
): FieldBuilderState {
  return {
    mode: "name",
    currentFields: initialFields ?? [],
    nestingStack: [],
    currentFieldName: "",
    error: null,
  }
}

/**
 * Whether the "Done" option should be available given the current state.
 * - At root level: always available (can finish with 0 fields)
 * - Inside Object nesting: only when ≥1 child field exists
 */
export function canFinish(state: FieldBuilderState): boolean {
  if (state.nestingStack.length === 0) {
    return true
  }
  return state.currentFields.length >= 1
}

/**
 * Processes a field name submission. Returns the new state.
 */
export function processFieldName(
  state: FieldBuilderState,
  name: string
): FieldBuilderState {
  const validation = validateFieldName(name, state.currentFields)
  if (!validation.valid) {
    return { ...state, error: validation.error ?? null }
  }
  return {
    ...state,
    currentFieldName: name,
    mode: "type",
    error: null,
  }
}

/**
 * Processes a field type selection. Returns the new state.
 */
export function processFieldType(
  state: FieldBuilderState,
  type: FieldType
): FieldBuilderState {
  const fieldName = state.currentFieldName

  if (primitiveTypes.includes(type as PrimitiveType)) {
    const newField: FieldDefinition = {
      name: fieldName,
      type: type as PrimitiveType,
    }
    return {
      ...state,
      currentFields: [...state.currentFields, newField],
      currentFieldName: "",
      mode: "done-or-add",
      error: null,
    }
  } else if (type === "Object") {
    return {
      ...state,
      nestingStack: [
        ...state.nestingStack,
        {
          parentFieldName: fieldName,
          isArrayItem: false,
          parentFields: state.currentFields,
        },
      ],
      currentFields: [],
      currentFieldName: "",
      mode: "name",
      error: null,
    }
  } else if (type === "Array") {
    return {
      ...state,
      mode: "array-item-type",
      error: null,
    }
  }

  return state
}

/**
 * Processes an array element type selection. Returns the new state.
 */
export function processArrayElementType(
  state: FieldBuilderState,
  elementType: ArrayElementType
): FieldBuilderState {
  const fieldName = state.currentFieldName

  if (primitiveTypes.includes(elementType as PrimitiveType)) {
    const newField: FieldDefinition = {
      name: fieldName,
      type: "Array",
      items: { type: elementType as PrimitiveType },
    }
    return {
      ...state,
      currentFields: [...state.currentFields, newField],
      currentFieldName: "",
      mode: "done-or-add",
      error: null,
    }
  } else if (elementType === "Object") {
    return {
      ...state,
      nestingStack: [
        ...state.nestingStack,
        {
          parentFieldName: fieldName,
          isArrayItem: true,
          parentFields: state.currentFields,
        },
      ],
      currentFields: [],
      currentFieldName: "",
      mode: "name",
      error: null,
    }
  }

  return state
}

/**
 * Process "add another field" action. Returns the new state.
 */
export function processAddAnother(state: FieldBuilderState): FieldBuilderState {
  return {
    ...state,
    mode: "name",
    error: null,
  }
}

/**
 * Process "finish current level" action.
 * Returns an object with the new state and optionally the completed root fields.
 */
export function processFinishLevel(state: FieldBuilderState): {
  state: FieldBuilderState
  completedFields: FieldDefinition[] | null
} {
  if (!canFinish(state)) {
    return {
      state: {
        ...state,
        error: "Object fields must have at least 1 child field",
      },
      completedFields: null,
    }
  }

  if (state.nestingStack.length === 0) {
    // At root level: return the completed field definitions
    return { state, completedFields: state.currentFields }
  }

  // Pop the nesting stack
  const stack = [...state.nestingStack]
  const lastLevel = stack.pop()
  if (!lastLevel) {
    return { state, completedFields: state.currentFields }
  }
  const completedFields = state.currentFields

  if (lastLevel.isArrayItem) {
    // Completing an Array<Object>'s item definition
    const arrayField: FieldDefinition = {
      name: lastLevel.parentFieldName,
      type: "Array",
      items: {
        type: "Object",
        fields: completedFields,
      } as ArrayItemDefinition,
    }
    return {
      state: {
        mode: "done-or-add",
        currentFields: [...lastLevel.parentFields, arrayField],
        nestingStack: stack,
        currentFieldName: "",
        error: null,
      },
      completedFields: null,
    }
  }
  // Completing an Object field's children
  const objectField: FieldDefinition = {
    name: lastLevel.parentFieldName,
    type: "Object",
    fields: completedFields,
  }
  return {
    state: {
      mode: "done-or-add",
      currentFields: [...lastLevel.parentFields, objectField],
      nestingStack: stack,
      currentFieldName: "",
      error: null,
    },
    completedFields: null,
  }
}

/**
 * Formats a field's type for display.
 */
export function formatFieldType(field: FieldDefinition): string {
  if (field.type === "Object") {
    const childCount = field.fields?.length ?? 0
    return `Object (${childCount} field${childCount === 1 ? "" : "s"})`
  }
  if (field.type === "Array") {
    return `Array<${field.items?.type ?? "Unknown"}>`
  }
  return field.type
}
