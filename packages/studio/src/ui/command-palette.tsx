import {
  ArrowLeftIcon,
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
import type { KeyboardEvent as ReactKeyboardEvent } from "react"
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

/** The stable cmdk `value` for an Add-field sub-view item. */
function addFieldValue(fieldType: EditorFieldType): string {
  return `add-field:${fieldType}`
}

/** The stable cmdk `value` of the first command on each page. */
const FIRST_VALUE: Record<PalettePage, string> = {
  root: "nav:settings",
  "add-field": addFieldValue(fieldTypeOptions[0] ?? "String"),
}

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
  // Controlled active item. cmdk scrolls the active item into view when this
  // changes, so pointing it at the first item of a page also resets the list's
  // scroll to the top — the fix for the sub-view not starting at the top.
  const [activeValue, setActiveValue] = useState<string>(FIRST_VALUE.root)
  // Controlled search query, cleared on every page switch so the destination
  // page shows its full, unfiltered list from the first item.
  const [search, setSearch] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { validForExport } = editor.validation
  const issueCount = summarizeDiagnostics(editor.validation).length

  // Switches the palette page, clearing the search and pointing the active item
  // at the destination page's first command.
  const goToPage = useCallback((next: PalettePage) => {
    setPage(next)
    setSearch("")
    setActiveValue(FIRST_VALUE[next])
  }, [])

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
  const onOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next)
      if (!next) {
        goToPage("root")
      }
    },
    [goToPage]
  )

  const run = useCallback(
    (action: () => void) => {
      action()
      setOpen(false)
      goToPage("root")
    },
    [goToPage]
  )

  // Escape in the Add-field sub-view returns to the root page instead of
  // closing the palette; Escape on the root page still closes it (handled by
  // the dialog). Captured before the dialog's own Escape handler runs.
  const onKeyDownCapture = useCallback(
    (event: ReactKeyboardEvent) => {
      if (event.key === "Escape" && page === "add-field") {
        event.preventDefault()
        event.stopPropagation()
        goToPage("root")
      }
    },
    [page, goToPage]
  )

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
      {/* The visible affordance announcing the ⌘K palette. Its accessible name
          is the visible "Commands" text (no overriding `aria-label`), so it
          satisfies WCAG 2.5.3 (label-content-name-mismatch); the decorative
          "⌘K" hint is `aria-hidden`, and the real shortcut stays exposed to
          assistive tech via `aria-keyshortcuts`. */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-keyshortcuts="Meta+K Control+K"
        onClick={() => setOpen(true)}
      >
        <SearchIcon />
        <span className="hidden sm:inline">Commands</span>
        <kbd
          aria-hidden="true"
          className="bg-muted text-muted-foreground pointer-events-none hidden rounded border px-1 text-[0.625rem] font-medium sm:inline"
        >
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

      <CommandDialog
        open={open}
        onOpenChange={onOpenChange}
        commandProps={{
          value: activeValue,
          onValueChange: setActiveValue,
          onKeyDownCapture,
        }}
      >
        <CommandInput
          placeholder="Type a command or search…"
          value={search}
          onValueChange={setSearch}
        />
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
                      value={`nav:${command.view}`}
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
                  value="action:import"
                  onSelect={() => run(() => fileInputRef.current?.click())}
                >
                  <UploadIcon />
                  Import…
                </CommandItem>
                <CommandItem
                  value="action:export"
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
                <CommandItem
                  value="action:show-validations"
                  onSelect={() => run(() => setView("validations"))}
                >
                  <CircleAlertIcon />
                  Show open validations
                </CommandItem>
                <CommandItem
                  value="action:add-field"
                  onSelect={() => goToPage("add-field")}
                >
                  <PlusIcon />
                  Add field…
                </CommandItem>
                <CommandItem
                  value="action:reset"
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
                  value={addFieldValue(fieldType)}
                  onSelect={() =>
                    run(() => editor.addField([], createField(fieldType)))
                  }
                >
                  <PlusIcon />
                  Add {fieldType} field
                </CommandItem>
              ))}
              <CommandSeparator />
              <CommandItem
                value="add-field:back"
                onSelect={() => goToPage("root")}
              >
                <ArrowLeftIcon />
                Back
              </CommandItem>
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
