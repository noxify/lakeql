"use client"

import { useLiveQuery } from "@tanstack/react-db"
import {
  AlertCircle,
  AlertTriangle,
  Code,
  Copy,
  Download,
  Plus,
  RotateCcw,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import {
  CURRENT_DRAFT_ID,
  endpointDraftsCollection,
} from "@/lib/endpoint-store"
import type {
  EndpointDefinition,
  FieldDefinition,
  MutationConfig,
} from "@/lib/endpoint-types"
import {
  generateId,
  buildOutputJSON,
  getDuplicateNames,
} from "@/lib/endpoint-utils"

import { FieldList } from "./field-list"
import { ImportZone } from "./import-zone"
import { JSONPreview } from "./json-preview"
import { MetadataForm } from "./metadata-form"
import { MutationForm } from "./mutation-form"

const DEFAULT_STATE: EndpointDefinition = {
  version: "1.0",
  tableName: "",
  catalog: "",
  schema: "",
  fields: [],
}

function collectWarnings(
  fields: FieldDefinition[],
  warnings: string[],
  path: string[]
) {
  for (const field of fields) {
    const fieldPath = [...path, field.name || "(unnamed)"].join(".")

    if (!field.name.trim()) {
      warnings.push(
        `Empty field name${path.length > 0 ? ` in ${path.join(".")}` : ""} — will be excluded from output`
      )
    }

    if (field.type === "Object") {
      const namedChildren = (field.fields ?? []).filter((f) => f.name.trim())
      if (namedChildren.length === 0 && field.name.trim()) {
        warnings.push(
          `"${fieldPath}" has no children — will be excluded from output`
        )
      }
      collectWarnings(field.fields ?? [], warnings, [
        ...path,
        field.name || "(unnamed)",
      ])
    }

    if (field.type === "Array" && field.arrayItemType === "Object") {
      const namedChildren = (field.arrayItemFields ?? []).filter((f) =>
        f.name.trim()
      )
      if (namedChildren.length === 0 && field.name.trim()) {
        warnings.push(
          `"${fieldPath}" array items have no children — will be excluded from output`
        )
      }
      collectWarnings(field.arrayItemFields ?? [], warnings, [
        ...path,
        field.name || "(unnamed)",
        "items",
      ])
    }
  }
}

export function EndpointBuilder() {
  // Load persisted draft from TanStack DB / localStorage
  const { data: persistedDrafts } = useLiveQuery((q) =>
    q.from({ draft: endpointDraftsCollection })
  )
  const persistedDraft = persistedDrafts?.[0]

  const [def, setDef] = useState<EndpointDefinition>(DEFAULT_STATE)
  const [importError, setImportError] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const initialized = useRef(false)

  // Restore from persisted draft on first load
  useEffect(() => {
    if (!initialized.current && persistedDraft) {
      setDef({
        version: persistedDraft.version,
        tableName: persistedDraft.tableName,
        catalog: persistedDraft.catalog,
        schema: persistedDraft.schema,
        fields: persistedDraft.fields,
        mutation: persistedDraft.mutation,
      })
      initialized.current = true
    } else if (!initialized.current && persistedDrafts !== undefined) {
      initialized.current = true
    }
  }, [persistedDraft, persistedDrafts])

  // Persist state changes to TanStack DB (debounced)
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "synced">(
    "idle"
  )
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedResetTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasInserted = useRef(!!persistedDraft)

  const hasContent =
    def.tableName.trim() !== "" ||
    def.catalog.trim() !== "" ||
    def.schema.trim() !== "" ||
    def.fields.length > 0 ||
    (def.mutation !== undefined && def.mutation !== false)

  // Keep track of whether a draft exists (without causing re-renders)
  useEffect(() => {
    hasInserted.current = !!persistedDraft
  }, [persistedDraft])

  useEffect(() => {
    if (!initialized.current) {
      return
    }
    if (!hasContent) {
      // oxlint-disable-next-line react/react-compiler
      setSyncStatus("idle")
      return
    }

    setSyncStatus("syncing")
    if (saveTimeout.current) {
      clearTimeout(saveTimeout.current)
    }
    if (savedResetTimeout.current) {
      clearTimeout(savedResetTimeout.current)
    }

    saveTimeout.current = setTimeout(() => {
      const draftData = { id: CURRENT_DRAFT_ID, ...def }
      if (hasInserted.current) {
        endpointDraftsCollection.update(CURRENT_DRAFT_ID, (draft) => {
          draft.version = def.version
          draft.tableName = def.tableName
          draft.catalog = def.catalog
          draft.schema = def.schema
          draft.fields = def.fields
          draft.mutation = def.mutation
        })
      } else {
        endpointDraftsCollection.insert(draftData)
        hasInserted.current = true
      }
      setSyncStatus("synced")
      savedResetTimeout.current = setTimeout(() => setSyncStatus("idle"), 2000)
    }, 500)

    return () => {
      if (saveTimeout.current) {
        clearTimeout(saveTimeout.current)
      }
      if (savedResetTimeout.current) {
        clearTimeout(savedResetTimeout.current)
      }
    }
  }, [def, hasContent])

  const output = useMemo(() => buildOutputJSON(def), [def])
  const rootDupes = useMemo(() => getDuplicateNames(def.fields), [def.fields])
  const jsonString = useMemo(() => JSON.stringify(output, null, 2), [output])

  const warnings = useMemo(() => {
    const items: string[] = []
    collectWarnings(def.fields, items, [])
    return items
  }, [def.fields])

  function handleMetaChange(
    key: "tableName" | "catalog" | "schema",
    value: string
  ) {
    setDef((prev) => ({ ...prev, [key]: value }))
  }

  function handleMutationChange(mutation: false | MutationConfig | undefined) {
    setDef((prev) => ({ ...prev, mutation }))
  }

  function addField() {
    const newField: FieldDefinition = {
      id: generateId(),
      name: "",
      type: "String",
    }
    setDef((prev) => ({ ...prev, fields: [...prev.fields, newField] }))
  }

  function updateField(index: number, updated: FieldDefinition) {
    setDef((prev) => {
      const fields = [...prev.fields]
      fields[index] = updated
      return { ...prev, fields }
    })
  }

  function deleteField(index: number) {
    setDef((prev) => {
      const fields = [...prev.fields]
      fields.splice(index, 1)
      return { ...prev, fields }
    })
  }

  function reorderFields(fields: FieldDefinition[]) {
    setDef((prev) => ({ ...prev, fields }))
  }

  function handleImport(imported: EndpointDefinition) {
    setDef(imported)
    setImportError(null)
  }

  function handleReset() {
    setDef(DEFAULT_STATE)
    setImportError(null)
    // Clear persisted draft
    if (hasInserted.current) {
      endpointDraftsCollection.delete(CURRENT_DRAFT_ID)
      hasInserted.current = false
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(jsonString)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleDownload() {
    const blob = new Blob([jsonString], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${output.tableName || "endpoint"}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="bg-background flex flex-col overflow-hidden rounded-lg border">
      {/* Top bar */}
      <header className="border-border bg-card flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-2 text-xs">
          {syncStatus === "syncing" && (
            <span className="text-muted-foreground flex items-center gap-1.5">
              <span className="size-1.5 animate-pulse rounded-full bg-amber-500" />
              Syncing...
            </span>
          )}
          {syncStatus === "synced" && (
            <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
              <span className="size-1.5 rounded-full bg-green-500" />
              Draft synced
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {warnings.length > 0 && (
            <Popover>
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    className="mr-2 flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs text-amber-600 transition-colors hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
                  />
                }
              >
                <AlertTriangle className="size-3.5" />
                {warnings.length}{" "}
                {warnings.length === 1 ? "warning" : "warnings"}
              </PopoverTrigger>
              <PopoverContent side="bottom" sideOffset={4} className="w-80">
                <ul className="flex flex-col gap-1.5">
                  {warnings.map((warning, i) => (
                    <li
                      key={i}
                      className="text-muted-foreground flex items-start gap-2 text-xs"
                    >
                      <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-500" />
                      <span>{warning}</span>
                    </li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="gap-1.5 text-xs"
          >
            {copied ? (
              <span className="text-green-600 dark:text-green-400">
                Copied!
              </span>
            ) : (
              <>
                <Copy className="size-3" data-icon="inline-start" />
                Copy
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownload}
            className="gap-1.5 text-xs"
          >
            <Download className="size-3" data-icon="inline-start" />
            Download
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="gap-1.5 text-xs"
          >
            <RotateCcw className="size-3" data-icon="inline-start" />
            Reset
          </Button>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — form */}
        <div className="flex flex-1 flex-col overflow-y-auto">
          <div className="flex flex-col gap-6 p-6">
            {/* Import */}
            <section>
              <h2 className="text-foreground mb-3 text-sm font-semibold">
                Import
              </h2>
              <ImportZone onImport={handleImport} onError={setImportError} />
              {importError && (
                <Alert variant="destructive" className="mt-2">
                  <AlertCircle className="size-4" />
                  <AlertDescription className="text-xs">
                    {importError}
                  </AlertDescription>
                </Alert>
              )}
            </section>

            <Separator />

            {/* Metadata */}
            <section>
              <h2 className="text-foreground mb-3 text-sm font-semibold">
                Endpoint Metadata
              </h2>
              <MetadataForm
                tableName={def.tableName}
                catalog={def.catalog}
                schema={def.schema}
                onChange={handleMetaChange}
              />
            </section>

            <Separator />

            {/* Mutation */}
            <section>
              <h2 className="text-foreground mb-3 text-sm font-semibold">
                Mutation Pipeline
              </h2>
              <MutationForm
                mutation={def.mutation}
                onChange={handleMutationChange}
                fields={def.fields}
              />
            </section>

            <Separator />

            {/* Fields */}
            <section className="flex flex-1 flex-col">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-foreground text-sm font-semibold">
                    Field Schema
                  </h2>
                  <p className="text-muted-foreground text-xs">
                    {def.fields.length} field
                    {def.fields.length === 1 ? "" : "s"} defined
                    {rootDupes.size > 0 && (
                      <span className="text-destructive ml-2">
                        · {rootDupes.size} duplicate name
                        {rootDupes.size === 1 ? "" : "s"}
                      </span>
                    )}
                  </p>
                </div>
                <Button
                  onClick={addField}
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                >
                  <Plus className="size-3" data-icon="inline-start" />
                  Add field
                </Button>
              </div>

              {def.fields.length === 0 ? (
                <div className="border-border flex flex-1 flex-col items-center justify-center rounded-lg border-2 border-dashed py-12 text-center">
                  <p className="text-muted-foreground text-sm">No fields yet</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Click &ldquo;Add field&rdquo; to define your schema
                  </p>
                  <Button
                    onClick={addField}
                    size="sm"
                    variant="outline"
                    className="mt-4 gap-1.5 text-xs"
                  >
                    <Plus className="size-3" data-icon="inline-start" />
                    Add first field
                  </Button>
                </div>
              ) : (
                <FieldList
                  fields={def.fields}
                  depth={0}
                  dupeNames={rootDupes}
                  onUpdate={updateField}
                  onDelete={deleteField}
                  onReorder={reorderFields}
                />
              )}
            </section>
          </div>
        </div>
      </div>

      {/* FAB — Preview button (always visible) */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className="bg-primary text-primary-foreground hover:bg-primary/90 fixed right-6 bottom-6 z-40 flex size-12 items-center justify-center rounded-full shadow-lg transition-colors"
        aria-label="Show JSON Preview"
      >
        <Code className="size-5" />
      </button>

      {/* Drawer for JSON preview */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} direction="right">
        <DrawerContent className="h-full w-[85vw] max-w-lg">
          <DrawerHeader className="border-border border-b">
            <DrawerTitle>JSON Preview</DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 overflow-hidden">
            <JSONPreview output={output} />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  )
}
