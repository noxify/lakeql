import type { EndpointDefinitionFormat } from "@lakeql/schema-generator/endpoint-schema"
import { endpointDefinitionSchema } from "@lakeql/schema-generator/endpoint-schema"

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
 * The pipeline is: `JSON.parse` → parse against `endpointDefinitionSchema` →
 * {@link fromDefinition}. A failure at any stage returns `{ ok: false }` with
 * messages and produces no state, so a caller that applies the result only on
 * `ok` can never partially apply a bad file.
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

  const parsed = endpointDefinitionSchema.safeParse(json)
  if (!parsed.success) {
    const issues = parsed.error.issues as {
      path: PropertyKey[]
      message: string
    }[]
    return {
      ok: false,
      errors: issues.map((issue) => {
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
