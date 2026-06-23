import path from "node:path"

import { parquetWriteFile } from "hyparquet-writer"

import type { ColumnDefinition } from "../seed/config"
import { jsonSchemaToHyparquetSchema } from "../helpers.js"

/**
 * Trino column definitions for the simple dataset.
 */
export const simpleColumns: ColumnDefinition[] = [
  { name: "name", type: "VARCHAR" },
  { name: "quantity", type: "BIGINT" },
  { name: "price", type: "DOUBLE" },
  { name: "date", type: "TIMESTAMP(3)" },
  { name: "in_stock", type: "BOOLEAN" },
]

const simpleSchema = jsonSchemaToHyparquetSchema({
  type: "object",
  properties: {
    name: { type: "string" },
    quantity: { type: "integer" },
    price: { type: "number" },
    date: { type: "string", format: "date-time" },
    in_stock: { type: "boolean" },
  },
  required: ["name", "quantity", "price", "date", "in_stock"],
})

/**
 * Generates the simple dataset (products) as a Parquet file on disk.
 *
 * @param amount - Number of records to generate
 * @param targetDir - Directory to write the file into
 * @returns Path to the generated Parquet file
 */
export async function simpleGenerate(
  amount: number,
  targetDir: string
): Promise<string> {
  const names: string[] = []
  const quantities: bigint[] = []
  const prices: number[] = []
  const dates: Date[] = []
  const inStock: boolean[] = []

  for (let i = 0; i < amount; i += 1) {
    names.push(`item-${i}`)
    quantities.push(BigInt(i * 10))
    prices.push(i * 0.5)
    dates.push(new Date())
    inStock.push(i % 2 === 0)
  }

  const filePath = path.join(targetDir, "data.parquet")

  parquetWriteFile({
    filename: filePath,
    schema: simpleSchema,
    columnData: [
      { name: "name", data: names },
      { name: "quantity", data: quantities },
      { name: "price", data: prices },
      { name: "date", data: dates },
      { name: "in_stock", data: inStock },
    ],
  })

  return filePath
}
