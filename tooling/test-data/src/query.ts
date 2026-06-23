import { TrinoClient } from "@lakeql/trino-client"
import { cli } from "cleye"

import { MINITRINO } from "./seed/defaults"

const parsed = cli({
  name: "query",
  parameters: ["<sql>"],
  flags: {
    format: {
      type: String,
      alias: "f",
      default: "table",
      description: 'Output format: "table" | "json" | "csv" (default: table)',
    },
    catalog: {
      type: String,
      default: MINITRINO.trino.catalog,
      description: `Trino catalog (default: ${MINITRINO.trino.catalog})`,
    },
    schema: {
      type: String,
      alias: "s",
      description: "Trino schema to use",
    },
  },
  strictFlags: true,
})

type OutputFormat = "table" | "json" | "csv"

function validateFormat(value: string): OutputFormat {
  if (value !== "table" && value !== "json" && value !== "csv") {
    console.error(
      `Invalid format "${value}". Allowed values: table, json, csv`
    )
    process.exit(1)
  }
  return value
}

function formatTable(
  columns: string[],
  rows: unknown[][]
): string {
  if (rows.length === 0) {
    return `(0 rows)\n\nColumns: ${columns.join(", ")}`
  }

  // Calculate column widths
  const widths = columns.map((col, i) =>
    Math.max(
      col.length,
      ...rows.map((row) => String(row[i] ?? "NULL").length)
    )
  )

  const separator = widths.map((w) => "─".repeat(w + 2)).join("┼")
  const header = columns
    .map((col, i) => ` ${col.padEnd(widths[i] ?? 0)} `)
    .join("│")

  const dataRows = rows.map((row) =>
    row
      .map((val, i) => ` ${String(val ?? "NULL").padEnd(widths[i] ?? 0)} `)
      .join("│")
  )

  return [header, separator, ...dataRows, "", `(${rows.length} rows)`].join(
    "\n"
  )
}

function formatCsv(columns: string[], rows: unknown[][]): string {
  const escape = (val: unknown) => {
    const str = String(val ?? "")
    return str.includes(",") || str.includes('"') || str.includes("\n")
      ? `"${str.replace(/"/g, '""')}"`
      : str
  }

  const lines = [
    columns.map(escape).join(","),
    ...rows.map((row) => row.map(escape).join(",")),
  ]

  return lines.join("\n")
}

async function main() {
  const sql = parsed._.sql
  const format = validateFormat(parsed.flags.format)

  if (!sql) {
    console.error("Please provide a SQL query as argument.")
    console.error('Example: pnpm query "SELECT * FROM hive.test.products LIMIT 5"')
    process.exit(1)
  }

  const client = new TrinoClient({
    host: MINITRINO.trino.host,
    port: MINITRINO.trino.port,
    auth: MINITRINO.trino.auth,
    catalog: parsed.flags.catalog,
    schema: parsed.flags.schema,
  })

  try {
    // Use the raw query to get columns + data
    const rows = await client.query<unknown[]>({ sql })

    // Get column info via a describe-like approach
    // The TrinoClient returns raw arrays — we need column names
    // Let's do a quick columns fetch from the first result page
    const columnNames = await getColumnNames(client, sql)

    if (format === "json") {
      // Convert to array of objects
      const objects = rows.map((row) =>
        Object.fromEntries(
          columnNames.map((col, i) => [col, (row as unknown[])[i]])
        )
      )
      console.log(JSON.stringify(objects, null, 2))
    } else if (format === "csv") {
      console.log(formatCsv(columnNames, rows as unknown[][]))
    } else {
      console.log(formatTable(columnNames, rows as unknown[][]))
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Query failed: ${message}`)
    process.exit(1)
  }
}

/**
 * Fetches column names by running the query through the raw statement endpoint
 * and reading the columns from the first result page.
 */
async function getColumnNames(
  client: TrinoClient,
  sql: string
): Promise<string[]> {
  // We need to get column metadata. The simplest approach:
  // wrap in a LIMIT 0 subquery to get column info without re-executing.
  // But that's fragile. Instead, let's use the stream API which gives us columns.
  const response = await fetch(
    `${client.host}:${client.port}/v1/statement`,
    {
      method: "POST",
      body: sql,
      headers: client.getHeaders(),
    }
  )

  if (!response.ok) {
    return []
  }

  const result = (await response.json()) as {
    columns?: { name: string }[]
    nextUri?: string
  }

  // Cancel the query since we only needed column names
  if (result.nextUri) {
    // Follow until we get columns or it finishes
    let nextUri = result.nextUri
    let columns = result.columns

    while (!columns && nextUri) {
      // oxlint-disable-next-line no-await-in-loop
      const nextResponse = await fetch(nextUri, {
        headers: client.getHeaders(),
      })
      // oxlint-disable-next-line no-await-in-loop
      const nextResult = (await nextResponse.json()) as {
        columns?: { name: string }[]
        nextUri?: string
      }
      columns = nextResult.columns
      nextUri = nextResult.nextUri ?? ""
    }

    return columns?.map((c) => c.name) ?? []
  }

  return result.columns?.map((c) => c.name) ?? []
}

try {
  await main()
} catch (error) {
  console.error(error)
  process.exit(1)
}
