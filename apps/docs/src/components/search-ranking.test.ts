import { describe, expect, it } from "vitest"

import { orderHitsByTypeThenScore, typeRank } from "./search-ranking"
import type { RankableHit } from "./search-ranking"

describe("type-priority hit merge", () => {
  it("orders by type tier (page → heading → text) before score", () => {
    // A short exact-match heading scores far above the page hit, yet the page
    // tier must still come first — this is the bug the fix targets.
    const hits: RankableHit[] = [
      { document: { type: "heading" }, score: 50 },
      { document: { type: "text" }, score: 13 },
      { document: { type: "page" }, score: 5 },
    ]

    const ordered = orderHitsByTypeThenScore(hits)

    expect(ordered.map((hit) => hit.document?.type)).toStrictEqual([
      "page",
      "heading",
      "text",
    ])
  })

  it("uses descending score as the tiebreak within a type tier", () => {
    const hits: RankableHit[] = [
      { document: { type: "text" }, score: 3 },
      { document: { type: "text" }, score: 9 },
      { document: { type: "text" }, score: 6 },
    ]

    const ordered = orderHitsByTypeThenScore(hits)

    expect(ordered.map((hit) => hit.score)).toStrictEqual([9, 6, 3])
  })

  it("sorts hits with no type last and treats missing scores as zero", () => {
    const hits: RankableHit[] = [
      { document: {}, score: 100 },
      { document: { type: "page" } },
      { document: { type: "heading" }, score: 1 },
    ]

    const ordered = orderHitsByTypeThenScore(hits)

    expect(ordered.map((hit) => hit.document?.type)).toStrictEqual([
      "page",
      "heading",
      undefined,
    ])
  })

  it("does not mutate the input array", () => {
    const hits: RankableHit[] = [
      { document: { type: "text" }, score: 1 },
      { document: { type: "page" }, score: 1 },
    ]
    const snapshot = [...hits]

    orderHitsByTypeThenScore(hits)

    expect(hits).toStrictEqual(snapshot)
  })
})

describe("document type ranking", () => {
  it("ranks known document types and sends unknown types last", () => {
    expect(typeRank("page")).toBe(0)
    expect(typeRank("heading")).toBe(1)
    expect(typeRank("text")).toBe(2)
    expect(typeRank(undefined)).toBe(3)
  })
})
