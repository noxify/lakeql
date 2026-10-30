import { afterEach, describe, expect, it } from "vitest"

import {
  featureRegistry,
  listFeatureIds,
  resolveFeatureTemplate,
  UnknownFeatureError,
} from "../src/features/registry"
import type { FeatureTemplate } from "../src/features/types"

function fixtureTemplate(id: string): FeatureTemplate {
  return {
    id,
    description: `fixture ${id}`,
    checkPreconditions: () => {
      // no preconditions for the fixture
    },
    build: () => ({ ops: [], nextSteps: [] }),
  }
}

const seededIds = new Set<string>()

function seed(id: string): FeatureTemplate {
  const template = fixtureTemplate(id)
  featureRegistry[id] = template
  seededIds.add(id)
  return template
}

/** Resolve and return the thrown error (or undefined when none is thrown). */
function captureResolveError(id: string): unknown {
  try {
    resolveFeatureTemplate(id)
    return undefined
  } catch (error) {
    return error
  }
}

describe("feature registry", () => {
  afterEach(() => {
    for (const id of seededIds) {
      Reflect.deleteProperty(featureRegistry, id)
    }
    seededIds.clear()
  })

  it("resolves a registered template by id", () => {
    const template = seed("fixture-known")

    expect(resolveFeatureTemplate("fixture-known")).toBe(template)
  })

  it("throws UnknownFeatureError for an unregistered id", () => {
    expect(() => resolveFeatureTemplate("does-not-exist")).toThrow(
      UnknownFeatureError
    )
  })

  it("carries the available ids on the unknown-id error, sorted", () => {
    seed("fixture-zebra")
    seed("fixture-alpha")

    const error = captureResolveError("missing")

    expect(error).toBeInstanceOf(UnknownFeatureError)
    const unknown = error as UnknownFeatureError
    expect(unknown.id).toBe("missing")
    expect([...unknown.availableIds]).toStrictEqual(
      [...unknown.availableIds].toSorted((a, b) => a.localeCompare(b))
    )
  })

  it("lists both seeded ids on the unknown-id error", () => {
    seed("fixture-zebra")
    seed("fixture-alpha")

    const error = captureResolveError("missing") as UnknownFeatureError

    expect(error.availableIds).toContain("fixture-alpha")
    expect(error.availableIds).toContain("fixture-zebra")
    expect(error.message).toContain("fixture-alpha")
    expect(error.message).toContain("fixture-zebra")
  })

  it("reports (none) when the available-id list is empty", () => {
    const error = new UnknownFeatureError("x", [])

    expect(error.availableIds).toStrictEqual([])
    expect(error.message).toContain("(none)")
  })

  it("includes the shipped fabric-obo template", () => {
    expect(listFeatureIds()).toContain("fabric-obo")
  })

  it("lists the registered ids sorted", () => {
    seed("fixture-c")
    seed("fixture-a")
    seed("fixture-b")

    const ids = listFeatureIds()

    expect(ids).toStrictEqual([...ids].toSorted((a, b) => a.localeCompare(b)))
    expect(ids).toContain("fixture-a")
    expect(ids).toContain("fixture-b")
    expect(ids).toContain("fixture-c")
  })
})
