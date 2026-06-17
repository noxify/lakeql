"use client"

import { useLiveQuery } from "@tanstack/react-db"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import {
  CURRENT_DRAFT_ID,
  endpointDraftsCollection,
} from "@/lib/endpoint-store"
import type {
  EndpointDefinition,
  FieldDefinition,
  MutationConfig,
  OutputDefinition,
} from "@/lib/endpoint-types"
import {
  generateId,
  buildOutputJSON,
  getDuplicateNames,
} from "@/lib/endpoint-utils"

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
    const name = field.name ?? ""
    const fieldPath = [...path, name || "(unnamed)"].join(".")

    if (!name.trim()) {
      warnings.push(
        `Empty field name${path.length > 0 ? ` in ${path.join(".")}` : ""} — will be excluded from output`
      )
    }

    if (field.type === "Object") {
      const namedChildren = (field.fields ?? []).filter((f) => f.name?.trim())
      if (namedChildren.length === 0 && name.trim()) {
        warnings.push(
          `"${fieldPath}" has no children — will be excluded from output`
        )
      }
      collectWarnings(field.fields ?? [], warnings, [
        ...path,
        name || "(unnamed)",
      ])
    }

    if (field.type === "Array" && field.arrayItemType === "Object") {
      const namedChildren = (field.arrayItemFields ?? []).filter((f) =>
        f.name?.trim()
      )
      if (namedChildren.length === 0 && name.trim()) {
        warnings.push(
          `"${fieldPath}" array items have no children — will be excluded from output`
        )
      }
      collectWarnings(field.arrayItemFields ?? [], warnings, [
        ...path,
        name || "(unnamed)",
        "items",
      ])
    }
  }
}

function collectMutationWarnings(
  mutation: false | MutationConfig | undefined,
  warnings: string[]
) {
  if (mutation === undefined || mutation === false) {
    return
  }

  if (!mutation.bucket?.trim()) {
    warnings.push("Mutation: Bucket is required")
  }

  if (!mutation.basePath?.trim()) {
    warnings.push("Mutation: Base Path is required")
  }

  if (mutation.type === "minio" && !mutation.endpoint?.trim()) {
    warnings.push("Mutation: Endpoint is required for MinIO")
  }

  // Custom partitioning without segments
  if (
    typeof mutation.partitioning === "string" &&
    mutation.partitioning !== "" &&
    !mutation.partitioning.includes("/") &&
    !mutation.partitioning.includes(":")
  ) {
    // Single field name — valid, no warning needed
    return
  }

  if (
    typeof mutation.partitioning === "string" &&
    mutation.partitioning === ""
  ) {
    warnings.push("Mutation: Custom partitioning requires at least one segment")
  }
}

export type SyncStatus = "idle" | "syncing" | "synced"

interface EndpointBuilderContextValue {
  /** The current endpoint definition state */
  def: EndpointDefinition
  /** Update metadata fields (tableName, catalog, schema) */
  handleMetaChange: (
    key: "tableName" | "catalog" | "schema",
    value: string
  ) => void
  /** Update mutation configuration */
  handleMutationChange: (mutation: false | MutationConfig | undefined) => void
  /** Add a new field to the root field list */
  addField: () => void
  /** Update a field at a specific index */
  updateField: (index: number, updated: FieldDefinition) => void
  /** Delete a field at a specific index */
  deleteField: (index: number) => void
  /** Reorder the root field list */
  reorderFields: (fields: FieldDefinition[]) => void
  /** Import a parsed endpoint definition */
  handleImport: (imported: EndpointDefinition) => void
  /** Reset to default state and clear persisted draft */
  handleReset: () => void
  /** Copy JSON to clipboard */
  handleCopy: () => Promise<void>
  /** Download JSON as file */
  handleDownload: () => void
  /** The built output JSON */
  output: OutputDefinition
  /** The JSON string representation */
  jsonString: string
  /** Duplicate field names at root level */
  rootDupes: Set<string>
  /** Validation warnings */
  warnings: string[]
  /** Whether clipboard copy was recently performed */
  copied: boolean
  /** Current sync/persistence status */
  syncStatus: SyncStatus
  /** ID of the most recently added field (for auto-focus) */
  lastAddedFieldId: string | null
  /** Clear the lastAddedFieldId after focus has been applied */
  clearLastAddedFieldId: () => void
}

const EndpointBuilderContext =
  createContext<EndpointBuilderContextValue | null>(null)

export function useEndpointBuilder(): EndpointBuilderContextValue {
  const ctx = useContext(EndpointBuilderContext)
  if (!ctx) {
    throw new Error(
      "useEndpointBuilder must be used within an EndpointBuilderProvider"
    )
  }
  return ctx
}

export function EndpointBuilderProvider({
  children,
}: {
  children: React.ReactNode
}) {
  // Load persisted draft from TanStack DB / localStorage
  const { data: persistedDrafts } = useLiveQuery((q) =>
    q.from({ draft: endpointDraftsCollection })
  )
  const persistedDraft = persistedDrafts?.[0]

  const [def, setDef] = useState<EndpointDefinition>(DEFAULT_STATE)
  const [copied, setCopied] = useState(false)
  const initialized = useRef(false)

  // Restore from persisted draft on first load
  useEffect(() => {
    if (!initialized.current && persistedDraft) {
      setDef({
        version: persistedDraft.version ?? "1.0",
        tableName: persistedDraft.tableName ?? "",
        catalog: persistedDraft.catalog ?? "",
        schema: persistedDraft.schema ?? "",
        fields: persistedDraft.fields ?? [],
        mutation: persistedDraft.mutation,
      })
      initialized.current = true
    } else if (!initialized.current && persistedDrafts !== undefined) {
      initialized.current = true
    }
  }, [persistedDraft, persistedDrafts])

  // Persist state changes to TanStack DB (debounced)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle")
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedResetTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasInserted = useRef(!!persistedDraft)

  const hasContent =
    (def.tableName ?? "").trim() !== "" ||
    (def.catalog ?? "").trim() !== "" ||
    (def.schema ?? "").trim() !== "" ||
    def.fields.length > 0 ||
    (def.mutation !== undefined && def.mutation !== false)

  useEffect(() => {
    hasInserted.current = !!persistedDraft
  }, [persistedDraft])

  useEffect(() => {
    if (!initialized.current) {
      return
    }
    if (!hasContent) {
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

  // Computed values
  const output = useMemo(() => buildOutputJSON(def), [def])
  const rootDupes = useMemo(() => getDuplicateNames(def.fields), [def.fields])
  const jsonString = useMemo(() => JSON.stringify(output, null, 2), [output])
  const warnings = useMemo(() => {
    const items: string[] = []
    collectWarnings(def.fields, items, [])
    collectMutationWarnings(def.mutation, items)
    return items
  }, [def.fields, def.mutation])

  // Track last added field for auto-focus
  const [lastAddedFieldId, setLastAddedFieldId] = useState<string | null>(null)
  const clearLastAddedFieldId = useCallback(() => {
    setLastAddedFieldId(null)
  }, [])

  // Actions
  const handleMetaChange = useCallback(
    (key: "tableName" | "catalog" | "schema", value: string) => {
      setDef((prev) => ({ ...prev, [key]: value }))
    },
    []
  )

  const handleMutationChange = useCallback(
    (mutation: false | MutationConfig | undefined) => {
      setDef((prev) => ({ ...prev, mutation }))
    },
    []
  )

  const addField = useCallback(() => {
    const newField: FieldDefinition = {
      id: generateId(),
      name: "",
      type: "String",
    }
    setLastAddedFieldId(newField.id)
    setDef((prev) => ({ ...prev, fields: [...prev.fields, newField] }))
  }, [])

  const updateField = useCallback((index: number, updated: FieldDefinition) => {
    setDef((prev) => {
      const fields = [...prev.fields]
      fields[index] = updated
      return { ...prev, fields }
    })
  }, [])

  const deleteField = useCallback((index: number) => {
    setDef((prev) => {
      const fields = [...prev.fields]
      fields.splice(index, 1)
      return { ...prev, fields }
    })
  }, [])

  const reorderFields = useCallback((fields: FieldDefinition[]) => {
    setDef((prev) => ({ ...prev, fields }))
  }, [])

  const handleImport = useCallback((imported: EndpointDefinition) => {
    setDef(imported)
  }, [])

  const handleReset = useCallback(() => {
    setDef(DEFAULT_STATE)
    if (hasInserted.current) {
      endpointDraftsCollection.delete(CURRENT_DRAFT_ID)
      hasInserted.current = false
    }
  }, [])

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(jsonString)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [jsonString])

  const handleDownload = useCallback(() => {
    const blob = new Blob([jsonString], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${output.tableName || "endpoint"}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [jsonString, output.tableName])

  const value = useMemo<EndpointBuilderContextValue>(
    () => ({
      def,
      handleMetaChange,
      handleMutationChange,
      addField,
      updateField,
      deleteField,
      reorderFields,
      handleImport,
      handleReset,
      handleCopy,
      handleDownload,
      output,
      jsonString,
      rootDupes,
      warnings,
      copied,
      syncStatus,
      lastAddedFieldId,
      clearLastAddedFieldId,
    }),
    [
      def,
      handleMetaChange,
      handleMutationChange,
      addField,
      updateField,
      deleteField,
      reorderFields,
      handleImport,
      handleReset,
      handleCopy,
      handleDownload,
      output,
      jsonString,
      rootDupes,
      warnings,
      copied,
      syncStatus,
      lastAddedFieldId,
      clearLastAddedFieldId,
    ]
  )

  return (
    <EndpointBuilderContext.Provider value={value}>
      {children}
    </EndpointBuilderContext.Provider>
  )
}
