import { describe, expect, it } from "vitest"

import {
  ENDPOINT_SCHEMA_VERSION,
  endpointDefinitionSchema,
  isSupportedVersion,
  mutationConfigSchema,
  validatePartitioningString,
  partitioningComponents,
} from "../src/endpoint-schema"

/** Helper to create a minimal valid mutation config for testing */
function validConfig(overrides: Record<string, unknown> = {}) {
  return {
    loadStrategy: "append",
    bucket: "my-bucket",
    basePath: "warehouse/data",
    ...overrides,
  }
}

describe("mutationConfigSchema - partitioning field", () => {
  describe("valid partitioning values", () => {
    it("rejects partitioning: true (no longer a valid value)", () => {
      const result = mutationConfigSchema.safeParse(
        validConfig({ partitioning: true })
      )
      expect(result.success).toBeFalsy()
    })

    it("accepts partitioning: false", () => {
      const result = mutationConfigSchema.safeParse(
        validConfig({ partitioning: false })
      )
      expect(result.success).toBeTruthy()
      expect(String(result.data?.partitioning)).toBe("false")
    })

    it("accepts partitioning as a valid field name string", () => {
      const result = mutationConfigSchema.safeParse(
        validConfig({ partitioning: "event_date" })
      )
      expect(result.success).toBeTruthy()
      expect(result.data?.partitioning).toBe("event_date")
    })

    it("accepts partitioning with underscore-prefixed field name", () => {
      const result = mutationConfigSchema.safeParse(
        validConfig({ partitioning: "_created_at" })
      )
      expect(result.success).toBeTruthy()
      expect(result.data?.partitioning).toBe("_created_at")
    })

    it("defaults partitioning to undefined when omitted", () => {
      const result = mutationConfigSchema.safeParse(validConfig())
      expect(result.success).toBeTruthy()
      expect(result.data?.partitioning).toBeUndefined()
    })
  })

  describe("invalid partitioning values", () => {
    it("rejects a field name starting with a digit", () => {
      const result = mutationConfigSchema.safeParse(
        validConfig({ partitioning: "1invalid_field" })
      )
      expect(result.success).toBeFalsy()
    })

    it("rejects a field name that is too long (>64 chars)", () => {
      const longName = "a".repeat(65)
      const result = mutationConfigSchema.safeParse(
        validConfig({ partitioning: longName })
      )
      expect(result.success).toBeFalsy()
    })

    it("rejects a field name with special characters", () => {
      const result = mutationConfigSchema.safeParse(
        validConfig({ partitioning: "field-name" })
      )
      expect(result.success).toBeFalsy()
    })

    it("rejects a numeric value for partitioning", () => {
      const result = mutationConfigSchema.safeParse(
        validConfig({ partitioning: 42 })
      )
      expect(result.success).toBeFalsy()
    })
  })
})

describe("mutationConfigSchema - removed partitioningFormat key", () => {
  it.each([["year"], ["year/month/day"], [""], ["totally_invalid_format"]])(
    "rejects partitioningFormat %j with an actionable message",
    (format) => {
      const result = mutationConfigSchema.safeParse(
        validConfig({ partitioning: "event_date", partitioningFormat: format })
      )
      expect(result.success).toBeFalsy()
      const issue = result.error?.issues.find(
        (item) => item.path[0] === "partitioningFormat"
      )
      expect(issue?.message).toContain("no longer supported")
      expect(issue?.message).toContain("event:year/event:month/event:day")
    }
  )

  it("rejects partitioningFormat even when partitioning is false", () => {
    const result = mutationConfigSchema.safeParse(
      validConfig({ partitioning: false, partitioningFormat: "year" })
    )
    expect(result.success).toBeFalsy()
  })

  it("accepts a config without partitioningFormat", () => {
    const result = mutationConfigSchema.safeParse(
      validConfig({ partitioning: "event_date" })
    )
    expect(result.success).toBeTruthy()
  })
})

describe("mutationConfigSchema - custom partition format strings", () => {
  describe("valid custom format strings", () => {
    it("accepts composite format: customer_id/event_date:year/event_date:month", () => {
      const result = mutationConfigSchema.safeParse(
        validConfig({
          partitioning: "customer_id/event_date:year/event_date:month",
        })
      )
      expect(result.success).toBeTruthy()
      expect(result.data?.partitioning).toBe(
        "customer_id/event_date:year/event_date:month"
      )
    })

    it("accepts date-only custom format: event_date:year/event_date:month/event_date:day", () => {
      const result = mutationConfigSchema.safeParse(
        validConfig({
          partitioning: "event_date:year/event_date:month/event_date:day",
        })
      )
      expect(result.success).toBeTruthy()
    })

    it("accepts single field with component: event_date:year", () => {
      const result = mutationConfigSchema.safeParse(
        validConfig({ partitioning: "event_date:year" })
      )
      expect(result.success).toBeTruthy()
    })

    it("accepts format with hour/minute/second components", () => {
      const result = mutationConfigSchema.safeParse(
        validConfig({
          partitioning: "ts:year/ts:month/ts:day/ts:hour/ts:minute/ts:second",
        })
      )
      expect(result.success).toBeTruthy()
    })

    it("accepts plain field names separated by /", () => {
      const result = mutationConfigSchema.safeParse(
        validConfig({ partitioning: "region/customer_id" })
      )
      expect(result.success).toBeTruthy()
    })
  })

  describe("invalid custom format strings", () => {
    it("rejects field name starting with digit in custom format", () => {
      const result = mutationConfigSchema.safeParse(
        validConfig({ partitioning: "123invalid/field:year" })
      )
      expect(result.success).toBeFalsy()
    })

    it("rejects invalid date component", () => {
      const result = mutationConfigSchema.safeParse(
        validConfig({ partitioning: "field:badcomponent" })
      )
      expect(result.success).toBeFalsy()
    })

    it("rejects empty segment in format", () => {
      const result = mutationConfigSchema.safeParse(
        validConfig({ partitioning: "customer_id//event_date:year" })
      )
      expect(result.success).toBeFalsy()
    })

    it("rejects segment with multiple colons", () => {
      const result = mutationConfigSchema.safeParse(
        validConfig({ partitioning: "field:year:extra" })
      )
      expect(result.success).toBeFalsy()
    })

    it("rejects field name with special characters in custom format", () => {
      const result = mutationConfigSchema.safeParse(
        validConfig({ partitioning: "field-name/other:year" })
      )
      expect(result.success).toBeFalsy()
    })
  })
})

describe(validatePartitioningString, () => {
  it("returns null for valid single field name", () => {
    expect(validatePartitioningString("event_date")).toBeNull()
  })

  it("returns null for valid custom format", () => {
    expect(
      validatePartitioningString("customer_id/event_date:year/event_date:month")
    ).toBeNull()
  })

  it("returns error for invalid field name (no / or :)", () => {
    const result = validatePartitioningString("123invalid")
    expect(result).not.toBeNull()
    expect(result).toContain("Invalid partition field name")
  })

  it("returns error for invalid component", () => {
    const result = validatePartitioningString("field:badcomponent")
    expect(result).not.toBeNull()
    expect(result).toContain("Invalid date component")
  })

  it("returns error for empty segment", () => {
    const result = validatePartitioningString("field//other")
    expect(result).not.toBeNull()
    expect(result).toContain("empty segment")
  })
})

/** Minimal valid endpoint definition for exercising the optional dataSource field. */
function validDefinition(overrides: Record<string, unknown> = {}) {
  return {
    version: "2.0",
    tableName: "test_table",
    catalog: "my_catalog",
    schema: "my_schema",
    fields: [{ name: "id", type: "String" }],
    ...overrides,
  }
}

describe("endpointDefinitionSchema - dataSource field", () => {
  it("accepts a non-empty dataSource string", () => {
    const result = endpointDefinitionSchema.safeParse(
      validDefinition({ dataSource: "trino" })
    )
    expect(result.success).toBeTruthy()
    expect(result.data?.dataSource).toBe("trino")
  })

  it("accepts a definition without dataSource (undefined)", () => {
    const result = endpointDefinitionSchema.safeParse(validDefinition())
    expect(result.success).toBeTruthy()
    expect(result.data?.dataSource).toBeUndefined()
  })

  it("rejects an empty dataSource string", () => {
    const result = endpointDefinitionSchema.safeParse(
      validDefinition({ dataSource: "" })
    )
    expect(result.success).toBeFalsy()
  })
})

describe("partitioningComponents constant", () => {
  it("contains all expected date components", () => {
    expect(partitioningComponents).toStrictEqual([
      "year",
      "month",
      "day",
      "hour",
      "minute",
      "second",
    ])
  })
})

describe("endpointDefinitionSchema - version gate", () => {
  it("exposes ENDPOINT_SCHEMA_VERSION as '2.0'", () => {
    expect(ENDPOINT_SCHEMA_VERSION).toBe("2.0")
  })

  it("isSupportedVersion accepts '2.0' and rejects '1.0'/others", () => {
    expect(isSupportedVersion("2.0")).toBeTruthy()
    expect(isSupportedVersion("1.0")).toBeFalsy()
    expect(isSupportedVersion(undefined)).toBeFalsy()
    expect(isSupportedVersion(2)).toBeFalsy()
  })

  it("rejects a definition with version '1.0'", () => {
    const result = endpointDefinitionSchema.safeParse(
      validDefinition({ version: "1.0" })
    )
    expect(result.success).toBeFalsy()
  })

  it("accepts a definition with version '2.0'", () => {
    const result = endpointDefinitionSchema.safeParse(validDefinition())
    expect(result.success).toBeTruthy()
  })
})

describe("endpointDefinitionSchema - partitioning union", () => {
  it("rejects a mutation with partitioning: true", () => {
    const result = endpointDefinitionSchema.safeParse(
      validDefinition({
        mutation: {
          loadStrategy: "append",
          basePath: "/",
          partitioning: true,
        },
      })
    )
    expect(result.success).toBeFalsy()
  })
})

describe("endpointDefinitionSchema - partition segment vs field type", () => {
  const fields = [
    { name: "region", type: "String" },
    { name: "tenant_id", type: "Integer" },
    { name: "event", type: "DateTime" },
    { name: "day_of", type: "Date" },
    { name: "dup", type: "String" },
    { name: "dup", type: "DateTime" },
  ]

  function parse(partitioning: string, extra: Record<string, unknown> = {}) {
    return endpointDefinitionSchema.safeParse(
      validDefinition({
        fields,
        mutation: {
          loadStrategy: "append",
          basePath: "/",
          partitioning,
          ...extra,
        },
      })
    )
  }

  function messages(partitioning: string) {
    return (parse(partitioning).error?.issues ?? []).map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }))
  }

  it("rejects mutation.partitioningFormat with path and message", () => {
    const result = parse("region", { partitioningFormat: "year" })
    expect(result.success).toBeFalsy()
    const issue = result.error?.issues.find(
      (item) => item.path.join(".") === "mutation.partitioningFormat"
    )
    expect(issue?.message).toContain("no longer supported")
  })

  it.each(["region", "tenant_id", "region/tenant_id"])(
    "accepts bare non-date segment %s",
    (value) => {
      expect(parse(value).success).toBeTruthy()
    }
  )

  it.each(["event", "day_of"])(
    "rejects bare date segment %s and points at the component form",
    (value) => {
      const issues = messages(value)
      expect(issues).toHaveLength(1)
      expect(issues[0]?.path).toBe("mutation.partitioning")
      expect(issues[0]?.message).toContain(`"${value}:year"`)
    }
  )

  it("rejects a component on a non-date field", () => {
    const issues = messages("region:year")
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toContain("only valid on Date/DateTime")
  })

  it("accepts components on DateTime and Date fields", () => {
    expect(parse("event:year/event:month/day_of:day").success).toBeTruthy()
  })

  it("accepts time components on a DateTime field", () => {
    expect(parse("event:hour/event:minute/event:second").success).toBeTruthy()
  })

  it.each(["hour", "minute", "second"])(
    "rejects time component %s on a Date field",
    (component) => {
      const issues = messages(`day_of:${component}`)
      expect(issues).toHaveLength(1)
      expect(issues[0]?.path).toBe("mutation.partitioning")
      expect(issues[0]?.message).toContain("year, month, day")
    }
  )

  it("reports an unknown component on a Date field only once", () => {
    expect(messages("day_of:week")).toHaveLength(1)
  })

  it("adds no extra issue for unknown, ambiguous or duplicate segments", () => {
    expect(parse("missing").success).toBeTruthy()
    expect(parse("dup").success).toBeTruthy()
    expect(parse("region/region").success).toBeTruthy()
  })
})
/** DateTime auto-fill field with the write_timestamp option. */
function autoFillField(name = "load_timestamp") {
  return {
    name,
    type: "DateTime",
    options: { autoFill: "write_timestamp" },
  }
}

/** Enabled append mutation with the given partitioning value. */
function appendMutation(partitioning: unknown = false) {
  return { loadStrategy: "append", basePath: "/", partitioning }
}

describe("endpointDefinitionSchema - autoFill field contract", () => {
  it("accepts a top-level DateTime autoFill field under an append mutation", () => {
    const result = endpointDefinitionSchema.safeParse(
      validDefinition({
        fields: [{ name: "id", type: "String" }, autoFillField()],
        mutation: appendMutation(false),
      })
    )
    expect(result.success).toBeTruthy()
  })

  it("accepts a top-level DateTime autoFill field under full_load_append", () => {
    const result = endpointDefinitionSchema.safeParse(
      validDefinition({
        fields: [{ name: "id", type: "String" }, autoFillField()],
        mutation: {
          loadStrategy: "full_load_append",
          basePath: "/",
          partitioning: false,
        },
      })
    )
    expect(result.success).toBeTruthy()
  })

  it.each(["String", "Integer", "Float", "Boolean", "Date"])(
    "rejects autoFill on a non-DateTime primitive (%s) without silently stripping the key",
    (type) => {
      const result = endpointDefinitionSchema.safeParse(
        validDefinition({
          fields: [
            { name: "field", type, options: { autoFill: "write_timestamp" } },
          ],
          mutation: appendMutation(false),
        })
      )
      expect(result.success).toBeFalsy()
    }
  )

  it("rejects autoFill on an Object field", () => {
    const result = endpointDefinitionSchema.safeParse(
      validDefinition({
        fields: [
          {
            name: "nested",
            type: "Object",
            fields: [{ name: "inner", type: "String" }],
            options: { autoFill: "write_timestamp" },
          },
        ],
        mutation: appendMutation(false),
      })
    )
    expect(result.success).toBeFalsy()
  })

  it("rejects autoFill on an Array field", () => {
    const result = endpointDefinitionSchema.safeParse(
      validDefinition({
        fields: [
          {
            name: "tags",
            type: "Array",
            items: { type: "String" },
            options: { autoFill: "write_timestamp" },
          },
        ],
        mutation: appendMutation(false),
      })
    )
    expect(result.success).toBeFalsy()
  })
})

describe("endpointDefinitionSchema - autoFill top-level-only rule", () => {
  it("rejects a nested autoFill field at depth 1 (inside an Object)", () => {
    const result = endpointDefinitionSchema.safeParse(
      validDefinition({
        fields: [
          {
            name: "nested",
            type: "Object",
            fields: [autoFillField("inner_ts")],
          },
        ],
        mutation: appendMutation(false),
      })
    )
    expect(result.success).toBeFalsy()
  })

  it("rejects a nested autoFill field at depth 2 (inside an Array-of-Object)", () => {
    const result = endpointDefinitionSchema.safeParse(
      validDefinition({
        fields: [
          {
            name: "rows",
            type: "Array",
            items: {
              type: "Object",
              fields: [autoFillField("inner_ts")],
            },
          },
        ],
        mutation: appendMutation(false),
      })
    )
    expect(result.success).toBeFalsy()
  })
})

describe("endpointDefinitionSchema - autoFill mutation requirement", () => {
  it("rejects autoFill with loadStrategy full_load (C11)", () => {
    const result = endpointDefinitionSchema.safeParse(
      validDefinition({
        fields: [autoFillField()],
        mutation: {
          loadStrategy: "full_load",
          basePath: "/",
          partitioning: false,
        },
      })
    )
    expect(result.success).toBeFalsy()
  })

  it("rejects autoFill with mutation disabled (false) (C16)", () => {
    const result = endpointDefinitionSchema.safeParse(
      validDefinition({
        fields: [autoFillField()],
        mutation: false,
      })
    )
    expect(result.success).toBeFalsy()
  })

  it("rejects autoFill with an absent mutation (C16)", () => {
    const result = endpointDefinitionSchema.safeParse(
      validDefinition({
        fields: [autoFillField()],
      })
    )
    expect(result.success).toBeFalsy()
  })
})

describe("endpointDefinitionSchema - autoFill name-length cap", () => {
  it("accepts a 58-character autoFill field name", () => {
    const result = endpointDefinitionSchema.safeParse(
      validDefinition({
        fields: [autoFillField("a".repeat(58))],
        mutation: appendMutation(false),
      })
    )
    expect(result.success).toBeTruthy()
  })

  it("rejects a 59-character autoFill field name", () => {
    const result = endpointDefinitionSchema.safeParse(
      validDefinition({
        fields: [autoFillField("a".repeat(59))],
        mutation: appendMutation(false),
      })
    )
    expect(result.success).toBeFalsy()
  })
})

describe("endpointDefinitionSchema - companion partition segment rejection", () => {
  it("rejects a bare companion segment (load_timestamp_year)", () => {
    const result = endpointDefinitionSchema.safeParse(
      validDefinition({
        fields: [autoFillField()],
        mutation: appendMutation("load_timestamp_year"),
      })
    )
    expect(result.success).toBeFalsy()
  })

  it("rejects a component companion segment (load_timestamp_year:year)", () => {
    const result = endpointDefinitionSchema.safeParse(
      validDefinition({
        fields: [autoFillField()],
        mutation: appendMutation(
          "load_timestamp_year:year/load_timestamp:month"
        ),
      })
    )
    expect(result.success).toBeFalsy()
  })

  it("accepts the primary-field component form (load_timestamp:year)", () => {
    const result = endpointDefinitionSchema.safeParse(
      validDefinition({
        fields: [autoFillField()],
        mutation: appendMutation("load_timestamp:year/load_timestamp:month"),
      })
    )
    expect(result.success).toBeTruthy()
  })
})
