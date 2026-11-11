import {
  BracesIcon,
  CircleAlertIcon,
  DownloadIcon,
  LayersIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  SettingsIcon,
  UploadIcon,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import type { EditorFieldType } from "@/core"
import { createField } from "@/core"

import { summarizeDiagnostics } from "./diagnostics"
import { fieldTypeOptions } from "./field-meta"
import type { ShellView } from "./shell-view"
import { useShellView } from "./shell-view"
import { useEditorContext } from "./use-editor"

/**
 * Returns whether a keyboard event targets a text-entry control, so the global
 * ⌘K shortcut does not open the palette while the user is typing a field name
 * or metadata value. Mirrors the guard the undo/redo shortcut uses, keeping the
 * two global listeners disjoint and both inert during text entry.
 */
function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  const tag = target.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable
}

/** The two palette pages: the root command list and the Add-field sub-view. */
type PalettePage = "root" | "add-field"

/** A rail-navigation command descriptor. */
interface NavCommand {
  view: ShellView
  label: string
  icon: typeof SettingsIcon
}

const NAV_COMMANDS: NavCommand[] = [
  { view: "settings", label: "Go to General Settings", icon: SettingsIcon },
  { view: "fields", label: "Go to Fields", icon: LayersIcon },
  { view: "validations", label: "Go to Validations", icon: CircleAlertIcon },
  { view: "json", label: "Go to JSON", icon: BracesIcon },
]

/**
 * The editor command palette: a ⌘K / Ctrl-K command menu over the shell's
 * actions.
 *
 * Mounted once at the shell root, it registers its own global keydown listener
 * (disjoint from the undo/redo shortcut, and ignored while focus is in a
 * text-entry element) and renders a modal {@link CommandDialog}. The commands
 * route to the same editor APIs the on-screen controls use:
 *
 * - navigation to each rail view via {@link useShellView};
 * - Import (through the editor's no-partial-apply importer) and Export (gated
 *   on `validForExport`, exactly like the import/export bar);
 * - Show open validations (navigates to the Validations view);
 * - Reset editor, behind a confirmation dialog, via the editor `reset` action;
 * - Add field → a nested sub-view listing the eight field types, each
 *   inserting a fresh field of that type at the root.
 *
 * The palette is keyboard-first: cmdk owns type-to-filter and arrow/Enter
 * navigation, and every item is labelled.
 */
export const CommandPalette = () => {
  const { setView } = useShellView()
  const editor = useEditorContext()
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState<PalettePage>("root")
  const [confirmingReset, setConfirmingReset] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { validForExport } = editor.validation
  const issueCount = summarizeDiagnostics(editor.validation).length

  // Global ⌘K / Ctrl-K toggle. Kept separate from the undo/redo listener (which
  // owns z/y) and ignored while typing, so the two never contend.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey)) {
        return
      }
      if (event.key.toLowerCase() !== "k") {
        return
      }
      if (isTextEntryTarget(event.target)) {
        return
      }
      event.preventDefault()
      setOpen((previous) => !previous)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  // Always reopen on the root page so a prior Add-field sub-view does not leak
  // into the next session.
  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next)
    if (!next) {
      setPage("root")
    }
  }, [])

  const run = useCallback((action: () => void) => {
    action()
    setOpen(false)
    setPage("root")
  }, [])

  const onPickFile = useCallback(
    async (file: File | undefined) => {
      if (fileInputRef.current !== null) {
        fileInputRef.current.value = ""
      }
      if (file === undefined) {
        return
      }
      await editor.importFile(file)
    },
    [editor]
  )

  return (
    <>
      {/* The visible affordance announcing the ⌘K palette. */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label="Open command palette"
        aria-keyshortcuts="Meta+K Control+K"
        onClick={() => setOpen(true)}
      >
        <SearchIcon />
        <span className="hidden sm:inline">Commands</span>
        <kbd className="bg-muted text-muted-foreground pointer-events-none hidden rounded border px-1 text-[0.625rem] font-medium sm:inline">
          ⌘K
        </kbd>
      </Button>

      {/* The palette owns its own hidden file input so "Import" works without
          reaching into the header's import/export bar. */}
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

      <CommandDialog open={open} onOpenChange={onOpenChange}>
        <CommandInput placeholder="Type a command or search…" />
        <CommandList>
          <CommandEmpty>No matching command.</CommandEmpty>

          {page === "root" && (
            <>
              <CommandGroup heading="Navigate">
                {NAV_COMMANDS.map((command) => {
                  const Icon = command.icon
                  return (
                    <CommandItem
                      key={command.view}
                      onSelect={() => run(() => setView(command.view))}
                    >
                      <Icon />
                      {command.label}
                    </CommandItem>
                  )
                })}
              </CommandGroup>

              <CommandSeparator />

              <CommandGroup heading="Actions">
                <CommandItem
                  onSelect={() => run(() => fileInputRef.current?.click())}
                >
                  <UploadIcon />
                  Import…
                </CommandItem>
                <CommandItem
                  disabled={!validForExport}
                  onSelect={() => run(() => editor.exportFile())}
                >
                  <DownloadIcon />
                  {validForExport
                    ? "Export"
                    : `Export (${issueCount} issue${
                        issueCount === 1 ? "" : "s"
                      } blocking)`}
                </CommandItem>
                <CommandItem onSelect={() => run(() => setView("validations"))}>
                  <CircleAlertIcon />
                  Show open validations
                </CommandItem>
                <CommandItem onSelect={() => setPage("add-field")}>
                  <PlusIcon />
                  Add field…
                </CommandItem>
                <CommandItem
                  className="text-destructive data-[selected=true]:text-destructive"
                  onSelect={() => {
                    setOpen(false)
                    setConfirmingReset(true)
                  }}
                >
                  <RotateCcwIcon />
                  Reset editor…
                </CommandItem>
              </CommandGroup>
            </>
          )}

          {page === "add-field" && (
            <CommandGroup heading="Add field">
              {fieldTypeOptions.map((fieldType: EditorFieldType) => (
                <CommandItem
                  key={fieldType}
                  onSelect={() =>
                    run(() => editor.addField([], createField(fieldType)))
                  }
                >
                  <PlusIcon />
                  Add {fieldType} field
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>

      <AlertDialog
        open={confirmingReset}
        onOpenChange={(next) => {
          if (!next) {
            setConfirmingReset(false)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset the editor?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears the current definition and starts from an empty
              endpoint. You can undo the reset from the Fields view.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmingReset(false)}>
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                editor.reset()
                setConfirmingReset(false)
              }}
            >
              Reset editor
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
