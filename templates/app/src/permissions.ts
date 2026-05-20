import { createPermission as createPermissionFromApi } from "@lakeql/api/helpers"

import { allConfigs } from "./config-registry"

// oxlint-disable-next-line no-unused-vars
const createPermission = createPermissionFromApi(allConfigs)

export const permissions = [
  // {
  //   name: "testuser",
  //   useSystemUser: false,
  //   permissions: {
  //     Query: [createPermission("hive", "schema_name", ["table_name"])],
  //     Mutation: [],
  //   },
  // },
]
