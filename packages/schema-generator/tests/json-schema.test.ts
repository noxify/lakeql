import { describe, expect, it } from "vitest"

import { generateJsonSchema } from "../src/json-schema"

const primitives = [
  {
    expected: {
      type: "string",
    },
    type: "varchar",
  },
  {
    expected: {
      type: "number",
    },
    type: "decimal(38,10)",
  },

  {
    expected: {
      type: "number",
    },
    type: "double",
  },

  {
    expected: {
      type: "number",
    },
    type: "float",
  },

  {
    expected: {
      type: "integer",
    },
    type: "integer",
  },

  {
    expected: {
      type: "integer",
    },
    type: "bigint",
  },

  {
    expected: {
      format: "date-time",
      type: "string",
    },
    type: "timestamp(3)",
  },

  {
    expected: {
      format: "date",
      type: "string",
    },
    type: "date",
  },

  {
    expected: {
      items: {
        type: "string",
      },
      type: "array",
    },
    type: ["varchar"],
  },
]

describe("simple", () => {
  it("boolean type", () => {
    const generatedSchema = generateJsonSchema({
      fieldName: "boolean",
    })

    const expectedSchema = {
      $schema: "https://json-schema.org/draft-07/schema#",
      properties: {
        fieldName: {
          type: "boolean",
        },
      },
      type: "object",
    }

    expect(generatedSchema).toMatchObject(expectedSchema)
  })

  it.each(primitives)("$type", ({ type, expected }) => {
    const generatedSchema = generateJsonSchema({
      fieldName: type,
    })

    const expectedSchema = {
      $schema: "https://json-schema.org/draft-07/schema#",
      properties: {
        fieldName: {
          ...expected,
        },
      },
      type: "object",
    }

    expect(generatedSchema).toMatchObject(expectedSchema)
  })
})

describe("type normalization (native regex)", () => {
  // Locks in behavior equivalence after dropping magic-regexp: parameterized
  // SQL type strings are normalized to their base type word before the switch.
  const normalizationCases = [
    { type: "timestamp(3)", expected: { format: "date-time", type: "string" } },
    { type: "decimal(3,10)", expected: { type: "number" } },
    { type: "varchar", expected: { type: "string" } },
    { type: "integer", expected: { type: "integer" } },
  ]

  it.each(normalizationCases)("normalizes $type", ({ type, expected }) => {
    const generatedSchema = generateJsonSchema({
      fieldName: type,
    })

    expect(generatedSchema).toMatchObject({
      $schema: "https://json-schema.org/draft-07/schema#",
      properties: {
        fieldName: {
          ...expected,
        },
      },
      type: "object",
    })
  })
})

describe("error cases", () => {
  it("array with multiple elements", () => {
    expect(() =>
      generateJsonSchema({
        arrayField: ["varchar", "integer"],
        fieldName: "varchar",
      })
    ).toThrow(
      "We expect that an array has only one element ( e.g. a primitive like `varchar` or an object like `row()`."
    )
  })

  it("array of arrays", () => {
    expect(() =>
      generateJsonSchema({
        fieldName: "varchar",
        nestedArray: [["varchar"]],
      })
    ).toThrow(
      "We currently do not support 'array of array'. Feel free to raise an issue."
    )
  })

  it("unexpected array content", () => {
    expect(() =>
      generateJsonSchema({
        badArray: [123], // Neither string nor object
        fieldName: "varchar",
      })
    ).toThrow("Unexpected case in `json-generator.handleArray`")
  })
})

describe("complex", () => {
  it("object", () => {
    const generatedSchema = generateJsonSchema({
      fieldName: "varchar",
      objField: {
        fieldName1: "varchar",
        fieldName2: "integer",
      },
    })

    const expectedSchema = {
      $schema: "https://json-schema.org/draft-07/schema#",
      properties: {
        fieldName: {
          type: "string",
        },
        objField: {
          properties: {
            fieldName1: {
              type: "string",
            },
            fieldName2: {
              type: "integer",
            },
          },
          type: "object",
        },
      },
      type: "object",
    }

    expect(generatedSchema).toMatchObject(expectedSchema)
  })

  it("object with unknown type", () => {
    expect(() =>
      generateJsonSchema({
        fieldName: "varchar",
        unknownField: "unknown_type",
      })
    ).toThrow("Type unknowntype is unknown.")
  })

  it("array of object", () => {
    const generatedSchema = generateJsonSchema({
      arrObjField: [
        {
          fieldName1: "varchar",
          fieldName2: "integer",
        },
      ],
      fieldName: "varchar",
    })

    const expectedSchema = {
      $schema: "https://json-schema.org/draft-07/schema#",
      properties: {
        arrObjField: {
          items: {
            properties: {
              fieldName1: {
                type: "string",
              },
              fieldName2: {
                type: "integer",
              },
            },
            type: "object",
          },
          type: "array",
        },
        fieldName: {
          type: "string",
        },
      },
      type: "object",
    }

    expect(generatedSchema).toMatchObject(expectedSchema)
  })

  it("object with error in nested object", () => {
    expect(() =>
      generateJsonSchema({
        fieldName: "varchar",
        objField: {
          invalidField: "unknown_type",
          validField: "varchar",
        },
      })
    ).toThrow("Type unknowntype is unknown.")
  })

  it("nested array of object", () => {
    const generatedSchema = generateJsonSchema({
      arrObjField: [
        {
          fieldName1: {
            sub1: ["varchar"],
            sub2: {
              sub3: "varchar",
            },
          },
          fieldName2: "integer",
        },
      ],
      fieldName: "varchar",
    })

    const expectedSchema = {
      $schema: "https://json-schema.org/draft-07/schema#",
      properties: {
        arrObjField: {
          items: {
            properties: {
              fieldName1: {
                properties: {
                  sub1: {
                    items: {
                      type: "string",
                    },
                    type: "array",
                  },
                  sub2: {
                    properties: {
                      sub3: {
                        type: "string",
                      },
                    },
                    type: "object",
                  },
                },
                type: "object",
              },
              fieldName2: {
                type: "integer",
              },
            },
            type: "object",
          },
          type: "array",
        },
        fieldName: {
          type: "string",
        },
      },
      type: "object",
    }

    expect(generatedSchema).toMatchObject(expectedSchema)
  })
})
