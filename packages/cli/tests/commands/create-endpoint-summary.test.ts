import { describe, expect, it } from "vitest"

import type { EndpointDefinitionFormat } from "@/pipeline/schema"

/**
 * Replicates the summary logic from create-endpoint.ts:
 * const mutationDisplay = definition.mutation
 *   ? definition.mutation.loadStrategy
 *   : "disabled"
 */
function getMutationDisplay(definition: EndpointDefinitionFormat): string {
  return definition.mutation ? definition.mutation.loadStrategy : "disabled"
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
      version: "1.0",
      tableName: "user_events",
      catalog: "analytics",
      schema: "tracking",
      fields: [{ name: "id", type: "String" }],
      mutation: {
        loadStrategy: "full_load",
        type: "s3",
        bucket: "analytics-datalake",
        basePath: "warehouse/analytics/user_events",
      },
    }

    expect(getMutationDisplay(definition)).toBe("full_load")
  })

  it("displays load strategy when mutation config is present with full_load_append", () => {
    const definition: EndpointDefinitionFormat = {
      version: "1.0",
      tableName: "orders",
      catalog: "commerce",
      schema: "sales",
      fields: [{ name: "order_id", type: "String" }],
      mutation: {
        loadStrategy: "full_load_append",
        type: "s3",
        bucket: "commerce-datalake",
        basePath: "warehouse/sales/orders",
      },
    }

    expect(getMutationDisplay(definition)).toBe("full_load_append")
  })

  it("displays load strategy when mutation config is present with append", () => {
    const definition: EndpointDefinitionFormat = {
      version: "1.0",
      tableName: "events",
      catalog: "logs",
      schema: "ingestion",
      fields: [{ name: "event", type: "String" }],
      mutation: {
        loadStrategy: "append",
        type: "s3",
        bucket: "logs-datalake",
        basePath: "warehouse/logs/events",
      },
    }

    expect(getMutationDisplay(definition)).toBe("append")
  })

  it("displays 'disabled' when mutation is false", () => {
    const definition: EndpointDefinitionFormat = {
      version: "1.0",
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
      version: "1.0",
      tableName: "user_events",
      catalog: "analytics",
      schema: "tracking",
      fields: [{ name: "id", type: "String" }],
    }

    expect(getMutationDisplay(definition)).toBe("disabled")
  })
})
