import { afterEach, describe, expect, it, vi } from "vitest"

const mockExecutePull = vi.fn<(...args: unknown[]) => Promise<void>>()
const mockExecuteBulkPull = vi.fn<(...args: unknown[]) => Promise<void>>()
const mockRunConfigRegistryGeneration =
  vi.fn<(...args: unknown[]) => Promise<void>>()

mockExecutePull.mockResolvedValue()
mockExecuteBulkPull.mockResolvedValue()
mockRunConfigRegistryGeneration.mockResolvedValue()

vi.mock(import("@/commands/pull-action"), () => ({
  executePull: (...args: unknown[]) => mockExecutePull(...args),
}))

vi.mock(import("@/commands/bulk-pull"), () => ({
  executeBulkPull: (...args: unknown[]) => mockExecuteBulkPull(...args),
}))

vi.mock(import("@/commands/create-registry"), async (importOriginal) => {
  const actual = await importOriginal()

  return {
    ...actual,
    runConfigRegistryGeneration: (...args: unknown[]) =>
      mockRunConfigRegistryGeneration(...args),
    // oxlint-disable-next-line vitest/require-mock-type-parameters
    default: vi.fn(actual.default),
  }
})

vi.mock(import("@/config"), () => ({
  resolveSourcePath: vi
    .fn<() => Promise<string>>()
    .mockResolvedValue("/tmp/lakeql-out"),
}))

vi.mock(import("@/env"), () => ({
  getEnv: () => ({
    HIVE_CATALOG: "hive",
    HIVE_HOST: "localhost",
    HIVE_PASSWORD: "secret",
    HIVE_PORT: 443,
    HIVE_USERNAME: "user",
    LOG_LEVEL: "warn" as const,
  }),
}))

vi.mock(import("@lakeql/logger/console"), () => ({
  info: (message: string) => `INFO ${message}`,
  success: (message: string) => `SUCCESS ${message}`,
}))

const { default: pullCommandFactory } = await import("@/commands/pull")

describe("pull command output", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    mockExecutePull.mockReset()
    mockExecutePull.mockResolvedValue()
    mockExecuteBulkPull.mockClear()
    mockRunConfigRegistryGeneration.mockClear()
  })

  it("prints start and completion messages for successful non-interactive pull", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const command = pullCommandFactory()

    await command.parseAsync(
      [
        "--catalog",
        "hive",
        "--schema",
        "analytics",
        "--table",
        "events",
        "--skip-registry",
      ],
      { from: "user" }
    )

    expect(mockExecutePull).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        catalog: "hive",
        schema: "analytics",
        tables: ["events"],
        resolvedTargetPath: "/tmp/lakeql-out",
        skipRegistry: true,
      })
    )

    expect(logSpy).toHaveBeenCalledWith(
      "INFO Pulling 1 item(s) from hive.analytics into /tmp/lakeql-out/schemas/generated..."
    )
    expect(logSpy).toHaveBeenCalledWith(
      "SUCCESS Pull completed: 1 item(s) generated under /tmp/lakeql-out/schemas/generated/hive/analytics"
    )

    expect(mockRunConfigRegistryGeneration).not.toHaveBeenCalled()
  })

  it("runs config registry generation once when skip-registry is not set", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const command = pullCommandFactory()

    await command.parseAsync(
      ["--catalog", "hive", "--schema", "analytics", "--table", "events"],
      { from: "user" }
    )

    expect(mockExecutePull).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        catalog: "hive",
        schema: "analytics",
        tables: ["events"],
        resolvedTargetPath: "/tmp/lakeql-out",
        skipRegistry: true,
      })
    )

    expect(mockRunConfigRegistryGeneration).toHaveBeenCalledOnce()
    expect(mockRunConfigRegistryGeneration.mock.calls[0]?.[0]).toBeUndefined()

    expect(logSpy).toHaveBeenCalledWith(
      "SUCCESS Pull completed: 1 item(s) generated under /tmp/lakeql-out/schemas/generated/hive/analytics"
    )
  })

  it("processes large table selections without switching to bulk command", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})

    const command = pullCommandFactory()
    const tables = Array.from({ length: 11 }, (_, i) => `events_${i}`)

    const args = [
      "--catalog",
      "hive",
      "--schema",
      "analytics",
      ...tables.flatMap((table) => ["--table", table]),
    ]

    await command.parseAsync(args, { from: "user" })

    expect(mockExecutePull).toHaveBeenCalledTimes(11)
    for (const table of tables) {
      expect(mockExecutePull).toHaveBeenCalledWith(
        expect.objectContaining({
          catalog: "hive",
          schema: "analytics",
          tables: [table],
          resolvedTargetPath: "/tmp/lakeql-out",
          skipRegistry: true,
        })
      )
    }

    expect(mockExecuteBulkPull).not.toHaveBeenCalled()
    expect(mockRunConfigRegistryGeneration).toHaveBeenCalledOnce()

    expect(logSpy).toHaveBeenCalledWith(
      "INFO Pulling 11 item(s) from hive.analytics into /tmp/lakeql-out/schemas/generated..."
    )
    expect(logSpy).toHaveBeenCalledWith(
      "SUCCESS Pull completed: 11 item(s) generated under /tmp/lakeql-out/schemas/generated/hive/analytics"
    )
  })

  it("passes custom concurrency to bulk pull", async () => {
    const command = pullCommandFactory()

    await command.parseAsync(
      ["--bulk", "--concurrency", "5", "--skip-registry"],
      { from: "user" }
    )

    expect(mockExecuteBulkPull).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        concurrency: 5,
        skipRegistry: true,
      })
    )
  })

  it("uses custom concurrency for non-bulk multi-table pulls", async () => {
    let inFlight = 0
    let maxInFlight = 0

    mockExecutePull.mockImplementation(async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      // oxlint-disable-next-line promise/avoid-new no-promise-executor-return
      await new Promise((resolve) => setTimeout(resolve, 0))
      inFlight -= 1
    })

    const command = pullCommandFactory()
    const tables = Array.from({ length: 6 }, (_, i) => `events_${i}`)

    await command.parseAsync(
      [
        "--catalog",
        "hive",
        "--schema",
        "analytics",
        "--concurrency",
        "3",
        ...tables.flatMap((table) => ["--table", table]),
      ],
      { from: "user" }
    )

    expect(mockExecutePull).toHaveBeenCalledTimes(6)
    expect(maxInFlight).toBeLessThanOrEqual(3)
  })
})
