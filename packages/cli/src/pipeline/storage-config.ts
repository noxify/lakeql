import type { StorageConfigProps } from "@lakeql/file-generator/config"
import { effectiveWriteMethod } from "@lakeql/schema-generator/endpoint-schema"
import type {
  FieldDefinition,
  MutationConfig,
} from "@lakeql/schema-generator/endpoint-schema"

/**
 * Computes the `storageConfig` value emitted into `config.ts` for an enabled
 * mutation. This is the single source of truth: `config.ts` emits exactly
 * these keys and the generated mutation resolver references exactly these keys.
 *
 * - `insert`: no `basePath`, no `partitioning`, no `autoFillFields`.
 * - `storage`: `basePath`, `partitioning` (omitted for `full_load`) and one
 *   `autoFillFields` entry per declared auto-fill field.
 *
 * @param mutation - The enabled mutation configuration.
 * @param fields - The declared (top-level) field definitions.
 * @returns The storage config props for the generated `config.ts`.
 */
export function buildStorageConfig(
  mutation: MutationConfig,
  fields: FieldDefinition[]
): StorageConfigProps {
  const writeMethod = effectiveWriteMethod(mutation)
  if (writeMethod === "insert") {
    return { writeMethod, loadStrategy: mutation.loadStrategy }
  }

  return {
    writeMethod,
    loadStrategy: mutation.loadStrategy,
    basePath: mutation.basePath,
    partitioning:
      mutation.loadStrategy === "full_load" ? undefined : mutation.partitioning,
    // Thread an explicit directive for each declared autoFill field so the
    // runtime populates its column + companions from the write clock. Schema
    // validation guarantees autoFill fields only reach here with an enabled
    // append/full_load_append storage mutation.
    autoFillFields: fields
      .filter((field) => field.options?.autoFill !== undefined)
      .map((field) => ({
        name: field.name,
        kind: "write_timestamp" as const,
      })),
  }
}
