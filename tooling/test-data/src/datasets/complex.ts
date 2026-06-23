import path from "node:path"

import { faker } from "@faker-js/faker"
import { parquetWriteFile } from "hyparquet-writer"

import type { ColumnDefinition } from "../seed/config"
import { jsonSchemaToHyparquetSchema } from "../helpers.js"

/**
 * Trino column definitions for the complex dataset.
 * Uses nested types: ARRAY(VARCHAR) and ARRAY(ROW(...)).
 */
export const complexColumns: ColumnDefinition[] = [
  { name: "name", type: "VARCHAR" },
  { name: "colours", type: "ARRAY(VARCHAR)" },
  { name: "stock", type: "ARRAY(ROW(price DOUBLE, quantity BIGINT))" },
]

const complexSchema = jsonSchemaToHyparquetSchema({
  type: "object",
  properties: {
    name: { type: "string" },
    colours: {
      type: "array",
      items: { type: "string" },
    },
    stock: {
      type: "array",
      items: {
        type: "object",
        properties: {
          price: { type: "number" },
          quantity: { type: "integer" },
        },
        required: ["price", "quantity"],
      },
    },
  },
  required: ["name"],
})

/**
 * Generates the complex dataset (orders with nested arrays) as a Parquet file on disk.
 *
 * @param amount - Number of records to generate
 * @param targetDir - Directory to write the file into
 * @returns Path to the generated Parquet file
 */
export async function complexGenerate(
  amount: number,
  targetDir: string
): Promise<string> {
  const names: string[] = []
  const colours: string[][] = []
  const stock: { price: number; quantity: bigint }[][] = []

  for (let i = 0; i < amount; i += 1) {
    names.push(faker.commerce.productName())
    colours.push(
      Array.from({ length: faker.number.int({ min: 1, max: 4 }) }, () =>
        faker.color.human()
      )
    )
    stock.push(
      Array.from({ length: faker.number.int({ min: 1, max: 5 }) }, () => ({
        price: faker.number.float({ min: 0.5, max: 999, fractionDigits: 2 }),
        quantity: BigInt(faker.number.int({ min: 1, max: 5000 })),
      }))
    )
  }

  const filePath = path.join(targetDir, "data.parquet")

  parquetWriteFile({
    filename: filePath,
    schema: complexSchema,
    columnData: [
      { name: "name", data: names },
      { name: "colours", data: colours },
      { name: "stock", data: stock },
    ],
  })

  return filePath
}
