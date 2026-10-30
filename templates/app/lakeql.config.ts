import { defineConfig } from "@lakeql/config"

/**
 * LakeQL project configuration.
 *
 * This starter ships empty and runnable. To connect a data source:
 *
 * 1. Install an adapter, e.g. `@lakeql/adapter-trino`.
 * 2. Register it in `adapters` and add an entry to `dataSources`:
 *
 *    import { trinoAdapterDefinition } from "@lakeql/adapter-trino"
 *
 *    export default defineConfig({
 *      sourcePath: "src",
 *      adapters: [trinoAdapterDefinition],
 *      dataSources: {
 *        warehouse: {
 *          adapter: "trino",
 *          connection: {
 *            host: env.TRINO_HOST,
 *            port: env.TRINO_PORT,
 *            catalog: env.TRINO_CATALOG,
 *            auth: { type: "basic", username: env.TRINO_USERNAME, password: env.TRINO_PASSWORD },
 *          },
 *        },
 *      },
 *    })
 *
 * 3. Run `pnpm cli pull` to introspect the source and generate endpoints.
 */
export default defineConfig({
  sourcePath: "src",
  adapters: [],
  dataSources: {},
})
