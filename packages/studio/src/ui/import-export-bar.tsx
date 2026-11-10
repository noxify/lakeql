import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  DownloadIcon,
  UploadIcon,
} from "lucide-react"
import { useRef, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

import { summarizeDiagnostics } from "./diagnostics"
import { useEditorContext } from "./use-editor"

/**
 * The top bar: an import picker, an export button gated on `validForExport`,
 * and a validity summary surfacing the core diagnostics.
 *
 * Import routes through the editor's no-partial-apply importer; a parse failure
 * is reported inline and leaves the current state untouched. Export is disabled
 * whenever the gate is not satisfied, so an artifact the CLI would reject is
 * never produced.
 */
export const ImportExportBar = () => {
  const editor = useEditorContext()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importErrors, setImportErrors] = useState<string[]>([])

  const diagnostics = summarizeDiagnostics(editor.validation)
  const valid = editor.validation.validForExport

  const onPickFile = async (file: File | undefined) => {
    if (file === undefined) {
      return
    }
    const result = await editor.importFile(file)
    setImportErrors(result.ok ? [] : result.errors)
    // Allow re-importing the same file name.
    if (fileInputRef.current !== null) {
      fileInputRef.current.value = ""
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(event) => {
            void onPickFile(event.target.files?.[0])
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
        >
          <UploadIcon />
          Import
        </Button>
        <Button
          type="button"
          disabled={!valid}
          aria-disabled={!valid}
          onClick={() => editor.exportFile()}
        >
          <DownloadIcon />
          Export
        </Button>

        <span className="ml-auto inline-flex items-center gap-1.5 text-sm">
          {valid ? (
            <>
              <CheckCircle2Icon className="text-primary size-4" />
              <span className="text-muted-foreground">Valid for export</span>
            </>
          ) : (
            <>
              <AlertTriangleIcon className="text-destructive size-4" />
              <span className="text-destructive">
                {diagnostics.length} issue
                {diagnostics.length === 1 ? "" : "s"} blocking export
              </span>
            </>
          )}
        </span>
      </div>

      {editor.persistenceDegraded && (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>Autosave unavailable</AlertTitle>
          <AlertDescription>
            Local storage could not be used; your draft is kept only for this
            session.
          </AlertDescription>
        </Alert>
      )}

      {importErrors.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>Import failed</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {importErrors.map((message, index) => (
                <li key={index}>{message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {!valid && diagnostics.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>Validation</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {diagnostics.map((message, index) => (
                <li key={index}>{message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
