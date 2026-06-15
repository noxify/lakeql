"use client"

import { Upload } from "lucide-react"
import { useCallback, useRef, useState } from "react"

import type { EndpointDefinition } from "@/lib/endpoint-types"
import { parseImportedJSON } from "@/lib/endpoint-utils"
import { cn } from "@/lib/utils"

interface ImportZoneProps {
  onImport: (def: EndpointDefinition) => void
  onError: (msg: string) => void
}

export function ImportZone({ onImport, onError }: ImportZoneProps) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function processFile(file: File) {
    if (!file.name.endsWith(".json")) {
      onError("Please upload a valid .json file")
      return
    }
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const def = parseImportedJSON(parsed)
      if (!def) {
        onError(
          'Invalid JSON structure. Expected {"version":"1.0", "tableName":…}'
        )
        return
      }
      onImport(def)
    } catch {
      onError("Failed to parse JSON file")
    }
  }

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const [file] = e.dataTransfer.files
      if (file) {
        void processFile(file)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onImport, onError]
  )

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-6 text-center transition-colors hover:border-primary hover:bg-accent/40",
        dragging && "border-primary bg-accent/60"
      )}
    >
      <Upload className="text-muted-foreground size-5" />
      <div>
        <p className="text-sm font-medium">Import definition</p>
        <p className="text-muted-foreground text-xs">
          Drop a .json file here or click to browse
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) {
            processFile(file)
          }
          e.target.value = ""
        }}
      />
    </div>
  )
}
