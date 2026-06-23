import { simpleColumns, simpleGenerate } from "./src/datasets/simple"
import { complexColumns, complexGenerate } from "./src/datasets/complex"
import { defineSeeds } from "./src/seed/config"

export default defineSeeds([
  {
    name: "products",
    schema: "test",
    table: "products",
    connector: "hive",
    columns: simpleColumns,
    generate: simpleGenerate,
  },
  {
    name: "orders",
    schema: "test",
    table: "orders",
    connector: "hive",
    columns: complexColumns,
    generate: complexGenerate,
  },
])
