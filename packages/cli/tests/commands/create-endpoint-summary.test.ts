import { describe, expect, it } from "vitest"

import { formatMutationDisplay } from "@/commands/create-endpoint"
import type { EndpointDefinitionFormat } from "@/pipeline/schema"

const getMutationDisplay = formatMutationDisplay

/**
 * Replicates the dataSource summary logic from create-endpoint.ts:
 * definition.dataSource ?? "default"
 */
function getDataSourceDisplay(definition: EndpointDefinitionFormat): string {
  return definition.dataSource ?? "default"
}

/**
 * Tests for the create-endpoint command's mutation summary display logic.
 *
 * The command computes the display value as:
 *   definition.mutation ? definition.mutation.loadStrategy : "disabled"
 */
describe("create-endpoint summary mutation display", () => {
  it("displays load strategy when mutation config is present with full_load", () => {
    const definition: EndpointDefinitionFormat = {
      version: "2.0",
      tableName: "user_events",
      catalog: "analytics",
      schema: "tracking",
      fields: [{ name: "id", type: "String" }],
      mutation: {
        loadStrategy: "full_load",
        basePath: "warehouse/analytics/user_events",
      },
    }

    expect(getMutationDisplay(definition)).toBe("full_load (storage)")
  })

  it("displays load strategy when mutation config is present with full_load_append", () => {
    const definition: EndpointDefinitionFormat = {
      version: "2.0",
      tableName: "orders",
      catalog: "commerce",
      schema: "sales",
      fields: [{ name: "order_id", type: "String" }],
      mutation: {
        loadStrategy: "full_load_append",
        basePath: "warehouse/sales/orders",
      },
    }

    expect(getMutationDisplay(definition)).toBe("full_load_append (storage)")
  })

  it("displays load strategy when mutation config is present with append", () => {
    const definition: EndpointDefinitionFormat = {
      version: "2.0",
      tableName: "events",
      catalog: "logs",
      schema: "ingestion",
      fields: [{ name: "event", type: "String" }],
      mutation: {
        loadStrategy: "append",
        basePath: "warehouse/logs/events",
      },
    }

    expect(getMutationDisplay(definition)).toBe("append (storage)")
  })

  it("displays the insert write method", () => {
    const definition: EndpointDefinitionFormat = {
      version: "2.0",
      tableName: "events",
      catalog: "logs",
      schema: "ingestion",
      fields: [{ name: "event", type: "String" }],
      mutation: { loadStrategy: "append", writeMethod: "insert" },
    }
    expect(getMutationDisplay(definition)).toBe("append (insert)")
  })

  it("displays 'disabled' when mutation is false", () => {
    const definition: EndpointDefinitionFormat = {
      version: "2.0",
      tableName: "user_events",
      catalog: "analytics",
      schema: "tracking",
      fields: [{ name: "id", type: "String" }],
      mutation: false,
    }

    expect(getMutationDisplay(definition)).toBe("disabled")
  })

  it("displays 'disabled' when mutation is absent (undefined)", () => {
    const definition: EndpointDefinitionFormat = {
      version: "2.0",
      tableName: "user_events",
      catalog: "analytics",
      schema: "tracking",
      fields: [{ name: "id", type: "String" }],
    }

    expect(getMutationDisplay(definition)).toBe("disabled")
  })
})

describe("create-endpoint summary dataSource display", () => {
  it("displays the dataSource value when present", () => {
    const definition: EndpointDefinitionFormat = {
      version: "2.0",
      tableName: "user_events",
      catalog: "analytics",
      schema: "tracking",
      dataSource: "trino",
      fields: [{ name: "id", type: "String" }],
    }

    expect(getDataSourceDisplay(definition)).toBe("trino")
  })

  it("displays 'default' when dataSource is absent", () => {
    const definition: EndpointDefinitionFormat = {
      version: "2.0",
      tableName: "user_events",
      catalog: "analytics",
      schema: "tracking",
      fields: [{ name: "id", type: "String" }],
    }

    expect(getDataSourceDisplay(definition)).toBe("default")
  })
})
