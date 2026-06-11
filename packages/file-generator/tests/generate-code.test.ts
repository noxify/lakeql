import { describe, expect, test } from "vitest"

import { generateCode } from "../src"
import {
  exportedConstStatement,
  stringLiteral,
  importNames,
} from "../src/ast-builders"

describe("generateCode function", () => {
  test("generates formatted TypeScript source from a variable statement", async () => {
    const node = exportedConstStatement("greeting", stringLiteral("hello"))
    const result = await generateCode({ fileName: "test.ts", nodes: [node] })

    expect(result.fileName).toBe("test.ts")
    expect(result.text).toContain("export const greeting")
    expect(result.text).toContain('"hello"')
  })

  test("returns correct fileName on the SourceFile", async () => {
    const node = exportedConstStatement("x", stringLiteral("y"))
    const result = await generateCode({ fileName: "output.ts", nodes: [node] })

    expect(result.fileName).toBe("output.ts")
  })

  test("handles multiple nodes separated properly", async () => {
    const node1 = exportedConstStatement("first", stringLiteral("1"))
    const node2 = exportedConstStatement("second", stringLiteral("2"))
    const result = await generateCode({
      fileName: "multi.ts",
      nodes: [node1, node2],
    })

    expect(result.text).toContain("export const first")
    expect(result.text).toContain("export const second")
  })

  test("handles import declarations", async () => {
    const importNode = importNames("my-module", ["foo", "bar"])
    const constNode = exportedConstStatement("val", stringLiteral("x"))
    const result = await generateCode({
      fileName: "imports.ts",
      nodes: [importNode, constNode],
    })

    expect(result.text).toContain("import")
    expect(result.text).toContain("my-module")
    expect(result.text).toContain("foo")
    expect(result.text).toContain("bar")
  })

  test("handles empty nodes array", async () => {
    const result = await generateCode({ fileName: "empty.ts", nodes: [] })

    expect(result.fileName).toBe("empty.ts")
    // Empty input should produce empty or whitespace-only output
    expect(result.text.trim()).toBe("")
  })
})
