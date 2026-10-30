import type { FabricClient } from "@lakeql/fabric-client"
import { describe, expect, it, vi } from "vitest"

import { FabricDataSource } from "../src/adapter"

interface CapturedQuery {
  sql: string
}

/**
 * Builds a fake FabricClient whose `query` records the SQL it receives and
 * returns the supplied rows.
 */
function createFakeClient(rows: Record<string, unknown>[] = []): {
  client: FabricClient
  calls: CapturedQuery[]
} {
  const calls: CapturedQuery[] = []
  const query = vi.fn<(props: { sql: string }) => Promise<unknown[]>>(
    (props) => {
      calls.push({ sql: props.sql })
      return Promise.resolve(rows)
    }
  )
  const client = {
    query,
    close: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  }
  return { client: client as unknown as FabricClient, calls }
}

describe(FabricDataSource, () => {
  describe("schemas()", () => {
    it("selects schema_name from the catalog's INFORMATION_SCHEMA.SCHEMATA", async () => {
      const { client, calls } = createFakeClient()
      const ds = new FabricDataSource(client, "fabric-source")

      await ds.schemas("Processed_LH")

      expect(calls[0]?.sql).toContain(
        "[Processed_LH].INFORMATION_SCHEMA.SCHEMATA"
      )
    })

    it("excludes system schemas via a NOT IN filter", async () => {
      const { client, calls } = createFakeClient()
      const ds = new FabricDataSource(client, "fabric-source")

      await ds.schemas("Processed_LH")
      const { sql } = calls[0] ?? { sql: "" }

      expect(sql).toContain("schema_name NOT IN (")
      for (const name of [
        "sys",
        "INFORMATION_SCHEMA",
        "guest",
        "queryinsights",
        "_rsc",
      ]) {
        expect(sql).toContain(`'${name}'`)
      }
    })

    it("excludes db_* role schemas via a LIKE predicate", async () => {
      const { client, calls } = createFakeClient()
      const ds = new FabricDataSource(client, "fabric-source")

      await ds.schemas("Processed_LH")

      expect(calls[0]?.sql).toContain("schema_name NOT LIKE 'db[_]%'")
    })

    it("maps schema_name from returned rows", async () => {
      const { client } = createFakeClient([
        { schema_name: "open_lake" },
        { schema_name: "analytics" },
      ])
      const ds = new FabricDataSource(client, "fabric-source")

      const result = await ds.schemas("Processed_LH")

      expect(result).toStrictEqual(["open_lake", "analytics"])
    })
  })
})
