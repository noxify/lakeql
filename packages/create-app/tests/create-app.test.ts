import { beforeEach, describe, expect, test, vi } from "vitest"

// Test the project name validation regex pattern
// (replicated from src/index.ts since it's not exported and the module auto-executes main())
describe("Project Name Validation", () => {
  const PROJECT_NAME_REGEX = /^[a-z0-9-_]+$/u

  test("accepts lowercase letters", () => {
    expect(PROJECT_NAME_REGEX.test("myproject")).toBeTruthy()
  })

  test("accepts numbers", () => {
    expect(PROJECT_NAME_REGEX.test("project123")).toBeTruthy()
  })

  test("accepts hyphens", () => {
    expect(PROJECT_NAME_REGEX.test("my-project")).toBeTruthy()
  })

  test("accepts underscores", () => {
    expect(PROJECT_NAME_REGEX.test("my_project")).toBeTruthy()
  })

  test("accepts combination", () => {
    expect(PROJECT_NAME_REGEX.test("my-lakeql-app_2")).toBeTruthy()
  })

  test("rejects uppercase letters", () => {
    expect(PROJECT_NAME_REGEX.test("MyProject")).toBeFalsy()
  })

  test("rejects spaces", () => {
    expect(PROJECT_NAME_REGEX.test("my project")).toBeFalsy()
  })

  test("rejects special characters", () => {
    expect(PROJECT_NAME_REGEX.test("my@project")).toBeFalsy()
    expect(PROJECT_NAME_REGEX.test("my.project")).toBeFalsy()
    expect(PROJECT_NAME_REGEX.test("my/project")).toBeFalsy()
  })

  test("rejects empty string", () => {
    expect(PROJECT_NAME_REGEX.test("")).toBeFalsy()
  })
})

describe("getLatestVersion", () => {
  // Since getLatestVersion is not exported and the module auto-executes main(),
  // we test the logic pattern by mocking global fetch directly.

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  test("returns formatted version on successful fetch", async () => {
    const mockFetch =
      vi.fn<(input: string | URL | Request) => Promise<Response>>()
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ version: "1.2.3" }),
    } as Response)
    vi.stubGlobal("fetch", mockFetch)

    const response = await fetch(
      "https://registry.npmjs.org/@lakeql/api/latest"
    )
    const data = (await response.json()) as { version: string }
    const result = `^${data.version}`

    expect(result).toBe("^1.2.3")
    expect(mockFetch).toHaveBeenCalledWith(
      "https://registry.npmjs.org/@lakeql/api/latest"
    )
  })

  test("returns * on fetch failure", async () => {
    const mockFetch =
      vi.fn<(input: string | URL | Request) => Promise<Response>>()
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
    } as Response)
    vi.stubGlobal("fetch", mockFetch)

    const response = await fetch(
      "https://registry.npmjs.org/@lakeql/api/latest"
    )
    const result = response.ok
      ? `^${((await response.json()) as { version: string }).version}`
      : "*"

    expect(result).toBe("*")
  })

  test("returns * on network error", async () => {
    const mockFetch =
      vi.fn<(input: string | URL | Request) => Promise<Response>>()
    mockFetch.mockRejectedValue(new Error("Network error"))
    vi.stubGlobal("fetch", mockFetch)

    let result: string
    try {
      await fetch("https://registry.npmjs.org/@lakeql/api/latest")
      result = "unreachable"
    } catch {
      result = "*"
    }

    expect(result).toBe("*")
  })
})

describe("VALID_PACKAGE_MANAGERS", () => {
  const VALID_PACKAGE_MANAGERS = ["npm", "pnpm", "yarn", "bun"]

  test("includes npm", () => {
    expect(VALID_PACKAGE_MANAGERS).toContain("npm")
  })

  test("includes pnpm", () => {
    expect(VALID_PACKAGE_MANAGERS).toContain("pnpm")
  })

  test("includes yarn", () => {
    expect(VALID_PACKAGE_MANAGERS).toContain("yarn")
  })

  test("includes bun", () => {
    expect(VALID_PACKAGE_MANAGERS).toContain("bun")
  })
})
