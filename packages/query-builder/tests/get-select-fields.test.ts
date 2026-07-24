import type { FieldNode, GraphQLResolveInfo, SelectionNode } from "graphql"
import { GraphQLError, Kind } from "graphql"
import { describe, expect, test } from "vitest"

import { getSelectFields } from "../src"

// Create mock GraphQLResolveInfo
const createMockInfo = (selections: SelectionNode[], withNodes = false) => {
  let fieldNodes: FieldNode[] = []

  if (withNodes) {
    // Create a nodes field that contains the selections
    const nodesField: FieldNode = {
      kind: Kind.FIELD,
      name: { kind: Kind.NAME, value: "nodes" },
      selectionSet: {
        kind: Kind.SELECTION_SET,
        selections,
      },
    }

    fieldNodes = [
      {
        kind: Kind.FIELD,
        name: { kind: Kind.NAME, value: "someField" },
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections: [nodesField],
        },
      },
    ]
  } else {
    // Use selections directly
    fieldNodes = [
      {
        kind: Kind.FIELD,
        name: { kind: Kind.NAME, value: "someField" },
        selectionSet: {
          kind: Kind.SELECTION_SET,
          selections,
        },
      },
    ]
  }

  return {
    fieldNodes,
  } as unknown as GraphQLResolveInfo
}

describe(getSelectFields, () => {
  test("should extract field names from selections", () => {
    const selections: SelectionNode[] = [
      {
        kind: Kind.FIELD,
        name: { kind: Kind.NAME, value: "field1" },
      },
      {
        kind: Kind.FIELD,
        name: { kind: Kind.NAME, value: "field2" },
      },
    ]

    const info = createMockInfo(selections)
    const result = getSelectFields({ graphqlInfo: info })

    expect(result).toStrictEqual(["field1", "field2"])
  })

  test("should extract field names from nodes when withNodes=true", () => {
    const selections: SelectionNode[] = [
      {
        kind: Kind.FIELD,
        name: { kind: Kind.NAME, value: "field1" },
      },
      {
        kind: Kind.FIELD,
        name: { kind: Kind.NAME, value: "field2" },
      },
    ]

    const info = createMockInfo(selections, true)
    const result = getSelectFields({ graphqlInfo: info, withNodes: true })

    expect(result).toStrictEqual(["field1", "field2"])
  })

  test("should throw error when withNodes=true but no nodes field exists", () => {
    // Create info without nodes field
    const info = {
      fieldNodes: [
        {
          kind: Kind.FIELD,
          name: { kind: Kind.NAME, value: "someField" },
          selectionSet: {
            kind: Kind.SELECTION_SET,
            selections: [
              {
                kind: Kind.FIELD,
                name: { kind: Kind.NAME, value: "notNodes" },
              },
            ],
          },
        },
      ],
    } as unknown as GraphQLResolveInfo

    expect(() =>
      getSelectFields({ graphqlInfo: info, withNodes: true })
    ).toThrow(GraphQLError)
    expect(() =>
      getSelectFields({ graphqlInfo: info, withNodes: true })
    ).toThrow(
      "No fields to return defined. Please specify at least one field inside `nodes`."
    )
  })

  test("should handle empty selections", () => {
    const info = {
      fieldNodes: [
        {
          kind: Kind.FIELD,
          name: { kind: Kind.NAME, value: "someField" },
          selectionSet: {
            kind: Kind.SELECTION_SET,
            selections: [],
          },
        },
      ],
    } as unknown as GraphQLResolveInfo

    const result = getSelectFields({ graphqlInfo: info })
    expect(result).toStrictEqual([])
  })

  test("should handle multiple fieldNodes", () => {
    const info = {
      fieldNodes: [
        {
          kind: Kind.FIELD,
          name: { kind: Kind.NAME, value: "field1" },
          selectionSet: {
            kind: Kind.SELECTION_SET,
            selections: [
              {
                kind: Kind.FIELD,
                name: { kind: Kind.NAME, value: "subField1" },
              },
            ],
          },
        },
        {
          kind: Kind.FIELD,
          name: { kind: Kind.NAME, value: "field2" },
          selectionSet: {
            kind: Kind.SELECTION_SET,
            selections: [
              {
                kind: Kind.FIELD,
                name: { kind: Kind.NAME, value: "subField2" },
              },
            ],
          },
        },
      ],
    } as unknown as GraphQLResolveInfo

    const result = getSelectFields({ graphqlInfo: info })
    expect(result).toStrictEqual(["subField1", "subField2"])
  })
})

describe("getSelectFields - additional cases", () => {
  // Test the error case when withNodes=true but no nodes field exists
  test("should throw error when withNodes=true but no nodes field exists", () => {
    // Create info without nodes field
    const info = {
      fieldNodes: [
        {
          kind: Kind.FIELD,
          name: { kind: Kind.NAME, value: "someField" },
          selectionSet: {
            kind: Kind.SELECTION_SET,
            selections: [
              {
                kind: Kind.FIELD,
                name: { kind: Kind.NAME, value: "notNodes" },
              },
            ],
          },
        },
      ],
    } as unknown as GraphQLResolveInfo

    expect(() =>
      getSelectFields({ graphqlInfo: info, withNodes: true })
    ).toThrow(GraphQLError)
    expect(() =>
      getSelectFields({ graphqlInfo: info, withNodes: true })
    ).toThrow(
      "No fields to return defined. Please specify at least one field inside `nodes`."
    )
  })

  // Test with empty selections
  test("should handle empty selections", () => {
    const info = {
      fieldNodes: [
        {
          kind: Kind.FIELD,
          name: { kind: Kind.NAME, value: "someField" },
          selectionSet: {
            kind: Kind.SELECTION_SET,
            selections: [],
          },
        },
      ],
    } as unknown as GraphQLResolveInfo

    const result = getSelectFields({ graphqlInfo: info })
    expect(result).toStrictEqual([])
  })

  // Test with missing selectionSet
  test("should handle missing selectionSet", () => {
    const info = {
      fieldNodes: [
        {
          kind: Kind.FIELD,
          name: { kind: Kind.NAME, value: "someField" },
          // No selectionSet property
        },
      ],
    } as unknown as GraphQLResolveInfo

    const result = getSelectFields({ graphqlInfo: info })
    expect(result).toStrictEqual([])
  })

  // Test with empty nodes selections
  test("should handle empty nodes selections when withNodes=true", () => {
    const info = {
      fieldNodes: [
        {
          kind: Kind.FIELD,
          name: { kind: Kind.NAME, value: "someField" },
          selectionSet: {
            kind: Kind.SELECTION_SET,
            selections: [
              {
                kind: Kind.FIELD,
                name: { kind: Kind.NAME, value: "nodes" },
                selectionSet: {
                  kind: Kind.SELECTION_SET,
                  selections: [],
                },
              },
            ],
          },
        },
      ],
    } as unknown as GraphQLResolveInfo

    const result = getSelectFields({ graphqlInfo: info, withNodes: true })
    expect(result).toStrictEqual([])
  })

  // Test with nodes field but missing selectionSet
  test("should handle nodes field with missing selectionSet when withNodes=true", () => {
    const info = {
      fieldNodes: [
        {
          kind: Kind.FIELD,
          name: { kind: Kind.NAME, value: "someField" },
          selectionSet: {
            kind: Kind.SELECTION_SET,
            selections: [
              {
                kind: Kind.FIELD,
                name: { kind: Kind.NAME, value: "nodes" },
                // No selectionSet property
              },
            ],
          },
        },
      ],
    } as unknown as GraphQLResolveInfo

    const result = getSelectFields({ graphqlInfo: info, withNodes: true })
    expect(result).toStrictEqual([])
  })
})
