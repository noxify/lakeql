/**
 * Feature-template registry and lookup.
 *
 * The registry is the single source of truth for the feature ids a consumer
 * can apply. v1 wires only the CLI (`lakeql add <feature>`) to it; create-app
 * keeps its own ops builders and does not consume the registry yet.
 */

import { fabricOboTemplate } from "./fabric-obo"
import type { FeatureTemplate } from "./types"

/**
 * Error thrown when a feature id is not present in the registry.
 *
 * Carries the available ids so a consumer (e.g. the CLI) can surface them in
 * its own error type without re-deriving the list.
 */
export class UnknownFeatureError extends Error {
  /** The requested id that was not found. */
  readonly id: string
  /** The feature ids currently registered, sorted. */
  readonly availableIds: readonly string[]

  constructor(id: string, availableIds: readonly string[]) {
    const list = availableIds.length > 0 ? availableIds.join(", ") : "(none)"
    super(`Unknown feature "${id}". Available features: ${list}.`)
    this.name = "UnknownFeatureError"
    this.id = id
    this.availableIds = availableIds
  }
}

/**
 * Registered feature templates, keyed by id.
 *
 * Templates are added here as they are implemented; `fabric-obo` is the first
 * entry.
 */
export const featureRegistry: Record<string, FeatureTemplate> = {
  [fabricOboTemplate.id]: fabricOboTemplate,
}

/**
 * List the registered feature ids, sorted for stable output.
 */
export function listFeatureIds(): string[] {
  return Object.keys(featureRegistry).toSorted((a, b) => a.localeCompare(b))
}

/**
 * Look up a feature template by id.
 *
 * @param id - The feature id requested by the consumer.
 * @returns The matching template.
 * @throws {UnknownFeatureError} When no template is registered under `id`; the
 * error lists the available ids.
 */
export function resolveFeatureTemplate(id: string): FeatureTemplate {
  const template = featureRegistry[id]
  if (!template) {
    throw new UnknownFeatureError(id, listFeatureIds())
  }
  return template
}
