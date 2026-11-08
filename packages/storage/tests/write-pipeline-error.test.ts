import { describe, expect, it } from "vitest"

import { WritePipelineError } from "../src/write-pipeline-error"

describe(WritePipelineError, () => {
  describe("phase and committed semantics", () => {
    it("serialize phase has committed = false", () => {
      const cause = new Error("parquet encoding failed")
      const error = new WritePipelineError("serialize", cause)

      expect(error.phase).toBe("serialize")
      expect(error.committed).toBeFalsy()
    })

    it("upload phase has committed = false", () => {
      const cause = new Error("S3 connection timeout")
      const error = new WritePipelineError("upload", cause)

      expect(error.phase).toBe("upload")
      expect(error.committed).toBeFalsy()
    })

    it("ddl phase has committed = false", () => {
      const cause = new Error("CREATE TABLE failed")
      const error = new WritePipelineError("ddl", cause)

      expect(error.phase).toBe("ddl")
      expect(error.committed).toBeFalsy()
    })

    it("cleanup phase has committed = true", () => {
      const cause = new Error("failed to delete old files")
      const error = new WritePipelineError("cleanup", cause)

      expect(error.phase).toBe("cleanup")
      expect(error.committed).toBeTruthy()
    })
  })

  describe("error message", () => {
    it("includes phase name in message", () => {
      const error = new WritePipelineError(
        "upload",
        new Error("connection refused")
      )

      expect(error.message).toContain("upload")
    })

    it("includes underlying cause message", () => {
      const cause = new Error("bucket not found")
      const error = new WritePipelineError("upload", cause)

      expect(error.message).toContain("bucket not found")
    })

    it("handles non-Error cause (string)", () => {
      const error = new WritePipelineError("serialize", "unexpected failure")

      expect(error.message).toContain("serialize")
      expect(error.message).toContain("unexpected failure")
    })

    it("supports custom message override", () => {
      const cause = new Error("timeout")
      const error = new WritePipelineError(
        "ddl",
        cause,
        "Custom DDL error context"
      )

      expect(error.message).toBe("Custom DDL error context")
    })
  })

  describe("error chain", () => {
    it("preserves cause via Error.cause", () => {
      const cause = new Error("underlying issue")
      const error = new WritePipelineError("upload", cause)

      expect(error.cause).toBe(cause)
    })

    it("preserves non-Error cause", () => {
      const cause = { code: "ECONNRESET" }
      const error = new WritePipelineError("ddl", cause)

      expect(error.cause).toBe(cause)
    })
  })

  describe("error identity", () => {
    it("is an instance of Error", () => {
      const error = new WritePipelineError("serialize", new Error("fail"))

      expect(error).toBeInstanceOf(Error)
    })

    it("is an instance of WritePipelineError", () => {
      const error = new WritePipelineError("cleanup", new Error("fail"))

      expect(error).toBeInstanceOf(WritePipelineError)
    })

    it("has name set to WritePipelineError", () => {
      const error = new WritePipelineError("upload", new Error("fail"))

      expect(error.name).toBe("WritePipelineError")
    })
  })
})
