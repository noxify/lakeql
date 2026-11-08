import { buildListViewsCommandStructure } from "../metadata/list-views-metadata"
import { listObjectsCommand } from "./list-objects"

export default function listViewsCommand() {
  return listObjectsCommand({
    structure: buildListViewsCommandStructure(),
    label: "View",
    columnKey: "v",
    errorVerb: "list views",
    fetch: (dataSource, catalog, schema) => dataSource.views(catalog, schema),
  })
}
