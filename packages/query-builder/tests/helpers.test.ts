// packages/query-builder/tests/normalize-functions.test.ts
import { describe, expect, test } from "vitest"

import type { Where } from "../src"
import { normalizeFilter, normalizeUserQuery } from "../src"

describe(normalizeUserQuery, () => {
  test("should return query with 'and' or 'or' at root level as is", () => {
    const query = { and: [{ field1: { eq: "value1" } }] }
    expect(normalizeUserQuery(query)).toStrictEqual(query)

    const orQuery = { or: [{ field1: { eq: "value1" } }] }
    expect(normalizeUserQuery(orQuery)).toStrictEqual(orQuery)
  })

  test("should wrap flat queries in 'and' array", () => {
    const query = {
      field1: { eq: "value1" },
      field2: { eq: "value2" },
    } as Where
    const expected = {
      and: [{ field1: { eq: "value1" } }, { field2: { eq: "value2" } }],
    }
    expect(normalizeUserQuery(query)).toStrictEqual(expected)
  })
})

describe(normalizeFilter, () => {
  test("should split fields in a single object into separate objects", () => {
    const query = {
      and: [{ field1: { eq: "value1" }, field2: { eq: "value2" } }],
    }
    const expected = {
      and: [{ field1: { eq: "value1" } }, { field2: { eq: "value2" } }],
    }
    expect(normalizeFilter(query)).toStrictEqual(expected)
  })

  test("should handle nested logical operators", () => {
    const query = {
      and: [
        {
          field1: { eq: "value1" },
          or: [{ field2: { eq: "value2" }, field3: { eq: "value3" } }],
        },
      ],
    }
    const expected = {
      and: [
        { field1: { eq: "value1" } },
        {
          or: [{ field2: { eq: "value2" } }, { field3: { eq: "value3" } }],
        },
      ],
    }
    expect(normalizeFilter(query)).toStrictEqual(expected)
  })

  test("should handle complex nested structures", () => {
    const query = {
      and: [
        {
          field1: { eq: "value1" },
          field2: { eq: "value2" },
          or: [
            {
              and: [{ field5: { eq: "value5" }, field6: { eq: "value6" } }],
              field3: { eq: "value3" },
              field4: { eq: "value4" },
            },
          ],
        },
      ],
    }
    const expected = {
      and: [
        { field1: { eq: "value1" } },
        { field2: { eq: "value2" } },
        {
          or: [
            { field3: { eq: "value3" } },
            { field4: { eq: "value4" } },
            {
              and: [{ field5: { eq: "value5" } }, { field6: { eq: "value6" } }],
            },
          ],
        },
      ],
    }
    expect(normalizeFilter(query)).toStrictEqual(expected)
  })

  test("should handle the example case correctly", () => {
    const query = {
      and: [
        {
          itapsid: { eq: "itaps" },
          or: [{ kritis: { is: false }, systelinternal: { is: true } }],
          uka: { is: true },
        },
      ],
    } as Where

    const expected = {
      and: [
        { itapsid: { eq: "itaps" } },
        { uka: { is: true } },
        {
          or: [{ kritis: { is: false } }, { systelinternal: { is: true } }],
        },
      ],
    }
    expect(normalizeFilter(query)).toStrictEqual(expected)
  })
})
