# LakeQL App

A GraphQL API backed by Trino/Hive with auto-generated schemas and type-safe query building.

## Getting Started

1. **Configure environment**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and fill in your Trino connection details.

2. **Pull schemas from Trino**

   ```bash
   pnpm cli pull --target ./src
   ```

   This introspects your Trino catalog and generates endpoint files.

3. **Start development server**

   ```bash
   pnpm dev
   ```

   The GraphQL API starts at `http://localhost:4000` with GraphiQL at `/graphql`.

## Commands

| Command          | Description                                      |
| ---------------- | ------------------------------------------------ |
| `pnpm dev`       | Start development server with hot reload         |
| `pnpm build`     | Build for production                             |
| `pnpm start`     | Run production build                             |
| `pnpm cli`       | Run the LakeQL CLI (pull, create-endpoint, etc.) |
| `pnpm typecheck` | Type-check the project                           |
| `pnpm clean`     | Remove build artifacts and node_modules          |

## CLI Usage

```bash
# Pull schemas from Trino
pnpm cli pull --target ./src

# Create a custom endpoint from a definition file
pnpm cli create-endpoint --from-file ./my-endpoint.json
```

## Documentation

See the [LakeQL Documentation](https://lakeql.dev/docs) for guides on permissions, mutations, load strategies, and more.
