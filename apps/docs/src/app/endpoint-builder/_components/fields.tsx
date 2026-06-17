"use client"

import { Plus } from "lucide-react"

import { FieldList } from "@/components/endpoint-builder/field-list"
import { Button } from "@/components/ui/button"

import { useEndpointBuilder } from "./endpoint-builder-context"

export function FieldsTab() {
  const {
    def,
    rootDupes,
    addField,
    updateField,
    deleteField,
    reorderFields,
    lastAddedFieldId,
    clearLastAddedFieldId,
  } = useEndpointBuilder()

  return (
    <div className="flex flex-1 flex-col">
      {/* Scrollable field list */}
      <div className="flex-1 p-6">
        <section className="flex flex-col">
          <div className="mb-3">
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
              autoFocusId={lastAddedFieldId}
              onAutoFocused={clearLastAddedFieldId}
            />
          )}
        </section>
      </div>

      {/* Sticky add field bar */}
      <div className="border-border bg-background/95 sticky bottom-0 border-t px-6 py-3 backdrop-blur-sm">
        <Button onClick={addField} size="sm" className="h-8 gap-1.5 text-xs">
          <Plus className="size-3" data-icon="inline-start" />
          Add field
        </Button>
      </div>
    </div>
  )
}
