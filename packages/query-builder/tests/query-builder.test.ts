import type { CompiledQuery } from "kysely"
import { describe, expect, it } from "vitest"

import { generateQuery } from "../src"
import { testTrinoDialect } from "./test-dialect"

interface DummyTableDefinition {
  stringField: string
  numberField: number
  boolField: boolean
}

/**
 * Test-only SQL normalizer.
 *
 * Interpolates positional parameters (`$1`, `$2`, …) into the SQL and
 * collapses all runs of whitespace to a single space so that the generated
 * query can be compared against a hand-formatted expected string regardless
 * of indentation. Replaces the former `formatQuery` export, which only ever
 * existed to normalize SQL in this test.
 */
function normalizeSql<T>(query: Pick<CompiledQuery<T>, "sql" | "parameters">) {
  const { parameters, sql: rawSql } = query
  let sql = rawSql
  for (const [index, param] of parameters.entries()) {
    const value = typeof param === "string" ? `'${param}'` : String(param)
    sql = sql.replaceAll(`$${index + 1}`, value)
  }
  return (
    sql
      // collapse all whitespace runs
      .replaceAll(/\s+/gu, " ")
      // normalize spacing around "=" (Kysely emits "1=1", fixtures use "1 = 1")
      .replaceAll(/\s*=\s*/gu, " = ")
      // normalize spacing just inside parentheses (sql-formatter padded them)
      .replaceAll(/\(\s*/gu, "( ")
      .replaceAll(/\s*\)/gu, " )")
      .trim()
      // Kysely lowercases keywords; the hand-formatted fixtures use uppercase.
      // Lower-case both sides so the comparison is keyword-case-insensitive.
      // Identifier casing is covered by the db/get-field-query tests.
      .toLowerCase()
  )
}

describe("Query Builder", () => {
  it("select one field without filter", () => {
    const query = generateQuery<DummyTableDefinition>({
      dialect: testTrinoDialect,
      catalog: "hive",
      schema: "tier1_dummy_lake",
      selectFields: ["stringField"],
      sorting: [{ direction: "asc", field: "stringField" }],
      table: "dummy_table",
      userQuery: {},
    })

    const generatedQuery = normalizeSql(query)

    const expectedQuery = normalizeSql({
      parameters: ["fieldValue"],
      sql: `
        WITH
          "total_count" AS (
              SELECT
                count(*) AS "total_records"
              FROM
                "hive"."tier1_dummy_lake"."dummy_table"
          ),
          "records" AS (
            SELECT
              "stringField",
              TRUE AS "__lakeql_record_present"
            FROM
              "hive"."tier1_dummy_lake"."dummy_table"
            ORDER BY
              "stringField" ASC
            FETCH FIRST
              100 ROWS ONLY
          )
        SELECT
          *
        FROM
          "total_count"
        FULL JOIN "records" ON 1 = 1
        `,
    })

    expect(generatedQuery).toStrictEqual(expectedQuery)
  })

  it("select one field with AND filter", () => {
    const query = generateQuery<DummyTableDefinition>({
      dialect: testTrinoDialect,
      catalog: "hive",
      schema: "tier1_dummy_lake",
      selectFields: ["stringField"],
      sorting: [{ direction: "asc", field: "stringField" }],
      table: "dummy_table",
      userQuery: {
        and: [{ stringField: { eq: "fieldValue" } }],
      },
    })

    const generatedQuery = normalizeSql(query)

    const expectedQuery = normalizeSql({
      parameters: ["fieldValue"],
      sql: `
        WITH
          "total_count" AS (
              SELECT
                count(*) AS "total_records"
              FROM
                "hive"."tier1_dummy_lake"."dummy_table"
              WHERE
                "stringField" = $1
          ),
          "records" AS (
            SELECT
              "stringField",
              TRUE AS "__lakeql_record_present"
            FROM
              "hive"."tier1_dummy_lake"."dummy_table"
            WHERE
                "stringField" = $1
            ORDER BY
              "stringField" ASC
            FETCH FIRST
              100 ROWS ONLY
          )
        SELECT
          *
        FROM
          "total_count"
        FULL JOIN "records" ON 1 = 1
        `,
    })

    expect(generatedQuery).toStrictEqual(expectedQuery)
  })

  it("select one field with multiple AND filters", () => {
    const query = generateQuery<DummyTableDefinition>({
      dialect: testTrinoDialect,
      catalog: "hive",
      schema: "tier1_dummy_lake",
      selectFields: ["stringField"],
      sorting: [{ direction: "asc", field: "stringField" }],
      table: "dummy_table",
      userQuery: {
        and: [
          { stringField: { eq: "fieldValue" } },
          { stringField: { eq: "fieldValue2" } },
        ],
      },
    })
    const generatedQuery = normalizeSql(query)

    const expectedQuery = normalizeSql({
      parameters: ["fieldValue", "fieldValue2"],
      sql: `
        WITH
          "total_count" AS (
              SELECT
                count(*) AS "total_records"
              FROM
                "hive"."tier1_dummy_lake"."dummy_table"
              WHERE
                (
                  "stringField" = $1
                  AND "stringField" = $2
                )
          ),
          "records" AS (
            SELECT
              "stringField",
              TRUE AS "__lakeql_record_present"
            FROM
              "hive"."tier1_dummy_lake"."dummy_table"
            WHERE
              (  
                "stringField" = $1
                AND "stringField" = $2
              )
            ORDER BY
              "stringField" ASC
            FETCH FIRST
              100 ROWS ONLY
          )
        SELECT
          *
        FROM
          "total_count"
        FULL JOIN "records" ON 1 = 1
        `,
    })

    expect(generatedQuery).toStrictEqual(expectedQuery)
  })

  it("select one field with OR filter", () => {
    const query = generateQuery<DummyTableDefinition>({
      dialect: testTrinoDialect,
      catalog: "hive",
      schema: "tier1_dummy_lake",
      selectFields: ["stringField"],
      sorting: [{ direction: "asc", field: "stringField" }],
      table: "dummy_table",
      userQuery: {
        or: [
          { stringField: { eq: "fieldValue" } },
          { stringField: { eq: "fieldValue2" } },
        ],
      },
    })

    const generatedQuery = normalizeSql(query)

    const expectedQuery = normalizeSql({
      parameters: ["fieldValue", "fieldValue2"],
      sql: `
        WITH
          "total_count" AS (
              SELECT
                count(*) AS "total_records"
              FROM
                "hive"."tier1_dummy_lake"."dummy_table"
              WHERE
                (
                  "stringField" = $1
                  OR "stringField" = $2
                )
          ),
          "records" AS (
            SELECT
              "stringField",
              TRUE AS "__lakeql_record_present"
            FROM
              "hive"."tier1_dummy_lake"."dummy_table"
            WHERE
              (  
                "stringField" = $1
                OR "stringField" = $2
              )
            ORDER BY
              "stringField" ASC
            FETCH FIRST
              100 ROWS ONLY
          )
        SELECT
          *
        FROM
          "total_count"
        FULL JOIN "records" ON 1 = 1
        `,
    })

    expect(generatedQuery).toStrictEqual(expectedQuery)
  })

  it("select one field with complex filter", () => {
    const query = generateQuery<DummyTableDefinition>({
      dialect: testTrinoDialect,
      catalog: "hive",
      schema: "tier1_dummy_lake",
      selectFields: ["stringField"],
      sorting: [{ direction: "asc", field: "stringField" }],
      table: "dummy_table",
      userQuery: {
        and: [
          { stringField: { eq: "fieldValue" } },
          {
            or: [
              { stringField: { eq: "fieldValue2" } },
              { stringField: { eq: "fieldValue3" } },
            ],
          },
        ],
      },
    })

    const generatedQuery = normalizeSql(query)

    const expectedQuery = normalizeSql({
      parameters: ["fieldValue", "fieldValue2", "fieldValue3"],
      sql: `
        WITH
          "total_count" AS (
              SELECT
                count(*) AS "total_records"
              FROM
                "hive"."tier1_dummy_lake"."dummy_table"
              WHERE
              (
                "stringField" = $1
                AND (
                  "stringField" = $2
                  OR "stringField" = $3
                )
              )
          ),
          "records" AS (
            SELECT
              "stringField",
              TRUE AS "__lakeql_record_present"
            FROM
              "hive"."tier1_dummy_lake"."dummy_table"
            WHERE
            (
              "stringField" = $1
              AND (
                "stringField" = $2
                OR "stringField" = $3
              )
            )
            ORDER BY
              "stringField" ASC
            FETCH FIRST
              100 ROWS ONLY
          )
        SELECT
          *
        FROM
          "total_count"
        FULL JOIN "records" ON 1 = 1
        `,
    })

    expect(generatedQuery).toStrictEqual(expectedQuery)
  })

  it("select multiple field without filter", () => {
    const query = generateQuery<DummyTableDefinition>({
      dialect: testTrinoDialect,
      catalog: "hive",
      schema: "tier1_dummy_lake",
      selectFields: ["stringField", "numberField"],
      sorting: [{ direction: "asc", field: "stringField" }],
      table: "dummy_table",
      userQuery: {},
    })

    const generatedQuery = normalizeSql(query)

    const expectedQuery = normalizeSql({
      parameters: ["fieldValue", "fieldValue2", "fieldValue3"],
      sql: `
        WITH
          "total_count" AS (
              SELECT
                count(*) AS "total_records"
              FROM
                "hive"."tier1_dummy_lake"."dummy_table"
          ),
          "records" AS (
            SELECT
              "stringField",
              "numberField",
              TRUE AS "__lakeql_record_present"
            FROM
              "hive"."tier1_dummy_lake"."dummy_table"
            ORDER BY
              "stringField" ASC
            FETCH FIRST
              100 ROWS ONLY
          )
        SELECT
          *
        FROM
          "total_count"
        FULL JOIN "records" ON 1 = 1
        `,
    })

    expect(generatedQuery).toStrictEqual(expectedQuery)
  })

  it("select one field multiple sortings", () => {
    const query = generateQuery<DummyTableDefinition>({
      dialect: testTrinoDialect,
      catalog: "hive",
      schema: "tier1_dummy_lake",
      selectFields: ["stringField"],
      sorting: [
        { direction: "asc", field: "stringField" },
        { direction: "desc", field: "numberField" },
      ],
      table: "dummy_table",
      userQuery: {},
    })

    const generatedQuery = normalizeSql(query)

    const expectedQuery = normalizeSql({
      parameters: ["fieldValue"],
      sql: `
        WITH
          "total_count" AS (
              SELECT
                count(*) AS "total_records"
              FROM
                "hive"."tier1_dummy_lake"."dummy_table"
          ),
          "records" AS (
            SELECT
              "stringField",
              TRUE AS "__lakeql_record_present"
            FROM
              "hive"."tier1_dummy_lake"."dummy_table"
            ORDER BY
              "stringField" ASC,
              "numberField" DESC
            FETCH FIRST
              100 ROWS ONLY
          )
        SELECT
          *
        FROM
          "total_count"
        FULL JOIN "records" ON 1 = 1
        `,
    })

    expect(generatedQuery).toStrictEqual(expectedQuery)
  })

  it("select one field with custom paging ( limit )", () => {
    const query = generateQuery<DummyTableDefinition>({
      dialect: testTrinoDialect,
      catalog: "hive",
      paging: {
        limit: 250,
      },
      schema: "tier1_dummy_lake",
      selectFields: ["stringField"],
      sorting: [{ direction: "asc", field: "stringField" }],
      table: "dummy_table",
      userQuery: {},
    })

    const generatedQuery = normalizeSql(query)

    const expectedQuery = normalizeSql({
      parameters: ["fieldValue"],
      sql: `
        WITH
          "total_count" AS (
              SELECT
                count(*) AS "total_records"
              FROM
                "hive"."tier1_dummy_lake"."dummy_table"
          ),
          "records" AS (
            SELECT
              "stringField",
              TRUE AS "__lakeql_record_present"
            FROM
              "hive"."tier1_dummy_lake"."dummy_table"
            ORDER BY
              "stringField" ASC
            FETCH FIRST
              250 ROWS ONLY
          )
        SELECT
          *
        FROM
          "total_count"
        FULL JOIN "records" ON 1 = 1
        `,
    })

    expect(generatedQuery).toStrictEqual(expectedQuery)
  })

  it("select one field with custom paging ( limit & offset )", () => {
    const query = generateQuery<DummyTableDefinition>({
      dialect: testTrinoDialect,
      catalog: "hive",
      paging: {
        limit: 250,
        offset: 250,
      },
      schema: "tier1_dummy_lake",
      selectFields: ["stringField"],
      sorting: [{ direction: "asc", field: "stringField" }],
      table: "dummy_table",
      userQuery: {},
    })

    const generatedQuery = normalizeSql(query)

    const expectedQuery = normalizeSql({
      parameters: ["fieldValue"],
      sql: `
        WITH
          "total_count" AS (
              SELECT
                count(*) AS "total_records"
              FROM
                "hive"."tier1_dummy_lake"."dummy_table"
          ),
          "records" AS (
            SELECT
              "stringField",
              TRUE AS "__lakeql_record_present"
            FROM
              "hive"."tier1_dummy_lake"."dummy_table"
            ORDER BY
              "stringField" ASC
            OFFSET 250
            FETCH NEXT
              250 ROWS ONLY
          )
        SELECT
          *
        FROM
          "total_count"
        FULL JOIN "records" ON 1 = 1
        `,
    })

    expect(generatedQuery).toStrictEqual(expectedQuery)
  })

  it("select one field with custom paging ( offset )", () => {
    const query = generateQuery<DummyTableDefinition>({
      dialect: testTrinoDialect,
      catalog: "hive",
      paging: {
        offset: 200,
      },
      schema: "tier1_dummy_lake",
      selectFields: ["stringField"],
      sorting: [{ direction: "asc", field: "stringField" }],
      table: "dummy_table",
      userQuery: {},
    })

    const generatedQuery = normalizeSql(query)

    const expectedQuery = normalizeSql({
      parameters: ["fieldValue"],
      sql: `
        WITH
          "total_count" AS (
              SELECT
                count(*) AS "total_records"
              FROM
                "hive"."tier1_dummy_lake"."dummy_table"
          ),
          "records" AS (
            SELECT
              "stringField",
              TRUE AS "__lakeql_record_present"
            FROM
              "hive"."tier1_dummy_lake"."dummy_table"
            ORDER BY
              "stringField" ASC
            OFFSET 200
            FETCH NEXT
              100 ROWS ONLY
          )
        SELECT
          *
        FROM
          "total_count"
        FULL JOIN "records" ON 1 = 1
        `,
    })

    expect(generatedQuery).toStrictEqual(expectedQuery)
  })

  it("select with transformFields without filter", () => {
    const query = generateQuery<DummyTableDefinition>({
      dialect: testTrinoDialect,
      catalog: "hive",
      schema: "tier1_dummy_lake",
      selectFields: ["stringField", "numberField"],
      sorting: [{ direction: "asc", field: "stringField" }],
      table: "dummy_table",
      transformFields: {
        numberField: "nümber-field",
        stringField: "string-field",
      },
      userQuery: {},
    })

    const generatedQuery = normalizeSql(query)

    const expectedQuery = normalizeSql({
      parameters: ["fieldValue"],
      sql: `
        WITH
          "total_count" AS (
            SELECT
              count(*) AS "total_records"
            FROM
              "hive"."tier1_dummy_lake"."dummy_table"
          ),
          "records" AS (
            SELECT
              "string-field" as "string-field",
              "nümber-field" as "nümber-field",
              TRUE AS "__lakeql_record_present"
            FROM
              "hive"."tier1_dummy_lake"."dummy_table"
            ORDER BY
              "string-field" ASC
            FETCH FIRST
              100 ROWS ONLY
          )
        SELECT
          *
        FROM
          "total_count"
        FULL JOIN "records" ON 1 = 1
        `,
    })

    expect(generatedQuery).toStrictEqual(expectedQuery)
  })

  it("select with transformFields with filter", () => {
    const query = generateQuery<DummyTableDefinition>({
      dialect: testTrinoDialect,
      catalog: "hive",
      schema: "tier1_dummy_lake",
      selectFields: ["stringField", "numberField"],
      sorting: [{ direction: "asc", field: "stringField" }],
      table: "dummy_table",
      transformFields: {
        numberField: "nümber-field",
        stringField: "string-field",
      },
      userQuery: {
        and: [
          {
            stringField: {
              eq: "fieldValue",
            },
          },
        ],
      },
    })

    const generatedQuery = normalizeSql(query)

    const expectedQuery = normalizeSql({
      parameters: ["fieldValue"],
      sql: `
        WITH
          "total_count" AS (
            SELECT
              count(*) AS "total_records"
            FROM
              "hive"."tier1_dummy_lake"."dummy_table"
            WHERE
              "string-field" = 'fieldValue'
          ),
          "records" AS (
            SELECT
              "string-field" as "string-field",
              "nümber-field" as "nümber-field",
              TRUE AS "__lakeql_record_present"
            FROM
              "hive"."tier1_dummy_lake"."dummy_table"
            WHERE
              "string-field" = 'fieldValue'
            ORDER BY
              "string-field" ASC
            FETCH FIRST
              100 ROWS ONLY
          )
        SELECT
          *
        FROM
          "total_count"
        FULL JOIN "records" ON 1 = 1
        `,
    })

    expect(generatedQuery).toStrictEqual(expectedQuery)
  })
})
