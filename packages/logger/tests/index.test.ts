import { describe, expect, test, vi } from "vitest"

import { createLogger } from "../src/index"

type MockResult = Record<string, unknown>

const mocks = vi.hoisted(() => {
  class MockLogLayer {
    _config: unknown

    constructor(config: unknown) {
      this._config = config
    }
  }

  const MockConsoleTransport = vi
    .fn<new (config?: unknown) => { _config: unknown }>()
    .mockImplementation(function MockConsoleTransportImpl(
      this: { _config: unknown },
      config?: unknown
    ) {
      this._config = config
    })

  const MockWinstonTransport = vi
    .fn<new (config: unknown) => { _config: unknown }>()
    .mockImplementation(function MockWinstonTransportImpl(
      this: { _config: unknown },
      config: unknown
    ) {
      this._config = config
    })

  const format = Object.assign(
    vi.fn<() => () => MockResult>(() => vi.fn<() => MockResult>(() => ({}))),
    {
      colorize: vi.fn<() => MockResult>(() => ({})),
      combine: vi.fn<() => MockResult>(() => ({})),
      errors: vi.fn<() => MockResult>(() => ({})),
      printf: vi.fn<() => MockResult>(() => ({})),
      splat: vi.fn<() => MockResult>(() => ({})),
      timestamp: vi.fn<() => MockResult>(() => ({})),
    }
  )

  return {
    MockConsoleTransport,
    MockLogLayer,
    MockWinstonTransport,
    createWinstonLogger: vi.fn<() => MockResult>(() => ({})),
    format,
    redactionPlugin: vi.fn<() => MockResult>(() => ({})),
  }
})

vi.mock(import("loglayer"), async (importOriginal) => {
  const actual = await importOriginal()

  return {
    ...actual,
    LogLayer: mocks.MockLogLayer as unknown as typeof actual.LogLayer,
  }
})

vi.mock(import("winston"), async (importOriginal) => {
  const actual = await importOriginal()

  return {
    ...actual,
    createLogger:
      mocks.createWinstonLogger as unknown as typeof actual.createLogger,
    format: mocks.format as unknown as typeof actual.format,
    transports: {
      ...actual.transports,
      Console:
        mocks.MockConsoleTransport as unknown as typeof actual.transports.Console,
    },
  }
})

vi.mock(import("@loglayer/transport-winston"), async (importOriginal) => {
  const actual = await importOriginal()

  return {
    ...actual,
    WinstonTransport:
      mocks.MockWinstonTransport as unknown as typeof actual.WinstonTransport,
  }
})

vi.mock(import("@loglayer/plugin-redaction"), async (importOriginal) => {
  const actual = await importOriginal()

  return {
    ...actual,
    redactionPlugin:
      mocks.redactionPlugin as unknown as typeof actual.redactionPlugin,
  }
})

describe("logger", () => {
  test("createLogger should return a LogLayer instance", () => {
    const logger = createLogger()
    expect(logger).toHaveProperty("_config")
  })

  test("createLogger should configure LogLayer with correct options", () => {
    const logger = createLogger()
    expect(logger._config).toStrictEqual(
      expect.objectContaining({
        contextFieldName: "context",
        errorFieldInMetadata: false,
        metadataFieldName: "metadata",
      })
    )
  })
})
