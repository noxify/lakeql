import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  DownloadIcon,
  UploadIcon,
} from "lucide-react"
import { useEffect, useRef } from "react"

import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"

import { summarizeDiagnostics } from "./diagnostics"
import { useEditorContext } from "./use-editor"

/**
 * The top bar: an import picker, an export button gated on `validForExport`,
 * and a compact validity span (the single header issue count — "N issue(s)
 * blocking export" / "Valid for export").
 *
 * Import routes through the editor's no-partial-apply importer; a parse failure
 * is surfaced as an error toast and leaves the current state untouched. Export
 * is disabled whenever the gate is not satisfied, so an artifact the CLI would
 * reject is never produced. The detailed diagnostics live in the Validations
 * view and the per-field badges, not here — this bar only summarizes the count.
 *
 * Transient failures (a degraded autosave, a rejected import) are reported
 * through the toast surface rather than inline banners, so the bar's layout
 * stays stable while the editor keeps working.
 */
export const ImportExportBar = () => {
  const editor = useEditorContext()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const diagnostics = summarizeDiagnostics(editor.validation)
  const valid = editor.validation.validForExport

  // `persistenceDegraded` latches true once storage is lost and never flips
  // back, so a single toast on the transition is enough — the effect guard
  // keeps it from re-firing on unrelated re-renders.
  useEffect(() => {
    if (editor.persistenceDegraded) {
      toast.add({
        type: "warning",
        title: "Autosave unavailable",
        description:
          "Local storage could not be used; your draft is kept only for this session.",
      })
    }
  }, [editor.persistenceDegraded])

  const onPickFile = async (file: File | undefined) => {
    if (file === undefined) {
      return
    }
    const result = await editor.importFile(file)
    if (result.ok) {
      // Import replaces the whole editor state, so confirm it explicitly; the
      // success toast keeps the default auto-dismiss.
      toast.add({
        type: "success",
        title: "Import successful",
        description: `Loaded the definition from ${file.name}.`,
      })
    } else {
      toast.add({
        type: "error",
        // Errors stay until the user dismisses them (`timeout: 0`); success and
        // warning toasts keep the default auto-dismiss.
        timeout: 0,
        title: "Import failed",
        description: result.errors.join("\n"),
      })
    }
    // Allow re-importing the same file name.
    if (fileInputRef.current !== null) {
      fileInputRef.current.value = ""
    }
  }

  return (
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
              {`${diagnostics.length} issue${
                diagnostics.length === 1 ? "" : "s"
              } blocking export`}
            </span>
          </>
        )}
      </span>
    </div>
  )
}
