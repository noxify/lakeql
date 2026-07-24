"use client"

import { AlertTriangle, Copy, Download, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

import { useEndpointBuilder } from "./endpoint-builder-context"

export function TopBar() {
  const {
    syncStatus,
    warnings,
    copied,
    handleCopy,
    handleDownload,
    handleReset,
  } = useEndpointBuilder()

  return (
    <header className="border-border bg-card sticky top-0 z-10 flex items-center justify-between border-b px-6 py-4">
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
              {warnings.length} {warnings.length === 1 ? "warning" : "warnings"}
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
            <span className="text-green-600 dark:text-green-400">Copied!</span>
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
  )
}
