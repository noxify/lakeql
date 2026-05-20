import { describe, expect, test } from "vitest"

import { formatQuery, generateQuery } from "../src"

interface DummyTableDefinition {
  stringField: string
  numberField: number
  boolField: boolean
}

describe("Query Builder", () => {
  test("select one field without filter", () => {
    const query = generateQuery<DummyTableDefinition>({
      catalog: "hive",
      schema: "tier1_dummy_lake",
      selectFields: ["stringField"],
      sorting: [{ direction: "asc", field: "stringField" }],
      table: "dummy_table",
      userQuery: {},
    })

    const generatedQuery = formatQuery({ query })

    const expectedQuery = formatQuery({
      query: {
        parameters: ["fieldValue"],
        query: { kind: "RawNode", parameters: [], sqlFragments: [] },
        queryId: { queryId: "query" },
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
              "stringField"
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
        FULL JOIN "records" ON TRUE
        `,
      },
    })

    expect(generatedQuery).toStrictEqual(expectedQuery)
  })

  test("select one field with AND filter", () => {
    const query = generateQuery<DummyTableDefinition>({
      catalog: "hive",
      schema: "tier1_dummy_lake",
      selectFields: ["stringField"],
      sorting: [{ direction: "asc", field: "stringField" }],
      table: "dummy_table",
      userQuery: {
        and: [{ stringField: { eq: "fieldValue" } }],
      },
    })

    const generatedQuery = formatQuery({ query })

    const expectedQuery = formatQuery({
      query: {
        parameters: ["fieldValue"],
        query: { kind: "RawNode", parameters: [], sqlFragments: [] },
        queryId: { queryId: "query" },
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
              "stringField"
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
        FULL JOIN "records" ON TRUE
        `,
      },
    })

    expect(generatedQuery).toStrictEqual(expectedQuery)
  })

  test("select one field with multiple AND filters", () => {
    const query = generateQuery<DummyTableDefinition>({
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
    const generatedQuery = formatQuery({ query })

    const expectedQuery = formatQuery({
      query: {
        parameters: ["fieldValue", "fieldValue2"],
        query: { kind: "RawNode", parameters: [], sqlFragments: [] },
        queryId: { queryId: "query" },
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
              "stringField"
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
        FULL JOIN "records" ON TRUE
        `,
      },
    })

    expect(generatedQuery).toStrictEqual(expectedQuery)
  })

  test("select one field with OR filter", () => {
    const query = generateQuery<DummyTableDefinition>({
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

    const generatedQuery = formatQuery({ query })

    const expectedQuery = formatQuery({
      query: {
        parameters: ["fieldValue", "fieldValue2"],
        query: { kind: "RawNode", parameters: [], sqlFragments: [] },
        queryId: { queryId: "query" },
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
              "stringField"
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
        FULL JOIN "records" ON TRUE
        `,
      },
    })

    expect(generatedQuery).toStrictEqual(expectedQuery)
  })

  test("select one field with complex filter", () => {
    const query = generateQuery<DummyTableDefinition>({
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

    const generatedQuery = formatQuery({ query })

    const expectedQuery = formatQuery({
      query: {
        parameters: ["fieldValue", "fieldValue2", "fieldValue3"],
        query: { kind: "RawNode", parameters: [], sqlFragments: [] },
        queryId: { queryId: "query" },
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
              "stringField"
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
        FULL JOIN "records" ON TRUE
        `,
      },
    })

    expect(generatedQuery).toStrictEqual(expectedQuery)
  })

  test("select multiple field without filter", () => {
    const query = generateQuery<DummyTableDefinition>({
      catalog: "hive",
      schema: "tier1_dummy_lake",
      selectFields: ["stringField", "numberField"],
      sorting: [{ direction: "asc", field: "stringField" }],
      table: "dummy_table",
      userQuery: {},
    })

    const generatedQuery = formatQuery({ query })

    const expectedQuery = formatQuery({
      query: {
        parameters: ["fieldValue", "fieldValue2", "fieldValue3"],
        query: { kind: "RawNode", parameters: [], sqlFragments: [] },
        queryId: { queryId: "query" },
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
              "numberField"
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
        FULL JOIN "records" ON TRUE
        `,
      },
    })

    expect(generatedQuery).toStrictEqual(expectedQuery)
  })

  test("select one field multiple sortings", () => {
    const query = generateQuery<DummyTableDefinition>({
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

    const generatedQuery = formatQuery({ query })

    const expectedQuery = formatQuery({
      query: {
        parameters: ["fieldValue"],
        query: { kind: "RawNode", parameters: [], sqlFragments: [] },
        queryId: { queryId: "query" },
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
              "stringField"
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
        FULL JOIN "records" ON TRUE
        `,
      },
    })

    expect(generatedQuery).toStrictEqual(expectedQuery)
  })

  test("select one field with custom paging ( limit )", () => {
    const query = generateQuery<DummyTableDefinition>({
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

    const generatedQuery = formatQuery({ query })

    const expectedQuery = formatQuery({
      query: {
        parameters: ["fieldValue"],
        query: { kind: "RawNode", parameters: [], sqlFragments: [] },
        queryId: { queryId: "query" },
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
              "stringField"
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
        FULL JOIN "records" ON TRUE
        `,
      },
    })

    expect(generatedQuery).toStrictEqual(expectedQuery)
  })

  test("select one field with custom paging ( limit & offset )", () => {
    const query = generateQuery<DummyTableDefinition>({
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

    const generatedQuery = formatQuery({ query })

    const expectedQuery = formatQuery({
      query: {
        parameters: ["fieldValue"],
        query: { kind: "RawNode", parameters: [], sqlFragments: [] },
        queryId: { queryId: "query" },
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
              "stringField"
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
        FULL JOIN "records" ON TRUE
        `,
      },
    })

    expect(generatedQuery).toStrictEqual(expectedQuery)
  })

  test("select one field with custom paging ( offset )", () => {
    const query = generateQuery<DummyTableDefinition>({
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

    const generatedQuery = formatQuery({ query })

    const expectedQuery = formatQuery({
      query: {
        parameters: ["fieldValue"],
        query: { kind: "RawNode", parameters: [], sqlFragments: [] },
        queryId: { queryId: "query" },
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
              "stringField"
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
        FULL JOIN "records" ON TRUE
        `,
      },
    })

    expect(generatedQuery).toStrictEqual(expectedQuery)
  })

  test("select with transformFields without filter", () => {
    const query = generateQuery<DummyTableDefinition>({
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

    const generatedQuery = formatQuery({ query })

    const expectedQuery = formatQuery({
      query: {
        parameters: ["fieldValue"],
        query: { kind: "RawNode", parameters: [], sqlFragments: [] },
        queryId: { queryId: "query" },
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
              "nümber-field" as "nümber-field"
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
        FULL JOIN "records" ON TRUE
        `,
      },
    })

    expect(generatedQuery).toStrictEqual(expectedQuery)
  })

  test("select with transformFields with filter", () => {
    const query = generateQuery<DummyTableDefinition>({
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

    const generatedQuery = formatQuery({ query })

    const expectedQuery = formatQuery({
      query: {
        parameters: ["fieldValue"],
        query: { kind: "RawNode", parameters: [], sqlFragments: [] },
        queryId: { queryId: "query" },
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
              "nümber-field" as "nümber-field"
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
        FULL JOIN "records" ON TRUE
        `,
      },
    })

    expect(generatedQuery).toStrictEqual(expectedQuery)
  })
})
