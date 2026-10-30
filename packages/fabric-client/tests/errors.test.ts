import { describe, expect, it } from "vitest"

import {
  FabricCancellationError,
  FabricClientError,
  FabricQueryError,
  FabricTimeoutError,
} from "../src"

describe(FabricClientError, () => {
  it("sets name to FabricClientError", () => {
    const error = new FabricClientError("connection failed")
    expect(error.name).toBe("FabricClientError")
  })

  it("stores the message", () => {
    const error = new FabricClientError("connection failed")
    expect(error.message).toBe("connection failed")
  })

  it("stores an optional statusCode", () => {
    const error = new FabricClientError("unauthorized", 401)
    expect(error.statusCode).toBe(401)
  })

  it("leaves statusCode undefined when not provided", () => {
    const error = new FabricClientError("connection failed")
    expect(error.statusCode).toBeUndefined()
  })

  it("is an instance of Error", () => {
    const error = new FabricClientError("fail")
    expect(error).toBeInstanceOf(Error)
  })
})

describe(FabricQueryError, () => {
  it("sets name to FabricQueryError", () => {
    const error = new FabricQueryError("invalid syntax", 102, 1)
    expect(error.name).toBe("FabricQueryError")
  })

  it("stores errorNumber and state", () => {
    const error = new FabricQueryError("invalid syntax", 102, 1)
    expect(error.errorNumber).toBe(102)
    expect(error.state).toBe(1)
  })

  it("stores the message", () => {
    const error = new FabricQueryError("invalid column", 207, 1)
    expect(error.message).toBe("invalid column")
  })

  it("is an instance of Error", () => {
    const error = new FabricQueryError("fail", 0, 0)
    expect(error).toBeInstanceOf(Error)
  })
})

describe(FabricTimeoutError, () => {
  it("sets name to FabricTimeoutError", () => {
    const error = new FabricTimeoutError("query timed out")
    expect(error.name).toBe("FabricTimeoutError")
  })

  it("stores the message", () => {
    const error = new FabricTimeoutError("query timed out after 30s")
    expect(error.message).toBe("query timed out after 30s")
  })

  it("is an instance of Error", () => {
    const error = new FabricTimeoutError("timeout")
    expect(error).toBeInstanceOf(Error)
  })
})

describe(FabricCancellationError, () => {
  it("sets name to FabricCancellationError", () => {
    const error = new FabricCancellationError("cancelled")
    expect(error.name).toBe("FabricCancellationError")
  })

  it("stores the message", () => {
    const error = new FabricCancellationError("user cancelled")
    expect(error.message).toBe("user cancelled")
  })

  it("is an instance of Error", () => {
    const error = new FabricCancellationError("cancelled")
    expect(error).toBeInstanceOf(Error)
  })
})
