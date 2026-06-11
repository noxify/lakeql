// oxlint-disable vitest/require-mock-type-parameters
// oxlint-disable vitest/prefer-import-in-mock
// oxlint-disable import/first
import { afterEach, describe, expect, test, vi } from "vitest"

// Mock env to control API_MAX_RECORDS_PER_PAGE
vi.mock("../src/env", () => ({
  env: {
    API_MAX_RECORDS_PER_PAGE: 2000,
    NODE_ENV: "test",
  },
}))

// Mock heavy dependencies that have side effects
vi.mock("@pothos/core", () => {
  class MockBuilder {
    addScalarType = vi.fn()
    enumType = vi.fn(() => "MockEnum")
    inputType = vi.fn(() => "MockInput")
    objectRef = vi.fn(() => ({ implement: vi.fn() }))
    queryType = vi.fn()
    scalarType = vi.fn()
  }
  // oxlint-disable-next-line no-restricted-exports
  return { default: MockBuilder }
})

vi.mock("@pothos/plugin-scope-auth", () => ({ default: {} }))
vi.mock("@pothos/plugin-validation", () => ({ default: {} }))
vi.mock("graphql-scalars", () => ({
  DateResolver: {},
  DateTimeResolver: {},
}))
vi.mock("../src/auth", () => ({
  hasReadPermission: vi.fn(),
  hasWritePermission: vi.fn(),
}))
vi.mock("../src/comparison", () => ({
  createComparisonTypes: vi.fn(() => ({
    createBooleanFieldComparison: vi.fn(() => "MockBoolean"),
    createDateFieldComparison: vi.fn(() => "MockDate"),
    createDateTimeFieldComparison: vi.fn(() => "MockDateTime"),
    createFloatFieldComparison: vi.fn(() => "MockFloat"),
    createIDFieldComparison: vi.fn(() => "MockID"),
    createIntFieldComparison: vi.fn(() => "MockInt"),
    createStringFieldComparison: vi.fn(() => "MockString"),
  })),
}))
vi.mock("../src/helpers", () => ({
  handleErrorResponse: vi.fn(),
  throwFirstError: vi.fn(),
}))

import { getMaxRecordsPerPage, setMaxRecordsPerPage } from "../src/builder"

describe("builder - setMaxRecordsPerPage and getMaxRecordsPerPage", () => {
  afterEach(() => {
    // Reset to default after each test
    setMaxRecordsPerPage()
  })

  test("getMaxRecordsPerPage returns the default value from env", () => {
    expect(getMaxRecordsPerPage()).toBe(2000)
  })

  test("setMaxRecordsPerPage changes the value", () => {
    setMaxRecordsPerPage(500)
    expect(getMaxRecordsPerPage()).toBe(500)
  })

  test("setMaxRecordsPerPage(undefined) resets to default", () => {
    setMaxRecordsPerPage(500)
    setMaxRecordsPerPage()
    expect(getMaxRecordsPerPage()).toBe(2000)
  })

  test("setMaxRecordsPerPage(null) resets to default", () => {
    setMaxRecordsPerPage(500)
    // @ts-expect-error testing null input
    setMaxRecordsPerPage(null)
    expect(getMaxRecordsPerPage()).toBe(2000)
  })

  test("setMaxRecordsPerPage truncates decimal values", () => {
    setMaxRecordsPerPage(3.7)
    expect(getMaxRecordsPerPage()).toBe(3)
  })

  test("setMaxRecordsPerPage enforces minimum of 1", () => {
    setMaxRecordsPerPage(0)
    expect(getMaxRecordsPerPage()).toBe(1)
  })

  test("setMaxRecordsPerPage enforces minimum of 1 for negative values", () => {
    setMaxRecordsPerPage(-5)
    expect(getMaxRecordsPerPage()).toBe(1)
  })
})
