// oxlint-disable import/first
import { describe, expect, it, vi } from "vitest"

// oxlint-disable-next-line vitest/prefer-import-in-mock
vi.mock("../src/env", () => ({
  env: {
    AUTH_MOCK: true,
    AUTH_MOCK_TOKEN: "test-token-123",
  },
}))

import type { Permission, ResolvedIdentity } from "@lakeql/config"

import {
  hasReadPermission,
  hasWritePermission,
  tokenResolver,
} from "../src/auth"
import type { Context } from "../src/types"

const createContext = (overrides: Partial<Context> = {}): Context => ({
  currentUser: { userName: "testuser" },
  identity: null,
  permissions: [],
  ...overrides,
})

const createIdentity = (
  overrides: Partial<ResolvedIdentity> = {}
): ResolvedIdentity => ({
  userName: "testuser",
  isServicePrincipal: false,
  ...overrides,
})

/**
 * Builds a Permission entry with the current nested
 * `{ dataSource, rules }` shape for Query and Mutation.
 */
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

describe(tokenResolver, () => {
  it("returns null when no authorization header is present", async () => {
    const req = new Request("http://localhost", {
      headers: {},
    })

    const result = await tokenResolver(req)
    expect(result).toBeNull()
  })

  it("returns mock user with userName from x-username header when AUTH_MOCK=true and token matches", async () => {
    const req = new Request("http://localhost", {
      headers: {
        authorization: "test-token-123",
        "x-username": "mock-user",
      },
    })

    const result = await tokenResolver(req)
    expect(result).toStrictEqual({ userName: "mock-user" })
  })

  it("returns user with fallback name when x-username header is missing", async () => {
    const req = new Request("http://localhost", {
      headers: {
        authorization: "test-token-123",
      },
    })

    const result = await tokenResolver(req)
    expect(result).toStrictEqual({ userName: "###FALLBACK_MOCK_USER###" })
  })

  it("returns null when AUTH_MOCK is true but token does not match", async () => {
    const req = new Request("http://localhost", {
      headers: {
        authorization: "wrong-token",
        "x-username": "mock-user",
      },
    })

    const result = await tokenResolver(req)
    expect(result).toBeNull()
  })
})

describe(hasReadPermission, () => {
  it("returns false when context.currentUser is null", () => {
    const context = createContext({ currentUser: null })

    const result = hasReadPermission({
      context,
      dataSource: "warehouse",
      catalog: "my_catalog",
      schema: "my_schema",
      tableName: "my_table",
    })

    expect(result).toBeFalsy()
  })

  it("returns true for a human user when no permission entry matches", () => {
    const context = createContext({
      permissions: [
        createPermission("other-user", [
          {
            dataSource: "warehouse",
            rules: [{ catalog: "cat", schema: "sch", tables: ["tbl"] }],
          },
        ]),
      ],
    })

    const result = hasReadPermission({
      context,
      dataSource: "warehouse",
      catalog: "my_catalog",
      schema: "my_schema",
      tableName: "my_table",
    })

    expect(result).toBeTruthy()
  })

  it("returns false for a service principal when no permission entry matches", () => {
    const context = createContext({
      identity: createIdentity({ isServicePrincipal: true }),
      permissions: [],
    })

    const result = hasReadPermission({
      context,
      dataSource: "warehouse",
      catalog: "my_catalog",
      schema: "my_schema",
      tableName: "my_table",
    })

    expect(result).toBeFalsy()
  })

  it("returns true for a human user when no Query rules target the data source", () => {
    const context = createContext({
      permissions: [
        createPermission("testuser", [
          {
            dataSource: "other-source",
            rules: [{ catalog: "cat", schema: "sch", tables: ["tbl"] }],
          },
        ]),
      ],
    })

    const result = hasReadPermission({
      context,
      dataSource: "warehouse",
      catalog: "my_catalog",
      schema: "my_schema",
      tableName: "my_table",
    })

    expect(result).toBeTruthy()
  })

  it("returns true when a matching catalog/schema/table rule exists", () => {
    const context = createContext({
      permissions: [
        createPermission("testuser", [
          {
            dataSource: "warehouse",
            rules: [
              {
                catalog: "my_catalog",
                schema: "my_schema",
                tables: ["my_table"],
              },
            ],
          },
        ]),
      ],
    })

    const result = hasReadPermission({
      context,
      dataSource: "warehouse",
      catalog: "my_catalog",
      schema: "my_schema",
      tableName: "my_table",
    })

    expect(result).toBeTruthy()
  })

  it("returns true when a wildcard '*' table rule exists", () => {
    const context = createContext({
      permissions: [
        createPermission("testuser", [
          {
            dataSource: "warehouse",
            rules: [
              { catalog: "my_catalog", schema: "my_schema", tables: ["*"] },
            ],
          },
        ]),
      ],
    })

    const result = hasReadPermission({
      context,
      dataSource: "warehouse",
      catalog: "my_catalog",
      schema: "my_schema",
      tableName: "any_table",
    })

    expect(result).toBeTruthy()
  })

  it("returns false when rules exist for the data source but none match the table", () => {
    const context = createContext({
      permissions: [
        createPermission("testuser", [
          {
            dataSource: "warehouse",
            rules: [
              {
                catalog: "my_catalog",
                schema: "my_schema",
                tables: ["other_table"],
              },
            ],
          },
        ]),
      ],
    })

    const result = hasReadPermission({
      context,
      dataSource: "warehouse",
      catalog: "my_catalog",
      schema: "my_schema",
      tableName: "my_table",
    })

    expect(result).toBeFalsy()
  })

  it("does not let a catalog-scoped rule match a target without a catalog", () => {
    const context = createContext({
      permissions: [
        createPermission("testuser", [
          {
            dataSource: "warehouse",
            rules: [
              {
                catalog: "my_catalog",
                schema: "my_schema",
                tables: ["my_table"],
              },
            ],
          },
        ]),
      ],
    })

    // Target omits catalog and schema. A rule scoped to my_catalog/my_schema
    // must not authorize it — otherwise the rule's scope is silently ignored.
    const result = hasReadPermission({
      context,
      dataSource: "warehouse",
      tableName: "my_table",
    })

    expect(result).toBeFalsy()
  })

  it("does not let a schema-scoped rule match a target without a schema", () => {
    const context = createContext({
      permissions: [
        createPermission("testuser", [
          {
            dataSource: "warehouse",
            rules: [
              {
                catalog: "my_catalog",
                schema: "my_schema",
                tables: ["my_table"],
              },
            ],
          },
        ]),
      ],
    })

    const result = hasReadPermission({
      context,
      dataSource: "warehouse",
      catalog: "my_catalog",
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
      dataSource: "warehouse",
      catalog: "my_catalog",
      schema: "my_schema",
      tableName: "my_table",
    })

    expect(result).toBeFalsy()
  })

  it("returns false when no permission entry for the user", () => {
    const context = createContext({
      permissions: [
        createPermission(
          "other-user",
          [],
          [
            {
              dataSource: "warehouse",
              rules: [{ catalog: "cat", schema: "sch", tables: ["tbl"] }],
            },
          ]
        ),
      ],
    })

    const result = hasWritePermission({
      context,
      dataSource: "warehouse",
      catalog: "my_catalog",
      schema: "my_schema",
      tableName: "my_table",
    })

    expect(result).toBeFalsy()
  })

  it("returns false when no Mutation rules target the data source", () => {
    const context = createContext({
      permissions: [
        createPermission(
          "testuser",
          [],
          [
            {
              dataSource: "other-source",
              rules: [{ catalog: "cat", schema: "sch", tables: ["tbl"] }],
            },
          ]
        ),
      ],
    })

    const result = hasWritePermission({
      context,
      dataSource: "warehouse",
      catalog: "my_catalog",
      schema: "my_schema",
      tableName: "my_table",
    })

    expect(result).toBeFalsy()
  })

  it("returns true when a matching catalog/schema/table rule exists", () => {
    const context = createContext({
      permissions: [
        createPermission(
          "testuser",
          [],
          [
            {
              dataSource: "warehouse",
              rules: [
                {
                  catalog: "my_catalog",
                  schema: "my_schema",
                  tables: ["my_table"],
                },
              ],
            },
          ]
        ),
      ],
    })

    const result = hasWritePermission({
      context,
      dataSource: "warehouse",
      catalog: "my_catalog",
      schema: "my_schema",
      tableName: "my_table",
    })

    expect(result).toBeTruthy()
  })

  it("returns true when a wildcard '*' table rule exists", () => {
    const context = createContext({
      permissions: [
        createPermission(
          "testuser",
          [],
          [
            {
              dataSource: "warehouse",
              rules: [
                { catalog: "my_catalog", schema: "my_schema", tables: ["*"] },
              ],
            },
          ]
        ),
      ],
    })

    const result = hasWritePermission({
      context,
      dataSource: "warehouse",
      catalog: "my_catalog",
      schema: "my_schema",
      tableName: "any_table",
    })

    expect(result).toBeTruthy()
  })

  it("returns false when rules exist for the data source but none match the table", () => {
    const context = createContext({
      permissions: [
        createPermission(
          "testuser",
          [],
          [
            {
              dataSource: "warehouse",
              rules: [
                {
                  catalog: "my_catalog",
                  schema: "my_schema",
                  tables: ["other_table"],
                },
              ],
            },
          ]
        ),
      ],
    })

    const result = hasWritePermission({
      context,
      dataSource: "warehouse",
      catalog: "my_catalog",
      schema: "my_schema",
      tableName: "my_table",
    })

    expect(result).toBeFalsy()
  })

  it("does not let a catalog/schema-scoped rule match a target without catalog/schema", () => {
    const context = createContext({
      permissions: [
        createPermission(
          "testuser",
          [],
          [
            {
              dataSource: "warehouse",
              rules: [
                {
                  catalog: "my_catalog",
                  schema: "my_schema",
                  tables: ["my_table"],
                },
              ],
            },
          ]
        ),
      ],
    })

    const result = hasWritePermission({
      context,
      dataSource: "warehouse",
      tableName: "my_table",
    })

    expect(result).toBeFalsy()
  })
})
