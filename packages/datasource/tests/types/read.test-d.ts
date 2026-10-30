import { assertType, describe, expectTypeOf, it } from "vitest"

import type {
  DataSourceReadInput,
  DataSourceReadResult,
  DataSourceReadStrategy,
} from "../../src/types/read"

describe("DataSourceReadInput generic defaults", () => {
  it("filter, schema, and context default to unknown", () => {
    expectTypeOf<DataSourceReadInput>().toBeObject()
    expectTypeOf<DataSourceReadInput["filter"]>().toEqualTypeOf<unknown>()
    expectTypeOf<DataSourceReadInput["schema"]>().toEqualTypeOf<unknown>()
    expectTypeOf<DataSourceReadInput["context"]>().toEqualTypeOf<unknown>()
  })

  it("accepts specific generic type parameters", () => {
    type Specific = DataSourceReadInput<
      { status: string },
      object,
      { userId: string }
    >

    expectTypeOf<Specific["filter"]>().toEqualTypeOf<{ status: string }>()
    expectTypeOf<Specific["schema"]>().toEqualTypeOf<object>()
    expectTypeOf<Specific["context"]>().toEqualTypeOf<{ userId: string }>()
  })
})

describe("DataSourceReadInput paging", () => {
  it("paging.page is a number", () => {
    expectTypeOf<DataSourceReadInput["paging"]["page"]>().toBeNumber()
  })

  it("paging.perPage is an optional number", () => {
    expectTypeOf<DataSourceReadInput["paging"]["perPage"]>().toEqualTypeOf<
      number | undefined
    >()
  })
})

describe("DataSourceReadResult typing", () => {
  it("nodes are typed with the generic parameter", () => {
    type Result = DataSourceReadResult<{ id: string; name: string }>

    expectTypeOf<Result["nodes"]>().toEqualTypeOf<
      { id: string; name: string }[]
    >()
  })

  it("totalCount is a number", () => {
    expectTypeOf<DataSourceReadResult<unknown>["totalCount"]>().toBeNumber()
  })

  it("pageInfo exposes maxPages, hasNext, hasPrevious, currentPage, nextPage, previousPage", () => {
    type PageInfo = DataSourceReadResult<unknown>["pageInfo"]

    expectTypeOf<PageInfo["maxPages"]>().toBeNumber()
    expectTypeOf<PageInfo["hasNext"]>().toBeBoolean()
    expectTypeOf<PageInfo["hasPrevious"]>().toBeBoolean()
    expectTypeOf<PageInfo["currentPage"]>().toBeNumber()
    expectTypeOf<PageInfo["nextPage"]>().toEqualTypeOf<number | null>()
    expectTypeOf<PageInfo["previousPage"]>().toEqualTypeOf<number | null>()
  })

  it("result can be constructed with typed nodes", () => {
    assertType<DataSourceReadResult<{ id: string; name: string }>>({
      totalCount: 1,
      pageInfo: {
        maxPages: 1,
        hasNext: false,
        hasPrevious: false,
        currentPage: 1,
        nextPage: null,
        previousPage: null,
      },
      nodes: [{ id: "1", name: "test" }],
    })
  })
})

describe("DataSourceReadStrategy.read return type", () => {
  it("read is a function", () => {
    expectTypeOf<DataSourceReadStrategy["read"]>().toBeFunction()
  })

  it("read returns Promise<DataSourceReadResult<T>>", () => {
    const strategy = {} as DataSourceReadStrategy
    const result = strategy.read<{ id: string }>({} as DataSourceReadInput)

    expectTypeOf(result).toEqualTypeOf<
      Promise<DataSourceReadResult<{ id: string }>>
    >()
  })
})
