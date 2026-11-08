"use client"

import type { ReactNode } from "react"
import { useEffect, useState } from "react"

import { Switch } from "../ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs"

export type PackageManager = "npm" | "pnpm" | "yarn"
export type ExecutionMode = "local" | "oneoff"

declare global {
  interface Window {
    setPackageManager?: (packageManager: PackageManager | null) => void
    setExecutionMode?: (executionMode: ExecutionMode | null) => void
  }
}

const PACKAGE_MANAGERS: PackageManager[] = ["pnpm", "npm", "yarn"]

const STORAGE_KEY = "lakeql:selected-package-manager"
const LEGACY_STORAGE_KEY = "package-manager"
const SYNC_EVENT = "lakeql:command-package-manager-change"

const EXEC_STORAGE_KEY = "lakeql:selected-execution-mode"
const EXEC_SYNC_EVENT = "lakeql:command-execution-mode-change"

function isPackageManager(value: string): value is PackageManager {
  return PACKAGE_MANAGERS.includes(value as PackageManager)
}

function isExecutionMode(value: string): value is ExecutionMode {
  return value === "local" || value === "oneoff"
}

interface ExecCommand {
  packageManager: PackageManager
  executionMode: ExecutionMode
  content: ReactNode
}

interface PlainCommand {
  packageManager: PackageManager
  executionMode?: undefined
  content: ReactNode
}

interface CommandTabsClientProps {
  commands: (ExecCommand | PlainCommand)[]
  defaultPackageManager?: PackageManager
  defaultExecutionMode?: ExecutionMode
  showExecutionMode?: boolean
}

function getStoredPackageManager(): PackageManager | null {
  if (typeof window === "undefined") {
    return null
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored && isPackageManager(stored)) {
      return stored
    }

    const legacyStored = window.localStorage.getItem(LEGACY_STORAGE_KEY)
    if (legacyStored && isPackageManager(legacyStored)) {
      return legacyStored
    }
  } catch {
    return null
  }

  return null
}

function persistPackageManager(value: PackageManager) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value)
    // Keep legacy key in sync for compatibility with existing renoun state.
    window.localStorage.setItem(LEGACY_STORAGE_KEY, value)
  } catch {
    // Ignore storage access errors.
  }
}

function getStoredExecutionMode(): ExecutionMode | null {
  if (typeof window === "undefined") {
    return null
  }

  try {
    const stored = window.localStorage.getItem(EXEC_STORAGE_KEY)
    if (stored && isExecutionMode(stored)) {
      return stored
    }
  } catch {
    return null
  }

  return null
}

function persistExecutionMode(value: ExecutionMode) {
  try {
    window.localStorage.setItem(EXEC_STORAGE_KEY, value)
  } catch {
    // Ignore storage access errors.
  }
}

function resolvePackageManager(
  packageManager: PackageManager | null,
  defaultPackageManager: PackageManager
): PackageManager {
  const stored = getStoredPackageManager()
  const candidate = packageManager ?? stored
  return candidate && isPackageManager(candidate)
    ? candidate
    : defaultPackageManager
}

function resolveExecutionMode(
  executionMode: ExecutionMode | null,
  defaultExecutionMode: ExecutionMode
): ExecutionMode {
  const stored = getStoredExecutionMode()
  const candidate = executionMode ?? stored
  return candidate && isExecutionMode(candidate)
    ? candidate
    : defaultExecutionMode
}

const onValueChange = (value: string) => {
  if (!isPackageManager(value)) {
    return
  }

  window.setPackageManager?.(value)
}

/**
 * Toggle for the execution mode, rendered as a labeled Switch. The switch is
 * checked for the one-off mode, so its label describes running the command
 * without a local install.
 */
const ExecutionModeSwitch = ({
  executionMode,
}: {
  executionMode: ExecutionMode
}) => (
  // oxlint-disable-next-line jsx-a11y/label-has-associated-control
  <label className="text-muted-foreground flex items-center gap-2 text-sm">
    <Switch
      size="sm"
      checked={executionMode === "oneoff"}
      onCheckedChange={(checked) =>
        window.setExecutionMode?.(checked ? "oneoff" : "local")
      }
    />
    Run without installing
  </label>
)

export const CommandTabsClient = ({
  commands,
  defaultPackageManager = "pnpm",
  defaultExecutionMode = "local",
  showExecutionMode = false,
}: CommandTabsClientProps) => {
  const [selected, setSelected] = useState<PackageManager>(
    defaultPackageManager
  )
  const [executionMode, setExecutionMode] =
    useState<ExecutionMode>(defaultExecutionMode)

  useEffect(() => {
    const setPackageManager = (packageManager: PackageManager | null) => {
      const resolved = resolvePackageManager(
        packageManager,
        defaultPackageManager
      )
      persistPackageManager(resolved)
      setSelected(resolved)
      window.dispatchEvent(
        new CustomEvent<PackageManager>(SYNC_EVENT, { detail: resolved })
      )
    }

    window.setPackageManager = setPackageManager

    const onStorage = (event: StorageEvent) => {
      if (
        event.newValue &&
        isPackageManager(event.newValue) &&
        (event.key === STORAGE_KEY || event.key === LEGACY_STORAGE_KEY)
      ) {
        setSelected(event.newValue)
      }
    }

    const onSync = (event: Event) => {
      const manager = (event as CustomEvent<PackageManager>).detail
      if (manager && isPackageManager(manager)) {
        setSelected(manager)
      }
    }

    window.setPackageManager(null)

    window.addEventListener("storage", onStorage)
    window.addEventListener(SYNC_EVENT, onSync)

    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener(SYNC_EVENT, onSync)
    }
  }, [defaultPackageManager])

  useEffect(() => {
    if (!showExecutionMode) {
      return
    }

    const applyExecutionMode = (mode: ExecutionMode | null) => {
      const resolved = resolveExecutionMode(mode, defaultExecutionMode)
      persistExecutionMode(resolved)
      setExecutionMode(resolved)
      window.dispatchEvent(
        new CustomEvent<ExecutionMode>(EXEC_SYNC_EVENT, { detail: resolved })
      )
    }

    window.setExecutionMode = applyExecutionMode

    const onStorage = (event: StorageEvent) => {
      if (
        event.key === EXEC_STORAGE_KEY &&
        event.newValue &&
        isExecutionMode(event.newValue)
      ) {
        setExecutionMode(event.newValue)
      }
    }

    const onSync = (event: Event) => {
      const mode = (event as CustomEvent<ExecutionMode>).detail
      if (mode && isExecutionMode(mode)) {
        setExecutionMode(mode)
      }
    }

    window.setExecutionMode(null)

    window.addEventListener("storage", onStorage)
    window.addEventListener(EXEC_SYNC_EVENT, onSync)

    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener(EXEC_SYNC_EVENT, onSync)
    }
  }, [defaultExecutionMode, showExecutionMode])

  const visibleCommands = showExecutionMode
    ? commands.filter((command) => command.executionMode === executionMode)
    : commands

  return (
    <Tabs value={selected} onValueChange={onValueChange}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList variant="line" className="custom-tabs-list">
          {PACKAGE_MANAGERS.map((packageManager) => (
            <TabsTrigger key={packageManager} value={packageManager}>
              {packageManager}
            </TabsTrigger>
          ))}
        </TabsList>

        {showExecutionMode ? (
          <ExecutionModeSwitch executionMode={executionMode} />
        ) : null}
      </div>

      {visibleCommands.map(({ packageManager, content }) => (
        <TabsContent key={packageManager} value={packageManager}>
          {content}
        </TabsContent>
      ))}
    </Tabs>
  )
}
