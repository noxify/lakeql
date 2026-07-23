# Local Development

## Requirements

- [uv](https://docs.astral.sh/uv/) (Python package manager)
- [Docker](https://www.docker.com/)
- [pnpm](https://pnpm.io/) (Node.js package manager)

## Setup

### 1. Install dependencies

```bash
# Python (minitrino)
uv sync

# Node.js
pnpm install
```

### 2. Start minitrino

```bash
pnpm mt:start
```

This provisions a local Trino cluster with Hive, MinIO, LDAP, and OAuth2 modules, and starts the MinIO S3 API proxy (port 9000). The minitrino library is loaded from `.minitrino/lib/` in the project root — all module configuration is version-controlled.

### 3. Seed test data

```bash
pnpm seed --all
```

This generates Parquet files, uploads them to MinIO, creates Trino schemas and tables — all in one step.

## Available commands

### Minitrino

| Command              | Description                                         |
| -------------------- | --------------------------------------------------- |
| `pnpm mt:start`      | Provision and start the cluster (inkl. MinIO proxy) |
| `pnpm mt:restart`    | Restart the cluster (inkl. MinIO proxy)             |
| `pnpm mt:stop`       | Stop the cluster (keep volumes)                     |
| `pnpm mt:clean`      | Stop and remove everything                          |
| `pnpm mt:proxy`      | Start the MinIO S3 API proxy manually               |
| `pnpm mt:proxy:stop` | Stop the proxy manually                             |

### Seeding

| Command                         | Description                                |
| ------------------------------- | ------------------------------------------ |
| `pnpm seed --all`               | Seed all definitions from `seed.config.ts` |
| `pnpm seed -d <name>`           | Seed a specific definition                 |
| `pnpm seed -d <name> -d <name>` | Seed multiple definitions                  |
| `pnpm seed --all --amount 500`  | Custom record count (default: 1000)        |

Each seed run is a full reset: existing table and data are dropped and recreated with freshly generated records.

### Querying

| Command | Description |
| --- | --- |
| `pnpm query "SELECT ..."` | Execute SQL against local Trino (table output) |
| `pnpm query "SELECT ..." -f json` | JSON output |
| `pnpm query "SELECT ..." -f csv` | CSV output |
| `pnpm query "SELECT ..." -s test` | Use a default schema |

### Generating test data (standalone)

If you only want to generate Parquet files without seeding to MinIO/Trino:

```bash
pnpm -F test-data generate --dataset simple --path ./test-data/simple-dataset
pnpm -F test-data generate --dataset complex --path ./test-data/complex-dataset
```

## Seed configuration

Seed definitions live in `tooling/test-data/seed.config.ts`. Each definition describes a target (schema + table + connector) and provides columns + a generator function.

Built-in templates (`simple`, `complex`) can be imported as reusable building blocks:

```ts
import { defineSeeds } from "./src/seed/config"
import { simpleColumns, simpleGenerate } from "./src/datasets/simple"
import { complexColumns, complexGenerate } from "./src/datasets/complex"

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
```

To add a custom dataset, define `columns` and `generate` inline or in a new file under `tooling/test-data/src/datasets/`.

## Connection details

| Service | URL | Credentials |
| --- | --- | --- |
| Trino | `http://localhost:8080` | user: `admin`, no password |
| Trino UI | `https://localhost:8443/ui` | `admin@minitrino.com` |
| MinIO Console | `http://localhost:9001` | `access-key` / `secret-key` |
| MinIO S3 API | `http://localhost:9000` (via proxy) | `access-key` / `secret-key` |

> **Note**: The Trino UI requires `https://`, since we use oauth in our setup. Make sure you're using a browser which allows you to by-pass the `net::ERR_CERT_AUTHORITY_INVALID` error

> **TIP**: To run queries locally, use `pnpm query "SELECT ..."`.

## Default Users

We're using the provided users from minitrino for LDAP and OAuth.

- LDAP: https://minitrino.readthedocs.io/en/latest/modules/security/ldap.html#default-usernames-and-passwords
- OAuth: https://minitrino.readthedocs.io/en/latest/modules/security/oauth2.html#default-oauth2-principals

## Troubleshooting

**Seed fails with "S3 error" or "bucket does not exist"**

- Ensure the MinIO proxy is running: `pnpm mt:proxy`
- Check that the `minitrino` bucket exists in the MinIO Console (`http://localhost:9001`)

**Seed fails with "401 Unauthorized"**

- Trino auth is user-only (no password). This should work out of the box with minitrino defaults.

**Query fails with connection error**

- Make sure minitrino is running: `pnpm mt:start`
