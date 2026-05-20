import { http, HttpResponse } from "msw"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest"

import type { QueryResult, Stats, TrinoClientProps } from "../src"
import { TrinoClient } from "../src"
import { State } from "../src/const"

type MockResponse = Record<
  string,
  {
    status: number
    data?: QueryResult | null
  }
>

const mockUrl = "http://trino-client.company.tld:8080"

const baseStats: Stats = {
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

const statementResponse: MockResponse = {
  testcase1: {
    data: {
      id: "testcase1",
      infoUri: `${mockUrl}/ui/query.html?testcase1`,
      nextUri: `${mockUrl}/v1/statement/testcase1/1`,
      stats: baseStats,
      warnings: [],
    },
    status: 200,
  },
  testcase2: {
    data: {
      id: "testcase3",
      infoUri: `${mockUrl}/ui/query.html?testcase2`,
      nextUri: `${mockUrl}/v1/statement/testcase2/1`,
      stats: baseStats,
      warnings: [],
    },
    status: 200,
  },
  testcase3: {
    data: {
      id: "testcase3",
      infoUri: `${mockUrl}/ui/query.html?testcase3`,
      nextUri: `${mockUrl}/v1/statement/testcase3/1`,
      stats: baseStats,
      warnings: [],
    },
    status: 200,
  },
  testcase4: {
    data: {
      id: "testcase4",
      infoUri: `${mockUrl}/ui/query.html?testcase4`,
      stats: baseStats,
      warnings: [],
    },
    status: 401,
  },
  testcase5: {
    data: {
      data: [["statement_data1"], ["statement_data2"]],
      id: "testcase5",
      infoUri: `${mockUrl}/ui/query.html?testcase5`,
      nextUri: `${mockUrl}/v1/statement/testcase5/1`,
      stats: {
        ...baseStats,
        state: State.FINISHED,
      },
      warnings: [],
    },
    status: 200,
  },
  unknown: {
    data: null,
    status: 500,
  },
}

const statsTemplate: Record<State, Stats> = {
  CANCELED: {
    ...baseStats,
    state: State.CANCELED,
  },

  FAILED: {
    ...baseStats,
    state: State.FAILED,
  },

  FINISHED: {
    ...baseStats,
    state: State.FINISHED,
  },

  PLANNING: {
    ...baseStats,
    state: State.PLANNING,
  },

  QUEUED: {
    ...baseStats,
    state: State.QUEUED,
  },

  RUNNING: {
    ...baseStats,
    state: State.RUNNING,
  },

  STARTING: {
    ...baseStats,
    state: State.STARTING,
  },
}

// Response example is based on / powered by
// https://pulsar.apache.org/docs/3.0.x/sql-rest-api/
const stageResponse: MockResponse = {
  testcase1_1: {
    data: {
      columns: [
        {
          name: "Catalog",
          type: "varchar(6)",
          typeSignature: {
            arguments: [
              {
                kind: "LONG_LITERAL",
                value: 6,
              },
            ],
            rawType: "varchar",
          },
        },
      ],
      data: [["testcase_data1"], ["testcase_data2"]],
      id: "testcase1",
      infoUri: `${mockUrl}/ui/query.html?testcase1`,
      stats: statsTemplate.FINISHED,
      warnings: [],
    },
    status: 200,
  },

  testcase2_1: {
    data: {
      columns: [
        {
          name: "Catalog",
          type: "varchar(6)",
          typeSignature: {
            arguments: [
              {
                kind: "LONG_LITERAL",
                value: 6,
              },
            ],
            rawType: "varchar",
          },
        },
      ],
      data: [["testcase_data1"], ["testcase_data2"]],
      id: "testcase2",
      infoUri: `${mockUrl}/ui/query.html?testcase2`,
      nextUri: `${mockUrl}/v1/statement/testcase2/2`,
      stats: statsTemplate.RUNNING,
      warnings: [],
    },
    status: 200,
  },
  testcase2_2: {
    data: {
      columns: [
        {
          name: "Catalog",
          type: "varchar(6)",
          typeSignature: {
            arguments: [
              {
                kind: "LONG_LITERAL",
                value: 6,
              },
            ],
            rawType: "varchar",
          },
        },
      ],
      data: [["testcase_data3"], ["testcase_data4"]],
      id: "testcase2",
      infoUri: `${mockUrl}/ui/query.html?testcase2`,
      nextUri: `${mockUrl}/v1/statement/testcase2/3`,
      stats: statsTemplate.RUNNING,
      warnings: [],
    },
    status: 200,
  },
  testcase2_3: {
    data: {
      columns: [
        {
          name: "Catalog",
          type: "varchar(6)",
          typeSignature: {
            arguments: [
              {
                kind: "LONG_LITERAL",
                value: 6,
              },
            ],
            rawType: "varchar",
          },
        },
      ],
      data: [["testcase_data5"], ["testcase_data6"]],
      id: "testcase2",
      infoUri: `${mockUrl}/ui/query.html?testcase2`,
      stats: statsTemplate.FINISHED,
      warnings: [],
    },
    status: 200,
  },

  testcase3_1: {
    data: {
      error: {
        errorCode: 1,
        errorLocation: {
          columnNumber: 1,
          lineNumber: 1,
        },
        errorName: "errorName",
        errorType: "errorType",
        failureInfo: {
          cause: { stack: [], suppressed: [], type: "causeType" },
          errorLocation: { columnNumber: 1, lineNumber: 1 },
          message: "",
          stack: [],
          suppressed: [],
          type: "",
        },
        message: "errorMessage",
      },
      id: "testcase3",
      infoUri: `${mockUrl}/ui/query.html?testcase3`,
      stats: statsTemplate.FAILED,
      warnings: [],
    },
    status: 200,
  },

  testcase5_1: {
    data: {
      data: [["stage_data1"], ["stage_data2"]],
      id: "testcase5",
      infoUri: `${mockUrl}/ui/query.html?testcase5`,
      stats: statsTemplate.FINISHED,
      warnings: [],
    },
    status: 200,
  },
}

const handlers = [
  http.post(
    "http://trino-client.company.tld:8080/v1/statement",
    ({ request }) => {
      const statement = request.headers.get("x-vitest-statement") ?? "unknown"

      const response = statementResponse[statement]
      return HttpResponse.json(response?.data, { status: response?.status })
    }
  ),
  http.get(
    "http://trino-client.company.tld:8080/v1/statement/:queryId/:stage",
    ({ params }) => {
      const { queryId, stage } = params
      const response = stageResponse[`${queryId as string}_${stage as string}`]

      return HttpResponse.json(response?.data, { status: response?.status })
    }
  ),
]

const server = setupServer(...handlers)
describe("Trino Client - tests", () => {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }))

  // Reset handlers after each test `important for test isolation`
  afterEach(() => server.resetHandlers())

  //  Close server after all tests
  afterAll(() => server.close())

  describe("Trino Client - Header", () => {
    const headerCases = [
      {
        expected: {
          authorization: "Basic dml0ZXN0OnZpdGVzdA==",
          "x-trino-catalog": "vitest_catalog",
          "x-trino-schema": "vitest_schema",
          "x-trino-source": "vitest_source",
        },
        name: "w/ catalog, w/ schema, w/ source",
        tcHeaders: {
          catalog: "vitest_catalog",
          schema: "vitest_schema",
          source: "vitest_source",
        },
      },
      {
        expected: {
          authorization: "Basic dml0ZXN0OnZpdGVzdA==",
          "x-trino-catalog": "vitest_catalog",
          "x-trino-schema": "vitest_schema",
          "x-trino-source": "nodejs",
        },
        name: "w/ catalog, w/ schema, w/o source",
        tcHeaders: {
          catalog: "vitest_catalog",
          schema: "vitest_schema",
        },
      },
      {
        expected: {
          authorization: "Basic dml0ZXN0OnZpdGVzdA==",
          "x-trino-catalog": "vitest_catalog",
          "x-trino-source": "nodejs",
        },
        name: "w/ catalog, w/o schema, w/o source",
        tcHeaders: {
          catalog: "vitest_catalog",
        },
      },
    ]
    test.each(headerCases)("$name", ({ tcHeaders, expected }) => {
      const config: TrinoClientProps = {
        auth: {
          password: "vitest",
          type: "basic",
          username: "vitest",
        },
        host: "localhost",
        port: 1234,
        ...tcHeaders,
      }
      const client = new TrinoClient(config)

      const headers = client.getHeaders()

      expect(headers).toStrictEqual(expected)
    })
  })

  describe("Trino CLient - API", () => {
    test("testcase1 - one stage", async () => {
      const client = new TrinoClient({
        auth: {
          password: "vitest",
          type: "basic",
          username: "vitest",
        },
        catalog: "vitest",
        host: "http://trino-client.company.tld",
        port: 8080,
      })

      client.setRawHeader("x-vitest-statement", "testcase1")

      const resp = await client.query({ sql: "some query" })

      expect(resp).toStrictEqual([["testcase_data1"], ["testcase_data2"]])
    })

    test("stream method", async () => {
      const client = new TrinoClient({
        auth: {
          password: "vitest",
          type: "basic",
          username: "vitest",
        },
        catalog: "vitest",
        host: "http://trino-client.company.tld",
        port: 8080,
      })

      client.setRawHeader("x-vitest-statement", "testcase2")

      const stream = await client.stream({ sql: "some query" })
      const results = []

      for await (const data of stream) {
        results.push(data)
      }

      expect(results).toStrictEqual([
        ["testcase_data1"],
        ["testcase_data2"],
        ["testcase_data3"],
        ["testcase_data4"],
        ["testcase_data5"],
        ["testcase_data6"],
      ])
    })

    test("testcase2 - multiple stage", async () => {
      const client = new TrinoClient({
        auth: {
          password: "vitest",
          type: "basic",
          username: "vitest",
        },
        catalog: "vitest",
        host: "http://trino-client.company.tld",
        port: 8080,
      })

      client.setRawHeader("x-vitest-statement", "testcase2")

      const resp = await client.query({ sql: "some query" })

      expect(resp).toStrictEqual([
        ["testcase_data1"],
        ["testcase_data2"],
        ["testcase_data3"],
        ["testcase_data4"],
        ["testcase_data5"],
        ["testcase_data6"],
      ])
    })

    test("testcase5 - keeps statement data and follows nextUri on FINISHED", async () => {
      const client = new TrinoClient({
        auth: {
          password: "vitest",
          type: "basic",
          username: "vitest",
        },
        catalog: "vitest",
        host: "http://trino-client.company.tld",
        port: 8080,
      })

      client.setRawHeader("x-vitest-statement", "testcase5")

      const resp = await client.query({ sql: "some query" })

      expect(resp).toStrictEqual([
        ["statement_data1"],
        ["statement_data2"],
        ["stage_data1"],
        ["stage_data2"],
      ])
    })

    test("stream method keeps statement data", async () => {
      const client = new TrinoClient({
        auth: {
          password: "vitest",
          type: "basic",
          username: "vitest",
        },
        catalog: "vitest",
        host: "http://trino-client.company.tld",
        port: 8080,
      })

      client.setRawHeader("x-vitest-statement", "testcase5")

      const stream = await client.stream({ sql: "some query" })
      const results = []

      for await (const data of stream) {
        results.push(data)
      }

      expect(results).toStrictEqual([
        ["statement_data1"],
        ["statement_data2"],
        ["stage_data1"],
        ["stage_data2"],
      ])
    })

    test("testcase3 - failed", async () => {
      const client = new TrinoClient({
        auth: {
          password: "vitest",
          type: "basic",
          username: "vitest",
        },
        catalog: "vitest",
        host: "http://trino-client.company.tld",
        port: 8080,
      })

      client.setRawHeader("x-vitest-statement", "testcase3")

      const resp = await client.query({ sql: "some query" })

      expect(resp).toStrictEqual([])
    })

    test("testcase4 - unauthorized", async () => {
      const client = new TrinoClient({
        auth: {
          password: "vitest",
          type: "basic",
          username: "vitest",
        },
        catalog: "vitest",
        host: "http://trino-client.company.tld",
        port: 8080,
      })

      client.setRawHeader("x-vitest-statement", "testcase4")

      const resp = async () => await client.query({ sql: "some query" })

      await expect(resp()).rejects.toThrow("Unauthorized")
    })

    test("query with impersonateAs", async () => {
      // Create a spy on the http.post handler to check headers
      let capturedHeaders = null
      const [originalHandler] = handlers

      // Replace the handler temporarily to capture headers
      server.use(
        http.post(
          "http://trino-client.company.tld:8080/v1/statement",
          ({ request }) => {
            // Capture the headers
            capturedHeaders = Object.fromEntries(request.headers)

            // Call the original handler logic
            const statement =
              request.headers.get("x-vitest-statement") ?? "unknown"
            const response = statementResponse[statement]

            return HttpResponse.json(response?.data, {
              status: response?.status,
            })
          }
        )
      )

      const client = new TrinoClient({
        auth: {
          password: "vitest",
          type: "basic",
          username: "vitest",
        },
        catalog: "vitest",
        host: "http://trino-client.company.tld",
        port: 8080,
      })

      client.setRawHeader("x-vitest-statement", "testcase1")

      const resp = await client.query({
        impersonateAs: "impersonated_user",
        sql: "some query",
      })

      // Verify the impersonateAs header was included in the request
      expect(capturedHeaders).toBeDefined()
      expect(capturedHeaders?.["x-trino-user"]).toBe("impersonated_user")
      expect(resp).toStrictEqual([["testcase_data1"], ["testcase_data2"]])

      // Restore the original handler
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      server.use(originalHandler!)
    })

    test("schemas method", async () => {
      const client = new TrinoClient({
        auth: {
          password: "vitest",
          type: "basic",
          username: "vitest",
        },
        catalog: "vitest",
        host: "http://trino-client.company.tld",
        port: 8080,
      })

      client.setRawHeader("x-vitest-statement", "testcase1")

      const schemas = await client.schemas({ catalog: "test_catalog" })
      expect(schemas).toStrictEqual(["testcase_data1", "testcase_data2"])
    })

    test("tables method", async () => {
      const client = new TrinoClient({
        auth: {
          password: "vitest",
          type: "basic",
          username: "vitest",
        },
        catalog: "vitest",
        host: "http://trino-client.company.tld",
        port: 8080,
      })

      client.setRawHeader("x-vitest-statement", "testcase1")

      const tables = await client.tables({
        catalog: "test_catalog",
        schema: "test_schema",
      })
      expect(tables).toStrictEqual(["testcase_data1", "testcase_data2"])
    })

    test("views method", async () => {
      const client = new TrinoClient({
        auth: {
          password: "vitest",
          type: "basic",
          username: "vitest",
        },
        catalog: "vitest",
        host: "http://trino-client.company.tld",
        port: 8080,
      })

      client.setRawHeader("x-vitest-statement", "testcase1")

      const views = await client.views({
        catalog: "test_catalog",
        schema: "test_schema",
      })
      expect(views).toStrictEqual(["testcase_data1", "testcase_data2"])
    })

    test("columns method", async () => {
      const client = new TrinoClient({
        auth: {
          password: "vitest",
          type: "basic",
          username: "vitest",
        },
        catalog: "vitest",
        host: "http://trino-client.company.tld",
        port: 8080,
      })

      client.setRawHeader("x-vitest-statement", "testcase1")

      const columns = await client.columns({
        catalog: "test_catalog",
        schema: "test_schema",
        table: "test_table",
      })
      expect(columns).toStrictEqual([["testcase_data1"], ["testcase_data2"]])
    })

    test("runStatement with error", async () => {
      const client = new TrinoClient({
        auth: {
          password: "vitest",
          type: "basic",
          username: "vitest",
        },
        catalog: "vitest",
        host: "http://trino-client.company.tld",
        port: 8080,
      })

      client.setRawHeader("x-vitest-statement", "testcase4")

      const runStatement = async () => {
        // @ts-expect-error - accessing private method for testing
        await client.runStatement({ sql: "some query" })
      }

      await expect(runStatement()).rejects.toThrow("401 - Unauthorized")
    })
  })
})
