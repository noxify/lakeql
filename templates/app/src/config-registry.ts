export const allConfigs = [] as const

export type AvailableCatalogs = (typeof allConfigs)[number]["catalog"]

export type AvailableSchemas = (typeof allConfigs)[number]["schema"]

export type AvailableTables = (typeof allConfigs)[number]["tableName"]

export type TablesForCatalogAndSchema<
  C extends AvailableCatalogs,
  S extends AvailableSchemas,
> = Extract<
  (typeof allConfigs)[number],
  {
    catalog: C
    schema: S
  }
>["tableName"]
