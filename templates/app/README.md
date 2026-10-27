# LakeQL App

A GraphQL API over your data sources with auto-generated schemas and type-safe query building.

This starter ships empty and runnable: it boots a GraphQL server with an empty schema until you configure a data source.

## Getting Started

1. **Configure environment**

   ```bash
   cp .env.example .env
   ```

2. **Register an adapter and a data source**

   Install an adapter and wire it in `lakeql.config.ts`:

   ```bash
   pnpm add @lakeql/adapter-trino
   ```

   ```ts
   import { trinoAdapterDefinition } from "@lakeql/adapter-trino"
   import { defineConfig } from "@lakeql/config"

   export default defineConfig({
     sourcePath: "src",
     adapters: [trinoAdapterDefinition],
     dataSources: {
       warehouse: {
         adapter: "trino",
         connection: {
           host: process.env.TRINO_HOST!,
           port: Number(process.env.TRINO_PORT),
           catalog: process.env.TRINO_CATALOG!,
           auth: {
             type: "basic",
             username: process.env.TRINO_USERNAME!,
             password: process.env.TRINO_PASSWORD!,
           },
         },
       },
     },
   })
   ```

3. **Pull schemas from the data source**

   ```bash
   pnpm cli pull
   ```

   This introspects the source and generates endpoint files under `src`.

4. **Start the development server**

   ```bash
   pnpm dev
   ```

   The GraphQL API starts at `http://localhost:4000` with GraphiQL at `/graphql` and a health check at `/live`.

## Commands

| Command          | Description                                      |
| ---------------- | ------------------------------------------------ |
| `pnpm dev`       | Start development server with hot reload         |
| `pnpm build`     | Build for production                             |
| `pnpm start`     | Run production build                             |
| `pnpm cli`       | Run the LakeQL CLI (pull, create-endpoint, etc.) |
| `pnpm typecheck` | Type-check the project                           |
| `pnpm clean`     | Remove build artifacts and node_modules          |

## Documentation

See the [LakeQL Documentation](https://lakeql.dev/docs) for guides on data sources, permissions, mutations, and more.
