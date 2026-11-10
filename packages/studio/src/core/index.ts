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
  EditorState,
  HistoryState,
} from "./model"
export {
  COMMIT_DEBOUNCE_MS,
  commitSnapshot,
  createCoalescingCommitter,
  createFieldId,
  createFreshHistory,
  createFreshState,
  currentState,
  DEFAULT_PARTITIONING,
  DEFAULT_PARTITIONING_FORMAT,
  HISTORY_CAP,
  replaceCurrent,
} from "./model"

export { fromDefinition, toDefinition } from "./mapping"

export type { EndpointDefinitionFormat } from "@lakeql/schema-generator/endpoint-schema"
export type {
  BadRegexDiagnostic,
  DuplicateDiagnostic,
  SchemaDiagnostic,
  ValidationResult,
} from "./validation"
export { evaluate, isValidForExport } from "./validation"

export type { FieldPath, TypeChangePlan } from "./field-ops"
export {
  addField,
  changeArrayItemType,
  changeFieldType,
  createField,
  planArrayItemTypeChange,
  planTypeChange,
  removeField,
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
