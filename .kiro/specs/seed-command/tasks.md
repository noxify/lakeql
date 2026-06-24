# Local Seed Command — Tasks

## Task 1: Config-System

- [ ] `tooling/test-data/src/seed/config.ts` — `SeedDefinition` Type + `defineSeeds()` Hilfsfunktion
- [ ] `tooling/test-data/seed.config.ts` — Initiale Config mit 2 Definitions (products + orders), importiert Template-Datasets

## Task 2: Template-Datasets

- [ ] `tooling/test-data/src/datasets/simple.ts` — `simpleColumns` + `simpleGenerate(amount, targetDir)` exportieren (adaptiert aus bestehender Logik in index.ts)
- [ ] `tooling/test-data/src/datasets/complex.ts` — `complexColumns` + `complexGenerate(amount, targetDir)` exportieren

## Task 3: Connector-Interface + Implementierungen

- [ ] `tooling/test-data/src/seed/defaults.ts` — MINITRINO Konstante (Trino + MinIO)
- [ ] `tooling/test-data/src/seed/connectors.ts`:
  - `SeedConnector` Interface (ensureSchema, seed)
  - `createHiveSeedConnector(trinoClient, minioConfig)` — vollständige Impl
  - `createClickHouseSeedConnector()` — Stub mit Error
  - `createSeedConnector(type, trinoClient, minioConfig)` — Factory

## Task 4: Seed-Orchestrierung

- [ ] `tooling/test-data/src/seed/index.ts`:
  - `seedDefinition(definition, connector, amount)` — einzelne Definition
  - `seedAll(definitions, connectorOverride, amount)` — alle (best-effort)
  - Tmpdir-Management (erstellen, cleanup)
  - Fehlerbehandlung + Summary
- [ ] `@lakeql/trino-client` als devDependency in `tooling/test-data/package.json`

## Task 5: CLI-Entrypoint

- [ ] `tooling/test-data/src/seed.ts` — CLI mit cleye:
  - `--all` Flag
  - `--definition` / `-d` (wiederholbar)
  - `--amount` / `-a` (default: 1000)
  - `--connector` / `-c` (optional override)
  - Validierung (mindestens --all oder --definition)
  - Spinner/Status via ora
- [ ] `"seed": "tsx ./src/seed.ts"` in `tooling/test-data/package.json` scripts

## Task 6: Root-Level Integration + Doku

- [ ] Root `package.json`: `"seed": "pnpm -F test-data seed"` Script
- [ ] `INFRASTRUCTURE.md` aktualisieren:
  - Abschnitt "Seeding test data"
  - Erklärung seed.config.ts + Template-Datasets
  - Beispiele: `pnpm seed --all`, `pnpm seed -d products`, `pnpm seed --all --amount 500`
  - Hinweis: eigene Datasets als Custom-Definitions

## Task 7: Manueller Test

- [ ] Mit laufendem minitrino:
  - `pnpm seed --all` — seeded alle Definitions
  - `pnpm seed -d products` — nur products
  - `pnpm seed -d products --amount 100` — weniger Records
  - Wiederholtes Ausführen = Reset (frische Daten)
  - Trino-Verify: `SELECT count(*) FROM hive.test.products`
