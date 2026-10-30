---
name: trino-mutation-e2e
description: Manually run and verify LakeQL GraphQL write mutations (append, full_load, full_load_append) end-to-end against the local minitrino Trino cluster. Scaffolds a throwaway app with create-app so it needs no pre-existing example. Use when you want to exercise or debug the Trino adapter's write path through a real GraphQL API and a real Trino/Hive/MinIO stack, not mocks. Manual runbook only — nothing here runs in CI.
---

# Trino write mutations — end-to-end manual runbook

A step-by-step runbook to stand up a working LakeQL app against the local minitrino Trino cluster and exercise GraphQL **write mutations** for all three load strategies, verifying that rows actually land in Trino.

This is a **manual integration check**, not an automated test. It lives under `.kiro/skills/` as prose + commands and has zero CI footprint (Vitest only runs `packages/*` and `tooling/type-tests`). Do not convert it into a `*.test.ts` under `packages/`.

The runbook scaffolds its own throwaway app with `create-app`, so it does not depend on any pre-existing example and never touches committed files. The app is created under `examples/` (git-ignored except `trino-only`) and deleted in cleanup.

All values and commands below were verified live against the running cluster. Commands run from the repo root unless a different directory is shown. Use `REPO=/absolute/path/to/lakeql` and `APP="$REPO/examples/trino-mutation-smoke"` mentally when following along.

## When to use this

- Exercising or debugging the Trino adapter INSERT write strategy through the real GraphQL API.
- Confirming a change to the mutation generator, write strategy, or config runtime still writes real rows.
- Reproducing write behavior that unit tests (which use fakes) cannot catch.

## Prerequisites

- Docker running, plus `uv` and `pnpm` (see the Local Development docs).
- Dependencies installed: `pnpm install`.
- Free TCP port `4000` (the API server) and the minitrino ports.

## 1. Start the cluster and seed base data

```bash
pnpm mt:start      # provisions Trino + Hive + MinIO + LDAP + OAuth2 (+ MinIO S3 proxy)
```

`pnpm mt:start` builds the Trino image on first run (several minutes). Wait until Trino actually answers before seeding — the provisioner can report "complete" a moment before the coordinator accepts queries:

```bash
# poll until HTTP 200
until [ "$(curl -s -o /dev/null -w '%{http_code}' -u 'admin:' http://localhost:8080/v1/info)" = "200" ]; do sleep 3; done
pnpm seed --all    # seeds hive.test.products and hive.test.orders (1000 rows each)
docker ps --format "{{.Names}}\t{{.Status}}" | grep -E "minitrino|hive|minio"
```

## 2. Scaffold a throwaway app

The app always uses the fixed name `trino-mutation-smoke`. Because an interrupted earlier run can leave the app directory, the scratch Trino tables, and their MinIO objects behind — and the table name (not the app name) drives the MinIO path, so a unique app name would not avoid those collisions — start with an **idempotent pre-flight reset** that clears any remnants. This is safe to run even on a clean machine (every command is a no-op when nothing exists):

```bash
# drop leftover scratch tables (no-op if absent)
for t in mutation_smoke_append mutation_smoke_full mutation_smoke_fla_latest mutation_smoke_fla_all; do
  pnpm query "DROP TABLE IF EXISTS hive.test.$t" >/dev/null 2>&1 || true
done
# clear leftover MinIO objects (external-table data survives DROP TABLE and mt:clean;
# stale objects make autoCreateTable fail with HIVE_PATH_ALREADY_EXISTS)
for p in mutation_smoke_append mutation_smoke_full mutation_smoke_fla_latest mutation_smoke_fla_all; do
  docker exec minio-client-default mc rm --recursive --force "minio/minitrino/test/$p/" >/dev/null 2>&1 || true
done
# remove a leftover app directory
rm -rf examples/trino-mutation-smoke
```

Then create a fresh app non-interactively with `create-app` into `examples/` (git-ignored). `--local` keeps `workspace:*` dependency versions; `--no-install` skips the per-app install (a workspace `pnpm install` links everything):

```bash
node packages/create-app/dist/index.mjs trino-mutation-smoke \
  --adapters trino --ds-names trino --auth mock \
  --target-dir examples --local --no-install --quiet

pnpm install   # link the new workspace app's deps (examples/* is in the workspace)
```

> If `packages/create-app/dist/index.mjs` is missing, build it first: `pnpm --filter @lakeql/create-app build`. Likewise build the CLI once: `pnpm --filter @lakeql/cli build` (the app runs the built `lakeql-cli`).

The generated `examples/trino-mutation-smoke/lakeql.config.ts` wires the Trino adapter but has **no** `writeConfig`. A write strategy is only created when the data source has one; without it every mutation throws `WriteStrategyNotConfiguredError`. Add an **INSERT** write strategy (pure SQL, no object storage) to the `trino` data source:

```ts
trino: {
  adapter: "trino",
  connection: {
    /* ...unchanged... */
  },
  writeConfig: {
    autoCreateTable: true,
    strategy: "insert",
  },
},
```

> Why INSERT and not the default storage strategy: the storage strategy needs a files-sdk/S3 instance that the adapter factory does not inject from config alone. The INSERT strategy is pure SQL (`INSERT INTO`, `CREATE TABLE`, `ALTER TABLE RENAME`) and implements all three load strategies.

## 3. Create the app's `.env` pointing at the cluster

Write `examples/trino-mutation-smoke/.env`:

```bash
AUTH_MOCK=true
AUTH_MOCK_TOKEN="dev-token-1234"

TRINO_CATALOG=hive
TRINO_HOST="https://localhost"
TRINO_PASSWORD="trinoRocks15"
TRINO_PORT=8443
TRINO_SOURCE="lakeql"
TRINO_USERNAME=admin

# minitrino's TLS port uses a self-signed cert; accept it for local dev only.
NODE_TLS_REJECT_UNAUTHORIZED=0

API_PORT=4000
API_LOGGER="warn"
```

> **Auth gotcha (important).** The Trino adapter rejects an empty password, and the plaintext port `8080` rejects every non-empty password. So the API must talk to the **TLS port `8443`** with the minitrino LDAP password `trinoRocks15` (users `admin`, `alice`, `bob` all work). The self-signed cert requires `NODE_TLS_REJECT_UNAUTHORIZED=0`.
>
> The `pnpm query` tool is different: it connects over `8080` with an empty password (hardcoded minitrino defaults) and is used only for verification queries — independent of the API's auth.

## 4. Define and generate the mutation endpoints

Each generated endpoint bakes its load strategy into `config.ts` at generation time (it is **not** a GraphQL argument), so test all three strategies by generating three endpoints. Put the definition JSONs under `examples/trino-mutation-smoke/.smoke-endpoints/`. Each uses a small, explicit field set and sets `dataSource: "trino"` so the generated config targets the right data source (without it the generator defaults to `"default"` and the runtime cannot resolve the write strategy).

`.smoke-endpoints/append.json`:

```json
{
  "version": "1.0",
  "dataSource": "trino",
  "catalog": "hive",
  "schema": "test",
  "tableName": "mutation_smoke_append",
  "fields": [
    { "name": "id", "type": "Integer", "options": { "required": true } },
    { "name": "name", "type": "String", "options": { "required": true } },
    { "name": "amount", "type": "Float" }
  ],
  "mutation": { "loadStrategy": "append", "basePath": "unused" }
}
```

`full.json` and `fla.json` are identical except for `tableName` (`mutation_smoke_full` / `mutation_smoke_fla`) and `mutation.loadStrategy` (`full_load` / `full_load_append`).

> `mutation.basePath` is required by the schema (min length 1) even though the INSERT strategy ignores it — pass a dummy like `"unused"`.

Generate the endpoints **from inside the app directory** (critical — see the gotcha below), after building the CLI:

```bash
pnpm --filter @lakeql/cli build

cd examples/trino-mutation-smoke
for f in append full fla; do
  pnpm exec lakeql-cli --env=.env create-endpoint --from-file ./.smoke-endpoints/$f.json --force
done
cd - >/dev/null
```

> **CWD gotcha (important).** Run the CLI with the app as the actual working directory (`cd` into it), NOT via `pnpm -C <app> exec`. The CLI resolves the output `sourcePath` against the real process CWD; with `pnpm -C` it writes the generated endpoints to the repo root (`<repo>/schemas/custom/...`) instead of the app. `--env=.env` is likewise resolved against the CWD, so running from inside the app makes both correct.

Confirm the generated config points at `trino`:

```bash
grep dataSource examples/trino-mutation-smoke/src/schemas/custom/hive/test/mutation_smoke_append/config.ts
# -> dataSource: "trino",
```

## 5. Start the API server

```bash
cd examples/trino-mutation-smoke
node --env-file=.env --import tsx ./src/index.ts   # long-running; run in a separate terminal
```

Wait until it prints `GraphQL Endpoint: http://localhost:4000/graphql`. If port 4000 is busy: `lsof -ti tcp:4000 | xargs kill`.

GraphiQL is served at `http://localhost:4000/graphql`. Send mutations with the header `Authorization: Bearer dev-token-1234` (mock auth).

## 6. Run each mutation

The generated mutation field is `createtest<Table>` (note the lowercase `test`), the input is an **array** (`[<Model>Input!]!`), and each resolver writes through the adapter's write strategy. Field/type names come from the schema + table name; confirm them in the generated `mutation-schema.ts` if you change the field set.

### append — adds rows

```bash
curl -s -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-token-1234" \
  -d '{"query":"mutation($in:[Test_MutationSmokeAppendInput!]!){ createtestMutationSmokeAppend(input:$in) }","variables":{"in":[{"id":1,"name":"alpha","amount":10.5},{"id":2,"name":"beta","amount":20.0}]}}'
```

### full_load — replaces the whole table

```bash
curl -s -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-token-1234" \
  -d '{"query":"mutation($in:[Test_MutationSmokeFullInput!]!){ createtestMutationSmokeFull(input:$in) }","variables":{"in":[{"id":100,"name":"only-this-row","amount":1.0}]}}'
```

### full_load_append — replaces `_latest`, grows `_all`

```bash
curl -s -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-token-1234" \
  -d '{"query":"mutation($in:[Test_MutationSmokeFlaInput!]!){ createtestMutationSmokeFla(input:$in) }","variables":{"in":[{"id":7,"name":"batch-A","amount":3.3}]}}'
```

This strategy writes to `mutation_smoke_fla_latest` (replaced each call) and `mutation_smoke_fla_all` (extended each call); it does **not** write the base `mutation_smoke_fla` table.

## 7. Verify rows landed

Use `pnpm query` (connects over 8080, empty password — fine for reads):

```bash
# append grows across calls
pnpm query "SELECT * FROM hive.test.mutation_smoke_append ORDER BY id"

# full_load holds only the last batch
pnpm query "SELECT * FROM hive.test.mutation_smoke_full ORDER BY id"

# full_load_append: _latest replaced, _all grows
pnpm query "SELECT count(*) AS n FROM hive.test.mutation_smoke_fla_latest"
pnpm query "SELECT count(*) AS n FROM hive.test.mutation_smoke_fla_all"
```

Confirm a real `INSERT` actually executed (a passing mutation that writes nothing is the exact bug this flow exists to catch):

```bash
pnpm query "SELECT state, substr(query,1,45) AS q FROM system.runtime.queries WHERE query LIKE 'INSERT%' ORDER BY created DESC LIMIT 3" -f json
```

## 8. Cleanup

Drop the scratch tables AND clear their MinIO objects — a plain `DROP TABLE` leaves the S3 data behind, and leftover objects make a later `autoCreateTable` run fail with `HIVE_PATH_ALREADY_EXISTS` (see the gotcha below):

```bash
for t in mutation_smoke_append mutation_smoke_full mutation_smoke_fla_latest mutation_smoke_fla_all; do
  pnpm query "DROP TABLE IF EXISTS hive.test.$t"
done

# clear the orphaned MinIO paths via the minio-client container (alias `minio`)
MC=minio-client-default
for p in mutation_smoke_append mutation_smoke_full mutation_smoke_fla_latest mutation_smoke_fla_all; do
  docker exec "$MC" mc rm --recursive --force "minio/minitrino/test/$p/"
done

# stop the API server (Ctrl-C or kill the port), remove the throwaway app
lsof -ti tcp:4000 | xargs kill 2>/dev/null
rm -rf examples/trino-mutation-smoke
```

Stop the cluster when done: `pnpm mt:stop` (keep volumes) or `pnpm mt:clean` (remove containers).

## Notes and gotchas (all verified)

- **The INSERT strategy needs no MinIO S3 proxy** — it writes via SQL only. `pnpm mt:proxy` / the `:9000` proxy is only needed for the storage (Parquet) write strategy.
- **Orphaned MinIO data survives `mt:clean` and `DROP TABLE`.** The tables are external, so their `s3a://minitrino/test/<table>/` objects persist. If a prior run left objects there, `autoCreateTable`'s `CREATE TABLE` fails with `HIVE_PATH_ALREADY_EXISTS`. The step 2 pre-flight reset clears them up front; to clear one by hand use `docker exec minio-client-default mc rm --recursive --force minio/minitrino/test/<table>/` (the in-container mc alias is `minio`, not `local`). The scratch table/path names are fixed (they derive from `schema`/`tableName`, not the app name), which is why the fixed-name app plus pre-flight reset is the reliable reset — a per-run unique app name would not.
- **Run the CLI from inside the app directory**, not via `pnpm -C` — otherwise generated endpoints land at the repo root.
- **Mutation input is an array** (`[<Model>Input!]!`). Passing a single object used to silently write zero rows while returning `true`; that generator bug is fixed, but always send an array (a single row is a one-element array).
- **Load strategy is baked at generation time**, not a GraphQL argument. To change it, edit the endpoint JSON's `mutation.loadStrategy` and regenerate.
- **Field/type names** follow `create<Schema><Table>` (schema lowercased in the field name as emitted) and `<Schema>_<Table>Input`. When in doubt, read the generated `mutation-schema.ts` or introspect the live schema.
- **Wait for Trino readiness** (`/v1/info` → 200) after `mt:start` before seeding or querying; "provisioning complete" can precede query readiness.
- The scaffolded app under `examples/trino-mutation-smoke` is git-ignored (`examples/*`), so nothing here is committed; recreate it from this runbook.
