import { http, HttpResponse } from "msw"

import type { QueryResult, Stats, TrinoClientProps } from "../src"
import { State, TrinoClient } from "../src"

export const mockUrl = "http://trino-client.company.tld:8080"

export const baseStats: Stats = {
  completedSplits: 19,
  cpuTimeMillis: 16,
  elapsedTimeMillis: 111,
  nodes: 1,
  peakMemoryBytes: 0,
  physicalInputBytes: 0,
  processedBytes: 0,
  processedRows: 0,
  progressPercentage: 100,
  queued: false,
  queuedSplits: 0,
  queuedTimeMillis: 1,
  runningPercentage: 0,
  runningSplits: 0,
  scheduled: true,
  spilledBytes: 0,
  state: State.PLANNING,
  totalSplits: 19,
  wallTimeMillis: 104,
}

export function createClient(
  overrides: Partial<TrinoClientProps> = {}
): TrinoClient {
  return new TrinoClient({
    auth: { password: "vitest", type: "basic", username: "vitest" },
    catalog: "vitest",
    host: "http://trino-client.company.tld",
    port: 8080,
    ...overrides,
  })
}

/**
 * Creates a single-page response handler that returns data on the first stage fetch.
 */
export function singlePageHandlers(data: unknown[][] = [["row1"], ["row2"]]) {
  return [
    http.post(`${mockUrl}/v1/statement`, () =>
      HttpResponse.json({
        id: "q1",
        infoUri: `${mockUrl}/ui/query.html?q1`,
        nextUri: `${mockUrl}/v1/statement/q1/1`,
        stats: baseStats,
        warnings: [],
      } satisfies QueryResult)
    ),
    http.get(`${mockUrl}/v1/statement/q1/1`, () =>
      HttpResponse.json({
        id: "q1",
        infoUri: `${mockUrl}/ui/query.html?q1`,
        columns: [
          {
            name: "col1",
            type: "varchar",
            typeSignature: { rawType: "varchar", arguments: [] },
          },
        ],
        data,
        stats: { ...baseStats, state: State.FINISHED },
        warnings: [],
      } satisfies QueryResult)
    ),
  ]
}

/**
 * Creates a multi-page response handler that returns data across 3 pages.
 */
export function multiPageHandlers() {
  return [
    http.post(`${mockUrl}/v1/statement`, () =>
      HttpResponse.json({
        id: "q1",
        infoUri: `${mockUrl}/ui/query.html?q1`,
        nextUri: `${mockUrl}/v1/statement/q1/1`,
        stats: baseStats,
        warnings: [],
      } satisfies QueryResult)
    ),
    http.get(`${mockUrl}/v1/statement/q1/1`, () =>
      HttpResponse.json({
        id: "q1",
        infoUri: `${mockUrl}/ui/query.html?q1`,
        nextUri: `${mockUrl}/v1/statement/q1/2`,
        columns: [
          {
            name: "col1",
            type: "varchar",
            typeSignature: { rawType: "varchar", arguments: [] },
          },
        ],
        data: [["page1_row1"], ["page1_row2"]],
        stats: { ...baseStats, state: State.RUNNING },
        warnings: [],
      } satisfies QueryResult)
    ),
    http.get(`${mockUrl}/v1/statement/q1/2`, () =>
      HttpResponse.json({
        id: "q1",
        infoUri: `${mockUrl}/ui/query.html?q1`,
        nextUri: `${mockUrl}/v1/statement/q1/3`,
        columns: [
          {
            name: "col1",
            type: "varchar",
            typeSignature: { rawType: "varchar", arguments: [] },
          },
        ],
        data: [["page2_row1"], ["page2_row2"]],
        stats: { ...baseStats, state: State.RUNNING },
        warnings: [],
      } satisfies QueryResult)
    ),
    http.get(`${mockUrl}/v1/statement/q1/3`, () =>
      HttpResponse.json({
        id: "q1",
        infoUri: `${mockUrl}/ui/query.html?q1`,
        columns: [
          {
            name: "col1",
            type: "varchar",
            typeSignature: { rawType: "varchar", arguments: [] },
          },
        ],
        data: [["page3_row1"], ["page3_row2"]],
        stats: { ...baseStats, state: State.FINISHED },
        warnings: [],
      } satisfies QueryResult)
    ),
  ]
}

/**
 * Creates handlers where the initial statement already contains data and also has a nextUri.
 */
export function statementWithDataHandlers() {
  return [
    http.post(`${mockUrl}/v1/statement`, () =>
      HttpResponse.json({
        id: "q1",
        infoUri: `${mockUrl}/ui/query.html?q1`,
        nextUri: `${mockUrl}/v1/statement/q1/1`,
        data: [["stmt_row1"], ["stmt_row2"]],
        stats: { ...baseStats, state: State.RUNNING },
        warnings: [],
      } satisfies QueryResult)
    ),
    http.get(`${mockUrl}/v1/statement/q1/1`, () =>
      HttpResponse.json({
        id: "q1",
        infoUri: `${mockUrl}/ui/query.html?q1`,
        columns: [
          {
            name: "col1",
            type: "varchar",
            typeSignature: { rawType: "varchar", arguments: [] },
          },
        ],
        data: [["next_row1"], ["next_row2"]],
        stats: { ...baseStats, state: State.FINISHED },
        warnings: [],
      } satisfies QueryResult)
    ),
  ]
}

export { http, HttpResponse }
export type { QueryResult, Stats, TrinoClientProps }
export { State }
