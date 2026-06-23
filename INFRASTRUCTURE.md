> This document is currently work in progress
> it includes currently only the steps to init the local trino/hive/minio environment + test data generation

## Requirements

- uv
- docker
- pnpm ( optional for this setup, but recommended )

## Setup minitrino with uv

```bash
# create venv & install deps
uv sync

# start/init minitrino
# alias for `uv run minitrino -v provision -m hive -m clickhouse -m minio -m ldap -m oauth2`
pnpm mt:start
```

## Generating test data

### Simple dataset

```bash
pnpm -F test-data generate --dataset simple --path ./test-data/simple-dataset
```

### Complex dataset

```bash
pnpm -F test-data generate --dataset complex --path ./test-data/complex-dataset
```

## Seeding test data

The seed command handles the full local setup in one step: generating test data, uploading to MinIO, creating the Trino schema, and creating the table.

### Prerequisites

- minitrino running (`pnpm mt:start`)

### Configuration

Seed definitions are configured in `tooling/test-data/seed.config.ts`. Each definition specifies a target schema/table, connector, columns, and a generator function. Built-in templates (`simple`, `complex`) can be imported as building blocks.

```ts
// seed.config.ts
import { defineSeeds } from "./src/seed/config"
import { simpleColumns, simpleGenerate } from "./src/datasets/simple"

export default defineSeeds([
  {
    name: "products",
    schema: "test",
    table: "products",
    connector: "hive",
    columns: simpleColumns,
    generate: simpleGenerate,
  },
])
```

### Usage

```bash
# Seed all definitions
pnpm seed --all

# Seed a specific definition
pnpm seed -d products

# Seed multiple definitions
pnpm seed -d products -d orders

# Custom record count
pnpm seed --all --amount 500
```

Each seed run is a full reset: existing table and data are dropped and recreated with freshly generated records.
