import { describe, expect, test } from "vitest"

import { calculatePageInfo } from "../src/calculate-page-info"

describe(calculatePageInfo, () => {
  test("should calculate page info correctly with default page", () => {
    const result = calculatePageInfo({
      perPage: 10,
      totalCount: 100,
    })

    expect(result).toStrictEqual({
      currentPage: 1,
      hasNext: true,
      hasPrevious: false,
      limit: 10,
      maxPages: 10,
      nextPage: 2,
      offset: null,
      previousPage: null,
      totalCount: 100,
    })
  })

  test("should calculate page info correctly for first page", () => {
    const result = calculatePageInfo({
      page: 1,
      perPage: 10,
      totalCount: 100,
    })

    expect(result).toStrictEqual({
      currentPage: 1,
      hasNext: true,
      hasPrevious: false,
      limit: 10,
      maxPages: 10,
      nextPage: 2,
      offset: null,
      previousPage: null,
      totalCount: 100,
    })
  })

  test("should calculate page info correctly for middle page", () => {
    const result = calculatePageInfo({
      page: 5,
      perPage: 10,
      totalCount: 100,
    })

    expect(result).toStrictEqual({
      currentPage: 5,
      hasNext: true,
      hasPrevious: true,
      limit: 10,
      maxPages: 10,
      nextPage: 6,
      offset: 40,
      previousPage: 4,
      totalCount: 100,
    })
  })

  test("should calculate page info correctly for last page", () => {
    const result = calculatePageInfo({
      page: 10,
      perPage: 10,
      totalCount: 100,
    })

    expect(result).toStrictEqual({
      currentPage: 10,
      hasNext: false,
      hasPrevious: true,
      limit: 10,
      maxPages: 10,
      nextPage: null,
      offset: 90,
      previousPage: 9,
      totalCount: 100,
    })
  })

  test("should handle non-even division of pages", () => {
    const result = calculatePageInfo({
      page: 10,
      perPage: 10,
      totalCount: 95,
    })

    expect(result).toStrictEqual({
      currentPage: 10,
      hasNext: false,
      hasPrevious: true,
      limit: 10,
      maxPages: 10,
      nextPage: null,
      offset: 90,
      previousPage: 9,
      totalCount: 95,
    })
  })

  test("should handle zero total count", () => {
    const result = calculatePageInfo({
      page: 1,
      perPage: 10,
      totalCount: 0,
    })

    expect(result).toStrictEqual({
      currentPage: 1,
      hasNext: false,
      hasPrevious: false,
      limit: 10,
      maxPages: 0,
      nextPage: null,
      offset: null,
      previousPage: null,
      totalCount: 0,
    })
  })

  test("should handle page number greater than max pages", () => {
    const result = calculatePageInfo({
      page: 5,
      perPage: 10,
      totalCount: 20,
    })

    expect(result).toStrictEqual({
      currentPage: 5,
      hasNext: false,
      hasPrevious: true,
      limit: 10,
      maxPages: 2,
      nextPage: null,
      offset: 40,
      previousPage: 4,
      totalCount: 20,
    })
  })
})
