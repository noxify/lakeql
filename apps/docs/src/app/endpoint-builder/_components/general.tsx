"use client"

import { AlertCircle } from "lucide-react"
import { useState } from "react"

import { ImportZone } from "@/components/endpoint-builder/import-zone"
import { MetadataForm } from "@/components/endpoint-builder/metadata-form"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"

import { useEndpointBuilder } from "./endpoint-builder-context"

export function GeneralTab() {
  const { def, handleMetaChange, handleImport } = useEndpointBuilder()
  const [importError, setImportError] = useState<string | null>(null)

  function onImport(imported: Parameters<typeof handleImport>[0]) {
    handleImport(imported)
    setImportError(null)
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Import */}
      <section>
        <h2 className="text-foreground mb-3 text-sm font-semibold">Import</h2>
        <ImportZone onImport={onImport} onError={setImportError} />
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
    </div>
  )
}
