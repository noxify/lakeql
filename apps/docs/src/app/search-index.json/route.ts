import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { cwd, env } from "node:process"

import { persist } from "@zbsearch/plugin-data-persistence"
import { insertMultiple } from "zbsearch"

import {
  buildSearchDocuments,
  createSearchIndex,
  getAllSearchableEntries,
} from "@/zbsearch/builder"

export const dynamic = "force-static"
export const runtime = "nodejs"

const DEV_INDEX_CACHE_FILE = path.join(
  cwd(),
  ".next",
  "dev",
  "cache",
  "search-index.json"
)

function loadDevIndexCache(): string | null {
  if (!existsSync(DEV_INDEX_CACHE_FILE)) {
    return null
  }

  return readFileSync(DEV_INDEX_CACHE_FILE, "utf-8")
}

let devIndexCache = loadDevIndexCache()

async function buildPersistedSearchIndexJson(): Promise<string> {
  const entries = await getAllSearchableEntries()
  const docs = await buildSearchDocuments(entries)

  const db = createSearchIndex()
  await insertMultiple(db, docs)
  const snapshot = await persist(db, "json")
  return typeof snapshot === "string" ? snapshot : JSON.stringify(snapshot)
}

export async function GET() {
  const isDev = env.NODE_ENV === "development"

  if (isDev && devIndexCache) {
    return new Response(devIndexCache, {
      headers: { "Content-Type": "application/json; charset=utf-8" },
    })
  }

  const snapshotJson = await buildPersistedSearchIndexJson()

  if (isDev) {
    mkdirSync(path.dirname(DEV_INDEX_CACHE_FILE), { recursive: true })
    writeFileSync(DEV_INDEX_CACHE_FILE, snapshotJson)
    devIndexCache = snapshotJson
  }

  return new Response(snapshotJson, {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  })
}
