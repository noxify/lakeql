import type { EndpointDefinitionFormat } from "@lakeql/schema-generator/endpoint-schema"
import {
  endpointDefinitionSchema,
  ENDPOINT_SCHEMA_VERSION,
  flattenEndpointIssues,
  isSupportedVersion,
} from "@lakeql/schema-generator/endpoint-schema"

import { fromDefinition, toDefinition } from "./mapping"
import type { EditorState } from "./model"
import { evaluate } from "./validation"

/**
 * Outcome of an import attempt.
 *
 * On success, `state` is a fully materialized editor state ready to replace the
 * current one. On failure, no state is produced and `errors` explains why — the
 * caller must leave its current state untouched (no partial apply).
 */
export type ImportResult =
  | { ok: true; state: EditorState }
  | { ok: false; errors: string[] }

/**
 * Parses raw `endpoint.json` text into an editor state without touching any
 * existing state.
 *
 * The pipeline is: `JSON.parse` → a `version` pre-check → parse against
 * `endpointDefinitionSchema` → {@link fromDefinition}. A failure at any stage
 * returns `{ ok: false }` with messages and produces no state, so a caller that
 * applies the result only on `ok` can never partially apply a bad file.
 *
 * The `version` pre-check (C9/FR5.2) surfaces the actionable "v1 no longer
 * supported" message for an unsupported version BEFORE the generic Zod literal
 * error — a v1 draft (`version: "1.0"`, and `partitioning: true`) fails loudly
 * with a clear message rather than an opaque union error (R3).
 *
 * @param text - The file contents to import.
 * @returns An {@link ImportResult}: a materialized state, or errors.
 */
export function importFromText(text: string): ImportResult {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (error) {
    return {
      ok: false,
      errors: [
        `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      ],
    }
  }

  // Version pre-check (C9/FR5.2): a wrong `version` gets the actionable message
  // before the generic Zod literal error. An object carrying any `version` key
  // that is not the supported one is rejected here; a definition missing the
  // key entirely falls through to the schema's own "required" issue.
  if (
    typeof json === "object" &&
    json !== null &&
    "version" in json &&
    !isSupportedVersion((json as { version: unknown }).version)
  ) {
    return {
      ok: false,
      errors: [
        `Unsupported endpoint definition version. This editor only supports version "${ENDPOINT_SCHEMA_VERSION}"; v1 definitions are no longer supported and have no automatic migration.`,
      ],
    }
  }

  const parsed = endpointDefinitionSchema.safeParse(json)
  if (!parsed.success) {
    return {
      ok: false,
      errors: flattenEndpointIssues(parsed.error).map((issue) => {
        const path = issue.path.map(String).join(".")
        return path === "" ? issue.message : `${path}: ${issue.message}`
      }),
    }
  }

  return { ok: true, state: fromDefinition(parsed.data) }
}

/**
 * Reads a browser `File` and imports it via {@link importFromText}.
 *
 * @param file - The `File` selected through a user-initiated file picker.
 * @returns A promise resolving to the {@link ImportResult}.
 */
export async function importFromFile(file: File): Promise<ImportResult> {
  let text: string
  try {
    text = await file.text()
  } catch (error) {
    return {
      ok: false,
      errors: [
        `Could not read file: ${error instanceof Error ? error.message : String(error)}`,
      ],
    }
  }
  return importFromText(text)
}

/**
 * Outcome of an export attempt.
 *
 * On success, `definition` is the minimal, schema-valid value written to the
 * download, and `json` is its serialized form. On failure (the validity gate
 * blocked it), `errors` summarizes why export was refused.
 */
export type ExportResult =
  | { ok: true; definition: EndpointDefinitionFormat; json: string }
  | { ok: false; errors: string[] }

/**
 * Serializes the current state to the `endpoint.json` text, gated on validity.
 *
 * Export is blocked entirely unless the state is valid for export (schema-valid,
 * no duplicate field names, all regex patterns constructible), so an artifact
 * the CLI would reject is never produced. This function performs no download; it
 * is the pure core the browser download helper builds on, and is directly
 * testable.
 *
 * @param state - The live editor state.
 * @returns An {@link ExportResult}: the definition and JSON, or gate errors.
 */
export function exportToJson(state: EditorState): ExportResult {
  const result = evaluate(state)
  if (!result.validForExport) {
    const errors: string[] = [
      ...result.schemaIssues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`
      ),
      ...result.duplicates.map(
        (duplicate) =>
          `Duplicate field name "${duplicate.name}"${
            duplicate.path.length > 0 ? ` at ${duplicate.path.join(".")}` : ""
          }`
      ),
      ...result.badRegex.map(
        (bad) => `Invalid regex pattern "${bad.pattern}": ${bad.message}`
      ),
      ...result.badNumber.map(
        (bad) => `${bad.kind} bound must be a finite number`
      ),
      ...result.reservedNames.map(
        (collision) =>
          `Name "${collision.name}" collides with an auto-fill reserved column`
      ),
      ...result.autoFillPlacement.map((bad) =>
        bad.reason === "non-datetime"
          ? `Auto-fill field "${bad.name}" must be a DateTime field`
          : `Auto-fill field "${bad.name}" must be top-level, not nested`
      ),
      ...result.autoFillMutation.map((bad) =>
        bad.reason === "insert"
          ? `Auto-fill field "${bad.name}" requires the storage write method`
          : `Auto-fill field "${bad.name}" requires an append/full-load-append mutation`
      ),
      ...result.companionPartition.map(
        (bad) =>
          `Partition segment "${bad.segment}" references derived column "${bad.companionName}"; use "${bad.primaryName}:year"`
      ),
      ...result.unresolvedPartition.map((bad) =>
        bad.reason === "missing"
          ? `Partition field "${bad.name}" does not exist`
          : `Partition field "${bad.name}" matches more than one field`
      ),
    ]
    return { ok: false, errors }
  }

  const definition = toDefinition(state)
  return {
    ok: true,
    definition,
    json: `${JSON.stringify(definition, null, 2)}\n`,
  }
}

/**
 * The browser surface the download helper needs, narrowed so it can be mocked
 * in tests without a DOM.
 */
export interface DownloadEnvironment {
  /** Creates an object URL for a blob. */
  createObjectURL: (blob: Blob) => string
  /** Revokes a previously created object URL. */
  revokeObjectURL: (url: string) => void
  /** Triggers the user-facing download of `url` under `filename`. */
  triggerDownload: (url: string, filename: string) => void
}

/**
 * Resolves the default browser download environment, wiring `URL` object-URL
 * APIs and a temporary anchor click.
 *
 * @throws {TypeError} When called outside a browser (no `document`/`URL`).
 */
function browserDownloadEnvironment(): DownloadEnvironment {
  if (
    typeof document === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    throw new TypeError("Browser download is unavailable in this environment")
  }
  return {
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => {
      URL.revokeObjectURL(url)
    },
    triggerDownload: (url, filename) => {
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = filename
      anchor.rel = "noopener"
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
    },
  }
}

/**
 * Exports the current state as a user-initiated `endpoint.json` download.
 *
 * Gates on validity via {@link exportToJson}; when blocked, it performs no
 * download and returns the gate errors. When valid, it builds a Blob and
 * triggers the browser download, then revokes the object URL.
 *
 * @param state - The live editor state.
 * @param env - Download environment; defaults to the real browser APIs. Pass a
 *   mock to test the download path without a DOM.
 * @param filename - The download filename. Defaults to `endpoint.json`.
 * @returns The {@link ExportResult}; on success the download was triggered.
 */
export function downloadEndpointJson(
  state: EditorState,
  env: DownloadEnvironment = browserDownloadEnvironment(),
  filename = "endpoint.json"
): ExportResult {
  const result = exportToJson(state)
  if (!result.ok) {
    return result
  }

  const blob = new Blob([result.json], { type: "application/json" })
  const url = env.createObjectURL(blob)
  try {
    env.triggerDownload(url, filename)
  } finally {
    env.revokeObjectURL(url)
  }
  return result
}
