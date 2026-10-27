import { describe, expect, it } from "vitest"

import { trinoUserImpersonation } from "../src/trino-user-impersonation"

const impersonationContext = {
  isServicePrincipal: false,
  dataSource: "warehouse",
  adapter: "trino",
}

describe(trinoUserImpersonation, () => {
  it("impersonates by userName by default", async () => {
    const resolver = trinoUserImpersonation()

    const result = await resolver({
      ...impersonationContext,
      currentUser: { userName: "alice" },
    })

    expect(result).toStrictEqual({ options: { impersonateAs: "alice" } })
  })

  it("impersonates by a custom nameField", async () => {
    const resolver = trinoUserImpersonation({ nameField: "preferred_username" })

    const result = await resolver({
      ...impersonationContext,
      currentUser: { preferred_username: "bob@example.com", userName: "bob" },
    })

    expect(result).toStrictEqual({
      options: { impersonateAs: "bob@example.com" },
    })
  })

  it("returns null when the field is missing", async () => {
    const resolver = trinoUserImpersonation()

    const result = await resolver({
      ...impersonationContext,
      currentUser: { sub: "123" },
    })

    expect(result).toBeNull()
  })

  it("returns null when the field is an empty string", async () => {
    const resolver = trinoUserImpersonation()

    const result = await resolver({
      ...impersonationContext,
      currentUser: { userName: "" },
    })

    expect(result).toBeNull()
  })

  it("returns null when the field is not a string", async () => {
    const resolver = trinoUserImpersonation()

    const result = await resolver({
      ...impersonationContext,
      currentUser: { userName: 42 },
    })

    expect(result).toBeNull()
  })

  it('lowercases the claim with transform "lower"', async () => {
    const resolver = trinoUserImpersonation({
      nameField: "onpremsamaccountname",
      transform: "lower",
    })

    const result = await resolver({
      ...impersonationContext,
      currentUser: { onpremsamaccountname: "MarcusReinhardt" },
    })

    expect(result).toStrictEqual({
      options: { impersonateAs: "marcusreinhardt" },
    })
  })

  it('uppercases the claim with transform "upper"', async () => {
    const resolver = trinoUserImpersonation({ transform: "upper" })

    const result = await resolver({
      ...impersonationContext,
      currentUser: { userName: "alice" },
    })

    expect(result).toStrictEqual({ options: { impersonateAs: "ALICE" } })
  })

  it("applies a custom transform function to the claim value", async () => {
    const resolver = trinoUserImpersonation({
      nameField: "preferred_username",
      transform: (value) => value.split("@")[0] ?? value,
    })

    const result = await resolver({
      ...impersonationContext,
      currentUser: { preferred_username: "marcus@example.com" },
    })

    expect(result).toStrictEqual({ options: { impersonateAs: "marcus" } })
  })

  it("returns null when the transform yields an empty string", async () => {
    const resolver = trinoUserImpersonation({
      transform: () => "",
    })

    const result = await resolver({
      ...impersonationContext,
      currentUser: { userName: "alice" },
    })

    expect(result).toBeNull()
  })
})
