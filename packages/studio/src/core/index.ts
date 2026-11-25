// Framework-agnostic core of the Endpoint Builder: state model, schema
// binding, validation gate, mapping, field operations, IO, and persistence.
//
// Nothing here imports React. The validity gate binds the canonical schema
// exclusively through the published subpath `@lakeql/schema-generator/
// endpoint-schema`; the Node-side generator subpaths are never pulled in.
//
// Exports are listed explicitly (rather than `export *`) so tree-shaking and
// per-module loading stay predictable.

export type {
  CoalescingCommitter,
  CommitScheduler,
  EditorArrayItem,
  EditorArrayItemType,
  EditorField,
  EditorFieldType,
  EditorMutation,
  EditorPartitionSegment,
  EditorResolvedPartitionSegment,
  EditorState,
  EditorUnresolvedPartitionSegment,
  HistoryState,
} from "./model"
export {
  canRedo,
  canUndo,
  COMMIT_DEBOUNCE_MS,
  commitSnapshot,
  createCoalescingCommitter,
  createFieldId,
  createFreshHistory,
  createFreshState,
  currentState,
  HISTORY_CAP,
  redo,
  replaceCurrent,
  undo,
} from "./model"

export { fromDefinition, toDefinition } from "./mapping"
export {
  collectFieldIds,
  isResolvedPartitionSegment,
  isValidPartitionSource,
  migrateEditorState,
  partitionSegmentLabel,
  partitionSegmentsReferencing,
  removePartitionSegments,
  resolvePartitionString,
  serializePartitionSegments,
} from "./partitioning"

export type { EditorAdapterId, EditorAdapterProfile } from "./adapters"
export {
  adapterProfile,
  DEFAULT_EDITOR_ADAPTER,
  EDITOR_ADAPTERS,
} from "./adapters"

export type { WriteMethodChangePlan } from "./write-method"
export { changeWriteMethod, planWriteMethodChange } from "./write-method"

export type { EndpointDefinitionFormat } from "@lakeql/schema-generator/endpoint-schema"
export type {
  AutoFillMutationDiagnostic,
  AutoFillPlacementDiagnostic,
  BadNumberDiagnostic,
  BadRegexDiagnostic,
  CompanionPartitionDiagnostic,
  DuplicateDiagnostic,
  ReservedNameDiagnostic,
  UnresolvedPartitionDiagnostic,
  SchemaDiagnostic,
  ValidationResult,
} from "./validation"
export { evaluate, isValidForExport } from "./validation"

export type {
  FieldPath,
  FieldRemovalPlan,
  MovePlan,
  MoveSlot,
  MoveTarget,
  TypeChangePlan,
} from "./field-ops"
export {
  addField,
  changeArrayItemType,
  changeFieldType,
  createField,
  enumerateMoveSlots,
  fieldAt,
  fieldNamePath,
  findContainerPath,
  findFieldPath,
  moveField,
  planArrayItemTypeChange,
  planFieldRemoval,
  planMove,
  planTypeChange,
  removeField,
  renameField,
  setFieldOptions,
} from "./field-ops"

export type { DownloadEnvironment, ExportResult, ImportResult } from "./io"
export {
  downloadEndpointJson,
  exportToJson,
  importFromFile,
  importFromText,
} from "./io"

export type {
  DraftRecord,
  FlushEventTarget,
  Persistence,
  PersistenceOptions,
  PersistenceScheduler,
  StorageLike,
} from "./persistence"
export {
  ACTIVE_DRAFT_ID,
  AUTOSAVE_DEBOUNCE_MS,
  createPersistence,
  STORAGE_KEY,
} from "./persistence"
