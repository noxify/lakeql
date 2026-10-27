import { buildListTablesCommandStructure } from "../metadata/list-tables-metadata"
import { listObjectsCommand } from "./list-objects"

export default function listTablesCommand() {
  return listObjectsCommand({
    structure: buildListTablesCommandStructure(),
    label: "Table",
    columnKey: "t",
    errorVerb: "list tables",
    fetch: (dataSource, catalog, schema) => dataSource.tables(catalog, schema),
  })
}
