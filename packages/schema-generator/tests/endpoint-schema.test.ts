import { describe, expect, it } from "vitest"

import {
  mutationConfigSchema,
  partitioningFormats,
  validatePartitioningFormat,
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
    it("accepts partitioning: true", () => {
      const result = mutationConfigSchema.safeParse(
        validConfig({ partitioning: true })
      )
      expect(result.success).toBeTruthy()
      expect(String(result.data?.partitioning)).toBe("true")
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

describe("mutationConfigSchema - partitioningFormat field", () => {
  describe("valid format values when partitioning is not false", () => {
    it.each(partitioningFormats)(
      'accepts partitioningFormat: "%s"',
      (format) => {
        const result = mutationConfigSchema.safeParse(
          validConfig({ partitioning: true, partitioningFormat: format })
        )
        expect(result.success).toBeTruthy()
        expect(result.data?.partitioningFormat).toBe(format)
      }
    )

    it("leaves partitioningFormat as undefined when omitted", () => {
      const result = mutationConfigSchema.safeParse(
        validConfig({ partitioning: true })
      )
      expect(result.success).toBeTruthy()
      expect(result.data?.partitioningFormat).toBeUndefined()
    })
  })

  describe("invalid format values when partitioning is not false", () => {
    it("rejects an invalid format string when partitioning is true", () => {
      const result = mutationConfigSchema.safeParse(
        validConfig({
          partitioning: true,
          partitioningFormat: "day/month/year",
        })
      )
      expect(result.success).toBeFalsy()
    })

    it("rejects an invalid format string when partitioning is a field name", () => {
      const result = mutationConfigSchema.safeParse(
        validConfig({
          partitioning: "event_date",
          partitioningFormat: "invalid",
        })
      )
      expect(result.success).toBeFalsy()
    })
  })

  describe("format validation skipped when partitioning is false", () => {
    it("accepts any format value when partitioning is false", () => {
      const result = mutationConfigSchema.safeParse(
        validConfig({
          partitioning: false,
          partitioningFormat: "totally_invalid_format",
        })
      )
      expect(result.success).toBeTruthy()
    })

    it("accepts omitted format when partitioning is false", () => {
      const result = mutationConfigSchema.safeParse(
        validConfig({ partitioning: false })
      )
      expect(result.success).toBeTruthy()
    })

    it("accepts a valid format when partitioning is false", () => {
      const result = mutationConfigSchema.safeParse(
        validConfig({ partitioning: false, partitioningFormat: "year" })
      )
      expect(result.success).toBeTruthy()
    })
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

    it("ignores partitioningFormat when partitioning is a custom format", () => {
      const result = mutationConfigSchema.safeParse(
        validConfig({
          partitioning: "customer_id/event_date:year",
          partitioningFormat: "totally_invalid_format",
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

describe(validatePartitioningFormat, () => {
  it("returns null for valid single field name", () => {
    expect(validatePartitioningFormat("event_date")).toBeNull()
  })

  it("returns null for valid custom format", () => {
    expect(
      validatePartitioningFormat("customer_id/event_date:year/event_date:month")
    ).toBeNull()
  })

  it("returns error for invalid field name (no / or :)", () => {
    const result = validatePartitioningFormat("123invalid")
    expect(result).not.toBeNull()
    expect(result).toContain("Invalid partition field name")
  })

  it("returns error for invalid component", () => {
    const result = validatePartitioningFormat("field:badcomponent")
    expect(result).not.toBeNull()
    expect(result).toContain("Invalid date component")
  })

  it("returns error for empty segment", () => {
    const result = validatePartitioningFormat("field//other")
    expect(result).not.toBeNull()
    expect(result).toContain("empty segment")
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
