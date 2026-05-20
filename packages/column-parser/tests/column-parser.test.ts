import { describe, expect, test } from "vitest"

import { parseColumns } from "../src/index"

const primitives = [
  {
    input: "varchar",
    output: "varchar",
  },
  {
    input: "integer",
    output: "integer",
  },
  {
    input: "boolean",
    output: "boolean",
  },
  {
    input: "array(varchar)",
    output: ["varchar"],
  },
  {
    input: "timestamp(3)",
    output: "timestamp(3)",
  },
  {
    input: "bigint",
    output: "bigint",
  },
]

describe("Column Parser", () => {
  describe("primitives", () => {
    test.each(primitives)("$input", ({ input, output }) => {
      const mockedColumns = [
        {
          description: "",
          extra: "",
          name: "fieldname",
          type: input,
        },
      ]

      const expected = {
        fieldname: output,
      }

      const generated = parseColumns(mockedColumns)
      expect(generated).toMatchObject(expected)
    })
  })

  test("objects ( row() )", () => {
    const mockedColumns = [
      {
        description: "",
        extra: "",
        name: "fieldname",
        type: "row(sub1 varchar, sub2 integer, sub3 boolean)",
      },
    ]

    const expected = {
      fieldname: {
        sub1: "varchar",
        sub2: "integer",
        sub3: "boolean",
      },
    }

    const generated = parseColumns(mockedColumns)
    expect(generated).toMatchObject(expected)
  })

  test("array of objects w/o nesting", () => {
    const mockedColumns = [
      {
        description: "",
        extra: "",
        name: "fieldname",
        type: "array(row(sub1 varchar, sub2 integer, sub3 boolean))",
      },
    ]

    const expected = {
      fieldname: [
        {
          sub1: "varchar",
          sub2: "integer",
          sub3: "boolean",
        },
      ],
    }

    const generated = parseColumns(mockedColumns)
    expect(generated).toMatchObject(expected)
  })

  test("array of objects w/ nesting", () => {
    const mockedColumns = [
      {
        description: "",
        extra: "",
        name: "fieldname",
        type: "row(name varchar, array_sub1 array(row(sub1 varchar, sub2 array(row(subele1 varchar)))), sub3 boolean)",
      },
      {
        description: "",
        extra: "",
        name: "fieldname2",
        type: "varchar",
      },
    ]

    const expected = {
      fieldname: {
        array_sub1: [
          {
            sub1: "varchar",
            sub2: [
              {
                subele1: "varchar",
              },
            ],
          },
        ],
        name: "varchar",
        sub3: "boolean",
      },
      fieldname2: "varchar",
    }

    const generated = parseColumns(mockedColumns)
    expect(generated).toMatchObject(expected)
  })
})
