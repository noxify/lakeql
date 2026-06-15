import { describe, expect, test } from "vitest"

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
  test("boolean type", () => {
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

  test.each(primitives)("$type", ({ type, expected }) => {
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

describe("error cases", () => {
  test("array with multiple elements", () => {
    expect(() =>
      generateJsonSchema({
        arrayField: ["varchar", "integer"],
        fieldName: "varchar",
      })
    ).toThrow(
      "We expect that an array has only one element ( e.g. a primitive like `varchar` or an object like `row()`." 
    )
  })

  test("array of arrays", () => {
    expect(() =>
      generateJsonSchema({
        fieldName: "varchar",
        nestedArray: [["varchar"]],
      })
    ).toThrow("We currently do not support 'array of array'. Feel free to raise an issue.")
  })

  test("unexpected array content", () => {
    expect(() =>
      generateJsonSchema({
        badArray: [123], // Neither string nor object
        fieldName: "varchar",
      })
    ).toThrow("Unexpected case in `json-generator.handleArray`")
  })
})

describe("complex", () => {
  test("object", () => {
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

  test("object with unknown type", () => {
    expect(() =>
      generateJsonSchema({
        fieldName: "varchar",
        unknownField: "unknown_type",
      })
    ).toThrow("Type unknowntype is unknown.")
  })

  test("array of object", () => {
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

  test("object with error in nested object", () => {
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

  test("nested array of object", () => {
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
