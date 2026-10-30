/**
 * Pure ranking helpers for the client search command. Kept free of React and
 * `zbsearch` imports so the merge logic can be unit tested under the node
 * Vitest project.
 */

/** The document type as stored in the search index. */
export type SearchDocumentType = "page" | "heading" | "text"

/** The minimal shape the ranking merge reads from a search hit. */
export interface RankableHit {
  score?: number
  document?: {
    type?: SearchDocumentType
  }
}

/**
 * Ranks document types for the deterministic merge: `page` (0) → `heading` (1)
 * → `text` (2), with anything else last.
 *
 * @param type - The hit's document type.
 * @returns The type's sort rank (lower sorts first).
 */
export function typeRank(type: SearchDocumentType | undefined): number {
  if (type === "page") {
    return 0
  }

  if (type === "heading") {
    return 1
  }

  if (type === "text") {
    return 2
  }

  return 3
}

/**
 * Orders merged hits deterministically by document type first
 * (`page` → `heading` → `text`), using BM25 score as the tiebreak within a
 * type. A section landing page's `page` doc therefore outranks any `heading`
 * match for the same term, so searching a section title returns that page
 * first instead of a short exact-match heading elsewhere in the docs.
 *
 * @template T - The concrete hit type being ordered.
 * @param hits - The merged hits from the per-type searches.
 * @returns A new array ordered by type tier, then by descending score.
 */
export function orderHitsByTypeThenScore<T extends RankableHit>(
  hits: T[]
): T[] {
  return hits.toSorted((a, b) => {
    const typeDelta = typeRank(a.document?.type) - typeRank(b.document?.type)
    if (typeDelta !== 0) {
      return typeDelta
    }

    return (b.score ?? 0) - (a.score ?? 0)
  })
}
