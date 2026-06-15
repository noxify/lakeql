"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import type { LoadStrategy, MutationConfig } from "@/lib/endpoint-types"
import { LOAD_STRATEGIES } from "@/lib/endpoint-types"

interface MutationFormProps {
  mutation: false | MutationConfig | undefined
  onChange: (mutation: false | MutationConfig | undefined) => void
}

const STRATEGY_LABELS: Record<LoadStrategy, string> = {
  full_load: "Full Load",
  full_load_append: "Full Load + Append",
  append: "Append",
}

export function MutationForm({ mutation, onChange }: MutationFormProps) {
  const enabled = mutation !== undefined && mutation !== false

  function handleToggle(checked: boolean) {
    if (checked) {
      onChange({ loadStrategy: "full_load", basePath: "" })
    } else {
      // oxlint-disable-next-line unicorn/no-useless-undefined
      onChange(undefined)
    }
  }

  function handleStrategyChange(value: LoadStrategy | null) {
    if (enabled && value) {
      onChange({ ...mutation, loadStrategy: value })
    }
  }

  function handleBasePathChange(value: string) {
    if (enabled) {
      onChange({ ...mutation, basePath: value })
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Switch
          id="mutation-toggle"
          checked={enabled}
          onCheckedChange={handleToggle}
        />
        <Label htmlFor="mutation-toggle" className="text-sm font-medium">
          Enable Mutation
        </Label>
      </div>

      {enabled && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="load-strategy" className="text-sm font-medium">
              Load Strategy
            </Label>
            <Select
              value={mutation.loadStrategy}
              onValueChange={handleStrategyChange}
            >
              <SelectTrigger id="load-strategy" className="w-full">
                <SelectValue placeholder="Select strategy" />
              </SelectTrigger>
              <SelectContent>
                {LOAD_STRATEGIES.map((strategy) => (
                  <SelectItem key={strategy} value={strategy}>
                    {STRATEGY_LABELS[strategy]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="base-path" className="text-sm font-medium">
              Base Path
            </Label>
            <Input
              id="base-path"
              value={mutation.basePath}
              onChange={(e) => handleBasePathChange(e.target.value)}
              placeholder="warehouse/analytics/events"
              className="font-mono text-sm"
            />
          </div>
        </div>
      )}
    </div>
  )
}
