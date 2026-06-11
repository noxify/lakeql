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
