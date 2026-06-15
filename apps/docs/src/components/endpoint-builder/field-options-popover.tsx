"use client"

import { Settings2, X } from "lucide-react"
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxEmpty,
} from "@/components/ui/combobox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import type {
  FieldDefinition,
  FieldOptions,
  FieldValidation,
  FieldValidationType,
} from "@/lib/endpoint-types"
import {
  VALIDATION_TYPES,
  VALIDATIONS_BY_FIELD_TYPE,
} from "@/lib/endpoint-types"

interface FieldOptionsPopoverProps {
  field: FieldDefinition
  onUpdate: (updated: FieldDefinition) => void
}

export function FieldOptionsPopover({
  field,
  onUpdate,
}: FieldOptionsPopoverProps) {
  const [open, setOpen] = useState(false)
  const options = field.options ?? {}
  const validations = options.validations ?? []

  const hasOptions = options.required || validations.length > 0

  function updateOptions(newOptions: FieldOptions) {
    onUpdate({ ...field, options: newOptions })
  }

  function handleRequiredChange(checked: boolean) {
    updateOptions({ ...options, required: checked })
  }

  function addValidation(type: FieldValidationType) {
    // Don't add duplicates
    if (validations.some((v) => v.type === type)) {
      return
    }
    let newValidation: FieldValidation
    switch (type) {
      case "min": {
        newValidation = { type: "min", value: 0 }
        break
      }
      case "max": {
        newValidation = { type: "max", value: 100 }
        break
      }
      case "regex": {
        newValidation = { type: "regex", pattern: "" }
        break
      }
      default: {
        newValidation = { type } as FieldValidation
      }
    }
    updateOptions({
      ...options,
      validations: [...validations, newValidation],
    })
  }

  function removeValidation(type: FieldValidationType) {
    updateOptions({
      ...options,
      validations: validations.filter((v) => v.type !== type),
    })
  }

  function updateValidationValue(type: FieldValidationType, value: string) {
    updateOptions({
      ...options,
      validations: validations.map((v) => {
        if (v.type !== type) {
          return v
        }
        if (type === "min" || type === "max") {
          return { ...v, value: Number(value) || 0 } as FieldValidation
        }
        if (type === "regex") {
          return { ...v, pattern: value } as FieldValidation
        }
        return v
      }),
    })
  }

  // Available validations: filtered by field type, excluding already-added ones
  const allowedTypes = VALIDATIONS_BY_FIELD_TYPE[field.type] ?? []
  const availableValidations = VALIDATION_TYPES.filter(
    (vt) =>
      allowedTypes.includes(vt.type) &&
      !validations.some((v) => v.type === vt.type)
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label="Field options"
          />
        }
      >
        <Settings2
          className={
            hasOptions ? "text-primary size-4" : "text-muted-foreground size-4"
          }
        />
      </PopoverTrigger>
      <PopoverContent side="right" sideOffset={8} className="w-80">
        <PopoverHeader>
          <PopoverTitle>Field Options</PopoverTitle>
        </PopoverHeader>

        {/* Required switch */}
        <div className="flex items-center justify-between">
          <Label htmlFor={`required-${field.id}`} className="text-sm">
            Required
          </Label>
          <Switch
            size="sm"
            checked={options.required ?? false}
            onCheckedChange={handleRequiredChange}
            id={`required-${field.id}`}
          />
        </div>

        {/* Validations section */}
        <div className="flex flex-col gap-2">
          <Label className="text-sm">Validations</Label>

          {/* Selected validations as badges with value inputs */}
          {validations.length > 0 && (
            <div className="flex flex-col gap-2">
              {validations.map((v) => {
                const meta = VALIDATION_TYPES.find((vt) => vt.type === v.type)
                return (
                  <div key={v.type} className="flex items-center gap-2">
                    <Badge variant="secondary" className="gap-1">
                      {meta?.label ?? v.type}
                      <button
                        type="button"
                        onClick={() => removeValidation(v.type)}
                        className="hover:bg-muted-foreground/20 ml-0.5 rounded-full p-0.5"
                        aria-label={`Remove ${v.type} validation`}
                      >
                        <X className="size-2.5" />
                      </button>
                    </Badge>
                    {/* Value input for min/max */}
                    {(v.type === "min" || v.type === "max") && (
                      <Input
                        type="number"
                        value={(v as { value: number }).value}
                        onChange={(e) =>
                          updateValidationValue(v.type, e.target.value)
                        }
                        className="h-7 w-20 text-xs"
                        placeholder="value"
                      />
                    )}
                    {/* Pattern input for regex */}
                    {v.type === "regex" && (
                      <Input
                        type="text"
                        value={(v as { pattern: string }).pattern}
                        onChange={(e) =>
                          updateValidationValue(v.type, e.target.value)
                        }
                        className="h-7 flex-1 font-mono text-xs"
                        placeholder="pattern"
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Add validation combobox */}
          {availableValidations.length > 0 && (
            <ValidationCombobox
              availableValidations={availableValidations}
              onSelect={addValidation}
            />
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ValidationCombobox({
  availableValidations,
  onSelect,
}: {
  availableValidations: typeof VALIDATION_TYPES
  onSelect: (type: FieldValidationType) => void
}) {
  const [inputValue, setInputValue] = useState("")

  return (
    <Combobox
      value={null}
      onValueChange={(val) => {
        if (val) {
          onSelect(val as FieldValidationType)
          setInputValue("")
        }
      }}
      inputValue={inputValue}
      onInputValueChange={setInputValue}
    >
      <ComboboxInput placeholder="Add validation..." className="h-8 text-xs" />
      <ComboboxContent>
        <ComboboxList>
          {availableValidations.map((vt) => (
            <ComboboxItem key={vt.type} value={vt.type}>
              <span className="text-sm">{vt.label}</span>
              {vt.hasValue && (
                <span className="text-muted-foreground text-xs">
                  ({vt.hasValue === "number" ? "numeric value" : "text pattern"}
                  )
                </span>
              )}
            </ComboboxItem>
          ))}
        </ComboboxList>
        <ComboboxEmpty>No validations available</ComboboxEmpty>
      </ComboboxContent>
    </Combobox>
  )
}
