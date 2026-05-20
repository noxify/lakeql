import { sql } from "kysely"
import { beforeEach, describe, expect, test, vi } from "vitest"

import { getFieldQuery } from "../src/index"

const mocks = vi.hoisted(() => ({
  sqlId: vi.fn<() => string>().mockReturnValue("SQL_ID"),
}))

// Mock kysely's sql module
vi.mock(import("kysely"), async (importOriginal) => {
  const actual = await importOriginal()

  return {
    ...actual,
    sql: Object.assign(actual.sql, {
      id: mocks.sqlId as unknown as typeof actual.sql.id,
    }) as typeof actual.sql,
  }
})

// Create a simple mock object that matches the structure we need
const mockEbNot = vi.fn<() => ReturnType<typeof mockEb>>()
// oxlint-disable-next-line typescript/no-explicit-any
const mockEb = vi.fn<(field: any, op: string, value: any) => any>()

// Make mockEb return itself for chaining
mockEb.mockReturnValue(mockEb)
mockEbNot.mockReturnValue(mockEb)

// Add the not method to mockEb
// @ts-expect-error - Adding property to function
mockEb.not = mockEbNot

describe(getFieldQuery, () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("should handle eq operator", () => {
    getFieldQuery({
      // @ts-expect-error - Mock doesn't match the full ExpressionBuilder interface
      eb: mockEb,
      fieldName: "testField",
      operator: "eq",
      value: "testValue",
    })

    expect(mockEb).toHaveBeenCalledWith(expect.anything(), "=", "testValue")
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(sql.id).toHaveBeenCalledWith("testField")
  })

  test("should handle neq operator", () => {
    getFieldQuery({
      // @ts-expect-error - Mock doesn't match the full ExpressionBuilder interface
      eb: mockEb,
      fieldName: "testField",
      operator: "neq",
      value: "testValue",
    })

    expect(mockEb).toHaveBeenCalledWith(expect.anything(), "!=", "testValue")
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(sql.id).toHaveBeenCalledWith("testField")
  })

  test("should handle in operator", () => {
    getFieldQuery({
      // @ts-expect-error - Mock doesn't match the full ExpressionBuilder interface
      eb: mockEb,
      fieldName: "testField",
      operator: "in",
      value: ["value1", "value2"],
    })

    expect(mockEb).toHaveBeenCalledWith(expect.anything(), "in", [
      "value1",
      "value2",
    ])
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(sql.id).toHaveBeenCalledWith("testField")
  })

  test("should handle like operator", () => {
    getFieldQuery({
      // @ts-expect-error - Mock doesn't match the full ExpressionBuilder interface
      eb: mockEb,
      fieldName: "testField",
      operator: "like",
      value: "testValue",
    })

    expect(mockEb).toHaveBeenCalledWith(
      expect.anything(),
      "like",
      "%testValue%"
    )
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(sql.id).toHaveBeenCalledWith("testField")
  })

  test("should handle notLike operator", () => {
    getFieldQuery({
      // @ts-expect-error - Mock doesn't match the full ExpressionBuilder interface
      eb: mockEb,
      fieldName: "testField",
      operator: "notLike",
      value: "testValue",
    })

    // oxlint-disable-next-line vitest/prefer-called-with
    expect(mockEbNot).toHaveBeenCalled()
    expect(mockEb).toHaveBeenCalledWith(
      expect.anything(),
      "like",
      "%testValue%"
    )
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(sql.id).toHaveBeenCalledWith("testField")
  })

  test("should handle startsWith operator", () => {
    getFieldQuery({
      // @ts-expect-error - Mock doesn't match the full ExpressionBuilder interface
      eb: mockEb,
      fieldName: "testField",
      operator: "startsWith",
      value: "testValue",
    })

    expect(mockEb).toHaveBeenCalledWith(expect.anything(), "like", "testValue%")
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(sql.id).toHaveBeenCalledWith("testField")
  })

  test("should handle notStartsWith operator", () => {
    getFieldQuery({
      // @ts-expect-error - Mock doesn't match the full ExpressionBuilder interface
      eb: mockEb,
      fieldName: "testField",
      operator: "notStartsWith",
      value: "testValue",
    })

    // oxlint-disable-next-line vitest/prefer-called-with
    expect(mockEbNot).toHaveBeenCalled()
    expect(mockEb).toHaveBeenCalledWith(expect.anything(), "like", "testValue%")
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(sql.id).toHaveBeenCalledWith("testField")
  })

  test("should handle endsWith operator", () => {
    getFieldQuery({
      // @ts-expect-error - Mock doesn't match the full ExpressionBuilder interface
      eb: mockEb,
      fieldName: "testField",
      operator: "endsWith",
      value: "testValue",
    })

    expect(mockEb).toHaveBeenCalledWith(expect.anything(), "like", "%testValue")
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(sql.id).toHaveBeenCalledWith("testField")
  })

  test("should handle notEndsWith operator", () => {
    getFieldQuery({
      // @ts-expect-error - Mock doesn't match the full ExpressionBuilder interface
      eb: mockEb,
      fieldName: "testField",
      operator: "notEndsWith",
      value: "testValue",
    })

    // oxlint-disable-next-line vitest/prefer-called-with
    expect(mockEbNot).toHaveBeenCalled()
    expect(mockEb).toHaveBeenCalledWith(expect.anything(), "like", "%testValue")
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(sql.id).toHaveBeenCalledWith("testField")
  })

  test("should handle unknown operator with default equals", () => {
    getFieldQuery({
      // @ts-expect-error - Mock doesn't match the full ExpressionBuilder interface
      eb: mockEb,
      fieldName: "testField",
      operator: "unknownOp",
      value: "testValue",
    })

    expect(mockEb).toHaveBeenCalledWith(expect.anything(), "=", "testValue")
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(sql.id).toHaveBeenCalledWith("testField")
  })
})
