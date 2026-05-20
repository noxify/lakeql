import { describe, expect, test } from "vitest"

import type { Where } from "../src"
import { normalizeFilter, normalizeUserQuery } from "../src"

describe(normalizeFilter, () => {
  test("should return filter as is if it's null or undefined", () => {
    // @ts-expect-error - Testing null case
    expect(normalizeFilter(null)).toBeNull()
    // @ts-expect-error - Testing undefined case
    expect(normalizeFilter()).toBeUndefined()
  })

  test("should handle empty filter", () => {
    const filter: Where = {}
    expect(normalizeFilter(filter)).toStrictEqual({})
  })

  test("should normalize simple AND conditions", () => {
    const filter: Where = {
      and: [{ field1: { eq: "value1" }, field2: { eq: "value2" } }],
    }

    const expected: Where = {
      and: [{ field1: { eq: "value1" } }, { field2: { eq: "value2" } }],
    }

    expect(normalizeFilter(filter)).toStrictEqual(expected)
  })

  test("should normalize simple OR conditions", () => {
    const filter: Where = {
      or: [{ field1: { eq: "value1" }, field2: { eq: "value2" } }],
    }

    const expected: Where = {
      or: [{ field1: { eq: "value1" } }, { field2: { eq: "value2" } }],
    }

    expect(normalizeFilter(filter)).toStrictEqual(expected)
  })

  test("should handle mixed logical operators and fields", () => {
    const filter: Where = {
      and: [
        {
          field1: { eq: "value1" },
          or: [{ field2: { eq: "value2" } }],
        },
      ],
    }

    const expected: Where = {
      and: [
        { field1: { eq: "value1" } },
        {
          or: [{ field2: { eq: "value2" } }],
        },
      ],
    }

    expect(normalizeFilter(filter)).toStrictEqual(expected)
  })

  test("should handle nested logical operators", () => {
    const filter: Where = {
      and: [
        {
          or: [{ field1: { eq: "value1" }, field2: { eq: "value2" } }],
        },
      ],
    }

    const expected: Where = {
      and: [
        {
          or: [{ field1: { eq: "value1" } }, { field2: { eq: "value2" } }],
        },
      ],
    }

    expect(normalizeFilter(filter)).toStrictEqual(expected)
  })

  test("should handle complex nested structure", () => {
    const filter: Where = {
      and: [
        { field1: { eq: "value1" } },
        {
          or: [
            { field2: { eq: "value2" }, field3: { eq: "value3" } },
            {
              and: [{ field4: { eq: "value4" }, field5: { eq: "value5" } }],
            },
          ],
        },
      ],
    }

    const expected: Where = {
      and: [
        { field1: { eq: "value1" } },
        {
          or: [
            { field2: { eq: "value2" } },
            { field3: { eq: "value3" } },
            {
              and: [{ field4: { eq: "value4" } }, { field5: { eq: "value5" } }],
            },
          ],
        },
      ],
    }

    expect(normalizeFilter(filter)).toStrictEqual(expected)
  })
})

describe(normalizeUserQuery, () => {
  test("should return query as is if it already has AND or OR at root", () => {
    const query: Where = {
      and: [{ field1: { eq: "value1" } }],
    }
    expect(normalizeUserQuery(query)).toStrictEqual(query)

    const orQuery: Where = {
      or: [{ field1: { eq: "value1" } }],
    }
    expect(normalizeUserQuery(orQuery)).toStrictEqual(orQuery)
  })

  test("should wrap fields in AND when no logical operator at root", () => {
    const query = {
      field1: { eq: "value1" },
      field2: { eq: "value2" },
    } as Where

    const expected: Where = {
      and: [{ field1: { eq: "value1" } }, { field2: { eq: "value2" } }],
    }

    expect(normalizeUserQuery(query)).toStrictEqual(expected)
  })

  test("should handle empty query", () => {
    const query: Where = {}
    const expected: Where = {
      and: [],
    }
    expect(normalizeUserQuery(query)).toStrictEqual(expected)
  })
})

describe("normalizeFilter - additional cases", () => {
  test("should handle null or undefined filter", () => {
    // @ts-expect-error - Testing with null
    expect(normalizeFilter(null)).toBeNull()

    // @ts-expect-error - Testing with undefined
    expect(normalizeFilter()).toBeUndefined()
  })

  test("should handle single logical operator with single field", () => {
    const filter: Where = {
      and: [{ field1: { eq: "value1" } }],
    }

    // This case should return the filter unchanged
    expect(normalizeFilter(filter)).toStrictEqual(filter)
  })

  test("should handle nested logical operators with single field", () => {
    const filter: Where = {
      and: [
        {
          or: [{ field1: { eq: "value1" } }],
        },
      ],
    }

    // This case should return the filter unchanged
    expect(normalizeFilter(filter)).toStrictEqual(filter)
  })

  test("should handle logical operators with no fields", () => {
    const filter: Where = {
      and: [
        {
          or: [],
        },
      ],
    }

    expect(normalizeFilter(filter)).toStrictEqual(filter)
  })

  test("should handle logical operators with only logical keys", () => {
    const filter: Where = {
      and: [
        {
          and: [{ field2: { eq: "value2" } }],
          or: [{ field1: { eq: "value1" } }],
        },
      ],
    }

    const expected: Where = {
      and: [
        {
          and: [{ field2: { eq: "value2" } }],
          or: [{ field1: { eq: "value1" } }],
        },
      ],
    }

    expect(normalizeFilter(filter)).toStrictEqual(expected)
  })

  test("should handle empty arrays in logical operators", () => {
    const filter: Where = {
      and: [],
      or: [],
    }

    expect(normalizeFilter(filter)).toStrictEqual(filter)
  })
})
