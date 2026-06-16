/** @type {import('@lakeql/cli').BulkPullConfig} */
export default [
  {
    schema: "schema1",
    tables: ["table1", "table2", "table3"],
    views: ["view1"],
  },
  {
    schema: "schema2",
    catalog: "other_catalog", // optional: overrides --catalog and ENV
    tables: ["table4", "table5"],
    views: [],
  },
]
