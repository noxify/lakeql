// oxlint-disable import/first
import { describe, expect, it, vi } from "vitest"

// oxlint-disable-next-line vitest/prefer-import-in-mock
vi.mock("../src/env", () => ({
  env: {
    AUTH_MOCK: true,
    AUTH_MOCK_TOKEN: "test-token-123",
  },
}))

import { getUser, hasReadPermission, hasWritePermission } from "../src/auth"
import type { Context, Permission } from "../src/types"

const createContext = (overrides: Partial<Context> = {}): Context => ({
  currentUser: { userName: "testuser" },
  permissions: [],
  ...overrides,
})

const createPermission = (
  name: string,
  query: Permission["permissions"]["Query"] = [],
  mutation: Permission["permissions"]["Mutation"] = []
): Permission => ({
  name,
  useSystemUser: false,
  permissions: {
    Query: query,
    Mutation: mutation,
  },
})

describe(getUser, () => {
  it("returns null when no authorization header is present", async () => {
    const req = new Request("http://localhost", {
      headers: {},
    })

    const result = await getUser(req)
    expect(result).toBeNull()
  })

  it("returns mock user with userName from x-username header when AUTH_MOCK=true and token matches", async () => {
    const req = new Request("http://localhost", {
      headers: {
        authorization: "test-token-123",
        "x-username": "mock-user",
      },
    })

    const result = await getUser(req)
    expect(result).toStrictEqual({ userName: "mock-user" })
  })

  it("returns user with fallback name when x-username header is missing", async () => {
    const req = new Request("http://localhost", {
      headers: {
        authorization: "test-token-123",
      },
    })

    const result = await getUser(req)
    expect(result).toStrictEqual({ userName: "###FALLBACK_MOCK_USER###" })
  })

  it("returns null when AUTH_MOCK is true but token does not match", async () => {
    const req = new Request("http://localhost", {
      headers: {
        authorization: "wrong-token",
        "x-username": "mock-user",
      },
    })

    const result = await getUser(req)
    expect(result).toBeNull()
  })
})

describe(hasReadPermission, () => {
  it("returns false when context.currentUser is null", () => {
    const context = createContext({ currentUser: null })

    const result = hasReadPermission({
      context,
      catalog: "my_catalog",
      schema: "my_schema",
      tableName: "my_table",
    })

    expect(result).toBeFalsy()
  })

  it("returns true when no permissions entry matches the user", () => {
    const context = createContext({
      permissions: [
        createPermission("other-user", [
          { catalog: "cat", schema: "sch", tables: ["tbl"] },
        ]),
      ],
    })

    const result = hasReadPermission({
      context,
      catalog: "my_catalog",
      schema: "my_schema",
      tableName: "my_table",
    })

    expect(result).toBeTruthy()
  })

  it("returns true when user has empty Query array", () => {
    const context = createContext({
      permissions: [createPermission("testuser", [])],
    })

    const result = hasReadPermission({
      context,
      catalog: "my_catalog",
      schema: "my_schema",
      tableName: "my_table",
    })

    expect(result).toBeTruthy()
  })

  it("returns true when matching catalog/schema/table rule exists", () => {
    const context = createContext({
      permissions: [
        createPermission("testuser", [
          { catalog: "my_catalog", schema: "my_schema", tables: ["my_table"] },
        ]),
      ],
    })

    const result = hasReadPermission({
      context,
      catalog: "my_catalog",
      schema: "my_schema",
      tableName: "my_table",
    })

    expect(result).toBeTruthy()
  })

  it("returns true when wildcard '*' table rule exists", () => {
    const context = createContext({
      permissions: [
        createPermission("testuser", [
          { catalog: "my_catalog", schema: "my_schema", tables: ["*"] },
        ]),
      ],
    })

    const result = hasReadPermission({
      context,
      catalog: "my_catalog",
      schema: "my_schema",
      tableName: "any_table",
    })

    expect(result).toBeTruthy()
  })

  it("returns false when no matching rule for the requested table", () => {
    const context = createContext({
      permissions: [
        createPermission("testuser", [
          {
            catalog: "my_catalog",
            schema: "my_schema",
            tables: ["other_table"],
          },
        ]),
      ],
    })

    const result = hasReadPermission({
      context,
      catalog: "my_catalog",
      schema: "my_schema",
      tableName: "my_table",
    })

    expect(result).toBeFalsy()
  })
})

describe(hasWritePermission, () => {
  it("returns false when context.currentUser is null", () => {
    const context = createContext({ currentUser: null })

    const result = hasWritePermission({
      context,
      catalog: "my_catalog",
      schema: "my_schema",
      tableName: "my_table",
    })

    expect(result).toBeFalsy()
  })

  it("returns false when no permissions entry for user", () => {
    const context = createContext({
      permissions: [
        createPermission(
          "other-user",
          [],
          [{ catalog: "cat", schema: "sch", tables: ["tbl"] }]
        ),
      ],
    })

    const result = hasWritePermission({
      context,
      catalog: "my_catalog",
      schema: "my_schema",
      tableName: "my_table",
    })

    expect(result).toBeFalsy()
  })

  it("returns false when user has empty Mutation array", () => {
    const context = createContext({
      permissions: [createPermission("testuser", [], [])],
    })

    const result = hasWritePermission({
      context,
      catalog: "my_catalog",
      schema: "my_schema",
      tableName: "my_table",
    })

    expect(result).toBeFalsy()
  })

  it("returns true when matching catalog/schema/table rule exists", () => {
    const context = createContext({
      permissions: [
        createPermission(
          "testuser",
          [],
          [{ catalog: "my_catalog", schema: "my_schema", tables: ["my_table"] }]
        ),
      ],
    })

    const result = hasWritePermission({
      context,
      catalog: "my_catalog",
      schema: "my_schema",
      tableName: "my_table",
    })

    expect(result).toBeTruthy()
  })

  it("returns true when wildcard '*' table rule exists", () => {
    const context = createContext({
      permissions: [
        createPermission(
          "testuser",
          [],
          [{ catalog: "my_catalog", schema: "my_schema", tables: ["*"] }]
        ),
      ],
    })

    const result = hasWritePermission({
      context,
      catalog: "my_catalog",
      schema: "my_schema",
      tableName: "any_table",
    })

    expect(result).toBeTruthy()
  })

  it("returns false when no matching rule for the requested table", () => {
    const context = createContext({
      permissions: [
        createPermission(
          "testuser",
          [],
          [
            {
              catalog: "my_catalog",
              schema: "my_schema",
              tables: ["other_table"],
            },
          ]
        ),
      ],
    })

    const result = hasWritePermission({
      context,
      catalog: "my_catalog",
      schema: "my_schema",
      tableName: "my_table",
    })

    expect(result).toBeFalsy()
  })
})
