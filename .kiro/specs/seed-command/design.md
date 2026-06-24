# Local Seed Command — Design

## Architektur

```
tooling/test-data/
├── seed.config.ts                # Seed-Konfigurationsdatei (importiert Datasets)
├── src/
│   ├── datasets/
│   │   ├── simple.ts            # Template: simpleColumns + simpleGenerate
│   │   └── complex.ts           # Template: complexColumns + complexGenerate
│   ├── seed/
│   │   ├── index.ts             # Seed-Orchestrierung
│   │   ├── config.ts            # defineSeeds() + SeedDefinition Type
│   │   ├── connectors.ts        # Connector-Interface + Hive + ClickHouse-Stub
│   │   └── defaults.ts          # Statische Minitrino-Defaults
│   ├── seed.ts                  # CLI-Entrypoint
│   ├── index.ts                 # Bestehender Generator (unverändert)
│   └── sync.ts                  # Bestehender Sync (unverändert)
```

## Seed-Config

```ts
// seed.config.ts
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
    schema: "analytics",
    table: "orders",
    connector: "hive",
    columns: complexColumns,
    generate: complexGenerate,
  },
])
```

## Config-Types

```ts
// seed/config.ts
import type { ColumnDefinition } from "@lakeql/trino-client"

type ConnectorType = "hive" | "clickhouse"

/**
 * Eine Seed-Definition. Einheitliche Struktur — kein Discriminator.
 * Template-Datasets und Custom-Definitions sehen identisch aus.
 */
interface SeedDefinition {
  /** Eindeutiger Name (für --definition Flag) */
  name: string
  /** Trino-Schema */
  schema: string
  /** Trino-Tabelle */
  table: string
  /** Connector-Typ */
  connector: ConnectorType
  /** Spalten-Definitionen (Trino-Typen) */
  columns: ColumnDefinition[]
  /** Generator: schreibt Parquet auf Disk, gibt Dateipfad zurück */
  generate: (amount: number, targetDir: string) => Promise<string>
}

/** Typsichere Hilfsfunktion für die Config */
function defineSeeds(definitions: SeedDefinition[]): SeedDefinition[] {
  return definitions
}
```

## Template-Datasets

Jedes Template exportiert zwei Dinge: `columns` und `generate`.

```ts
// datasets/simple.ts
import type { ColumnDefinition } from "@lakeql/trino-client"

export const simpleColumns: ColumnDefinition[] = [
  { name: "name", type: "VARCHAR" },
  { name: "quantity", type: "BIGINT" },
  { name: "price", type: "DOUBLE" },
  { name: "date", type: "TIMESTAMP(3)" },
  { name: "in_stock", type: "BOOLEAN" },
]

/**
 * Generiert das Simple-Dataset als Parquet auf Disk.
 * @returns Pfad zur generierten Datei
 */
export async function simpleGenerate(
  amount: number,
  targetDir: string
): Promise<string> {
  // Nutzt hyparquet-writer, bestehende Logik adaptiert
  const filePath = path.join(targetDir, "data.parquet")
  // ... generate + write ...
  return filePath
}
```

### Neues Template hinzufügen

1. Neue Datei `src/datasets/my-template.ts`
2. Export `myTemplateColumns` + `myTemplateGenerate`
3. In `seed.config.ts` importieren und verwenden

Keine Registry, kein Framework — nur Imports.

## Connector-Interface

```ts
interface SeedConnector {
  type: ConnectorType

  /** CREATE SCHEMA IF NOT EXISTS (connector-spezifisch) */
  ensureSchema(catalog: string, schema: string): Promise<void>

  /**
   * Vollständiger Seed:
   * Drop Table → Delete Storage → Upload → Create Table
   */
  seed(props: {
    catalog: string
    schema: string
    table: string
    columns: ColumnDefinition[]
    parquetFilePath: string
  }): Promise<void>
}
```

### Hive-Connector

```
ensureSchema("hive", "test"):
  → CREATE SCHEMA IF NOT EXISTS hive.test
    WITH (location = 's3a://minitrino/test')

seed({ schema: "test", table: "products", parquetFilePath: "/tmp/..." }):
  → DROP TABLE IF EXISTS hive.test.products
  → Delete prefix "test/products/" in MinIO bucket "minitrino"
  → Read file from parquetFilePath
  → Upload to MinIO: "test/products/data.parquet"
  → CREATE TABLE hive.test.products (...)
    WITH (external_location = 's3a://minitrino/test/products/', format = 'PARQUET')
```

### ClickHouse-Connector (Stub)

```ts
export function createClickHouseSeedConnector(): SeedConnector {
  return {
    type: "clickhouse",
    ensureSchema() {
      throw new Error("ClickHouse connector is not yet implemented.")
    },
    seed() {
      throw new Error("ClickHouse connector is not yet implemented.")
    },
  }
}
```

## Statische Defaults

```ts
// seed/defaults.ts
export const MINITRINO = {
  trino: {
    host: "http://localhost",
    port: 8080,
    catalog: "hive",
    auth: { type: "basic" as const, username: "admin", password: "secret123" },
  },
  minio: {
    endpoint: "http://localhost:9000",
    bucket: "minitrino",
    region: "us-east-1",
    credentials: {
      accessKeyId: "access-key",
      secretAccessKey: "secret-key",
    },
  },
} as const
```

## CLI Interface

```
pnpm -F test-data seed [options]

Flags:
  --all              Seed alle Definitions aus der Config
  --definition, -d   Seed spezifische Definition(s) (wiederholbar)
  --amount, -a       Anzahl Records (default: 1000)
  --connector, -c    Connector override (default: aus Definition)

Beispiele:
  pnpm seed --all
  pnpm seed --all --amount 500
  pnpm seed -d products
  pnpm seed -d products -d orders
  pnpm seed -d products --connector clickhouse
```

## Orchestrierung

```
1. Parse CLI args (cleye)
2. Import seed.config.ts
3. Resolve Definitions:
   - --all → alle
   - --definition → Lookup by name, Fehler wenn nicht gefunden
   - keines → Fehler mit Hinweis
4. Create TrinoClient (MINITRINO.trino)
5. Für jede Definition:
   a. Determine connector (CLI override oder Definition.connector)
   b. Create SeedConnector
   c. Log: "⏳ Seeding <name>..."
   d. Prepare tmpdir: os.tmpdir()/lakeql-seed/
   e. Call definition.generate(amount, tmpdir) → parquetFilePath
   f. connector.ensureSchema(catalog, definition.schema)
   g. connector.seed({ catalog, schema, table, columns, parquetFilePath })
   h. Delete tmp file
   i. Log: "✓ <name> → hive.<schema>.<table> (<amount> records)"
6. Bei Fehler:
   - Log: "✗ <name> failed: <message>"
   - Weiter zum nächsten (best-effort)
7. Summary: "Seeded X/Y definitions successfully"
```

## Abhängigkeiten

Neue devDependencies in `tooling/test-data/package.json`:

- `@lakeql/trino-client: "workspace:*"`

Bereits vorhanden:

- `files-sdk` — MinIO Upload
- `hyparquet-writer` — Parquet-Generierung
- `cleye` — CLI-Parsing
- `ora` — Spinner
- `@faker-js/faker` — Testdaten

## Entscheidungen

| Entscheidung                                 | Begründung                                                                       |
| -------------------------------------------- | -------------------------------------------------------------------------------- |
| Einheitliche Definition (kein Discriminator) | Einfacher, konsistent. Template = import, Custom = inline. Kein Sonderverhalten. |
| Templates als exportierte columns + generate | Composable. Gleiche Schnittstelle überall. Neues Template = neue Datei + Export. |
| Config als .ts Datei                         | Typsicherheit, IDE-Autocomplete, Functions als Werte möglich.                    |
| Amount nur via CLI                           | Einfach. Ein Knopf für "wieviel". Variierbar pro Lauf.                           |
| --all / --definition                         | Explizit. Kein versehentliches Seeden von allem.                                 |
| Best-effort bei --all                        | Ein Fehler blockt nicht den Rest. Summary am Ende zeigt Ergebnis.                |
| Tmpdir für generierte Files                  | Kein Workspace-Müll. Cleanup nach Upload.                                        |
| `s3a://` in Trino DDL                        | Trino Hive-Connector erwartet das für S3-kompatible Endpoints.                   |
