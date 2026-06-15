"use client"

import {
  createCollection,
  localStorageCollectionOptions,
} from "@tanstack/react-db"

import type { EndpointDefinition } from "./endpoint-types"

/**
 * Persisted endpoint drafts collection using TanStack DB + localStorage.
 *
 * Stores the current endpoint builder state so it survives page reloads,
 * tab switches, and accidental navigation. Syncs across browser tabs.
 */
export const endpointDraftsCollection = createCollection(
  localStorageCollectionOptions({
    id: "endpoint-drafts",
    storageKey: "lakeql-endpoint-drafts",
    getKey: (item: EndpointDefinition & { id: string }) => item.id,
  })
)

/** The fixed ID for the "current draft" — we only store one at a time for now */
export const CURRENT_DRAFT_ID = "current"
