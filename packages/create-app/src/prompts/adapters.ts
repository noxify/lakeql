import { cancel, confirm, isCancel, multiselect, text } from "@clack/prompts"

import type { AdapterDefinition } from "../features/adapters"
import { ADAPTERS, DEFAULT_DS_NAMES } from "../features/adapters"

const VALID_ADAPTER_IDS = ADAPTERS.filter((a) => a.available).map((a) => a.id)

export async function promptAdapters(): Promise<AdapterDefinition[]> {
  const result = await multiselect({
    message: "Which adapters do you want to use?",
    options: ADAPTERS.map((adapter) => ({
      disabled: !adapter.available,
      hint: adapter.available ? undefined : "coming soon",
      label: adapter.label,
      value: adapter.id,
    })),
    required: true,
  })

  if (isCancel(result)) {
    cancel("Operation cancelled")
    process.exit(0)
  }

  const selectedIds = result as string[]
  const unavailable = selectedIds.filter(
    (id) => !ADAPTERS.find((a) => a.id === id)?.available
  )

  if (unavailable.length > 0) {
    const names = unavailable
      .map((id) => ADAPTERS.find((a) => a.id === id)?.label)
      .join(", ")
    cancel(
      `${names} ${unavailable.length > 1 ? "are" : "is"} not yet available. Please select only available adapters.`
    )
    process.exit(1)
  }

  return selectedIds
    .map((id) => ADAPTERS.find((a) => a.id === id))
    .filter((a): a is AdapterDefinition => a !== undefined && a.available)
}

export async function promptDataSourceNames(
  adapters: AdapterDefinition[]
): Promise<Record<string, string>> {
  const defaults = Object.fromEntries(
    adapters.map((a) => [a.id, DEFAULT_DS_NAMES[a.id] ?? a.id])
  )

  const defaultsList = adapters
    .map((a) => `${a.label} → "${defaults[a.id]}"`)
    .join(", ")

  const customize = await confirm({
    initialValue: false,
    message: `Customize data source names? (defaults: ${defaultsList})`,
  })

  if (isCancel(customize)) {
    cancel("Operation cancelled")
    process.exit(0)
  }

  if (!customize) {
    return defaults
  }

  const names: Record<string, string> = {}

  for (const adapter of adapters) {
    const defaultName = defaults[adapter.id]
    // oxlint-disable-next-line no-await-in-loop -- prompts must be sequential
    const result = await text({
      defaultValue: defaultName,
      message: `Data source name for ${adapter.label}?`,
      placeholder: defaultName,
      validate: (value) => {
        if (!value) {
          return "Name is required"
        }
        if (!/^[a-z][a-z0-9_]*$/u.test(value)) {
          return "Must start with a letter and contain only lowercase letters, numbers, and underscores"
        }
      },
    })

    if (isCancel(result)) {
      cancel("Operation cancelled")
      process.exit(0)
    }

    names[adapter.id] = result
  }

  return names
}

export function resolveAdaptersFromFlag(ids: string[]): AdapterDefinition[] {
  const invalid = ids.filter((id) => !VALID_ADAPTER_IDS.includes(id))
  if (invalid.length > 0) {
    cancel(
      `Invalid adapter(s): ${invalid.join(", ")}. Valid options: ${VALID_ADAPTER_IDS.join(", ")}`
    )
    process.exit(1)
  }

  return ids
    .map((id) => ADAPTERS.find((a) => a.id === id))
    .filter((a): a is AdapterDefinition => a !== undefined && a.available)
}

export function resolveDsNamesFromFlag(
  adapters: AdapterDefinition[],
  names: string[]
): Record<string, string> {
  if (names.length !== adapters.length) {
    cancel(
      `--ds-names must have the same number of entries as --adapters (got ${names.length}, expected ${adapters.length})`
    )
    process.exit(1)
  }

  const result: Record<string, string> = {}
  for (const [i, adapter] of adapters.entries()) {
    result[adapter.id] = names[i] ?? adapter.id
  }
  return result
}
