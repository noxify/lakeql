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
import type {
  LoadStrategy,
  MutationConfig,
  StorageType,
} from "@/lib/endpoint-types"
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

const STORAGE_TYPE_LABELS: Record<StorageType, string> = {
  s3: "S3",
  minio: "MinIO",
}

const STORAGE_TYPES: StorageType[] = ["s3", "minio"]

export function MutationForm({ mutation, onChange }: MutationFormProps) {
  const enabled = mutation !== undefined && mutation !== false

  function handleToggle(checked: boolean) {
    if (checked) {
      onChange({
        loadStrategy: "full_load",
        type: "s3",
        bucket: "",
        basePath: "",
      })
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

  function handleTypeChange(value: StorageType | null) {
    if (enabled && value) {
      onChange({ ...mutation, type: value })
    }
  }

  function handleBucketChange(value: string) {
    if (enabled) {
      onChange({ ...mutation, bucket: value })
    }
  }

  function handleBasePathChange(value: string) {
    if (enabled) {
      onChange({ ...mutation, basePath: value })
    }
  }

  function handleEndpointChange(value: string) {
    if (enabled) {
      onChange({ ...mutation, endpoint: value || undefined })
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
            <Label htmlFor="storage-type" className="text-sm font-medium">
              Storage Type
            </Label>
            <Select
              value={mutation.type ?? "s3"}
              onValueChange={handleTypeChange}
            >
              <SelectTrigger id="storage-type" className="w-full">
                <SelectValue placeholder="Select storage type" />
              </SelectTrigger>
              <SelectContent>
                {STORAGE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {STORAGE_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
            <Label htmlFor="bucket" className="text-sm font-medium">
              Bucket
            </Label>
            <Input
              id="bucket"
              value={mutation.bucket}
              onChange={(e) => handleBucketChange(e.target.value)}
              placeholder="my-datalake"
              className="font-mono text-sm"
            />
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="endpoint" className="text-sm font-medium">
              Endpoint
              {mutation.type === "minio" ? " (required)" : " (optional)"}
            </Label>
            <Input
              id="endpoint"
              value={mutation.endpoint ?? ""}
              onChange={(e) => handleEndpointChange(e.target.value)}
              placeholder={
                mutation.type === "minio"
                  ? "http://minio:9000"
                  : "https://s3.amazonaws.com"
              }
              className="font-mono text-sm"
            />
          </div>
        </div>
      )}
    </div>
  )
}
