# Local Seed Command — Requirements

## Übersicht

Ein `seed` Command im `tooling/test-data`-Paket, der den kompletten lokalen Entwicklungs-Setup-Flow in einem Schritt ausführt:

1. Bestehende Daten löschen (MinIO-Prefix + Trino-Table)
2. Test-Daten generieren (Parquet auf Disk)
3. In lokales MinIO hochladen (vom FS streamen)
4. Trino Schema anlegen (falls nicht vorhanden)
5. Trino Tabelle anlegen

Die Konfiguration geschieht über eine `seed.config.ts` Datei mit einheitlichen Definitions.

## Anforderungen

### REQ-1: Einzelner Seed-Command

- Als Entwickler möchte ich mit einem einzigen Command (`pnpm seed --all`) meine lokale Umgebung mit Testdaten befüllen können.
- Der Command führt immer einen vollständigen Reset durch: Alte Daten löschen → Neu generieren → Upload → DDL.

### REQ-2: Seed-Config Datei

- Die Seed-Konfiguration liegt in `tooling/test-data/seed.config.ts`.
- Jede Definition hat eine einheitliche Struktur: `name`, `schema`, `table`, `connector`, `columns`, `generate`.
- Nutzt eine `defineSeeds()`-Hilfsfunktion für Typsicherheit.
- Kein Discriminator (`dataset: "simple" | "custom"`) — jede Definition ist gleich aufgebaut.

### REQ-3: Template-Datasets als importierbare Bausteine

- Vorgefertigte Datasets (`simple`, `complex`) werden als exportierte `columns` + `generate` Bausteine bereitgestellt.
- In der Config importiert man sie einfach: `import { simpleColumns, simpleGenerate } from "./src/datasets/simple"`.
- Neue Templates ergänzen = neue Datei unter `src/datasets/` mit exportierten `columns` + `generate`.
- Kein Sonderverhalten — einheitliche Schnittstelle für alle Definitions.

### REQ-4: Selektives Seeding

- `pnpm seed --all` — alle Definitions aus der Config seeden.
- `pnpm seed --definition <name>` — nur eine spezifische Definition.
- `pnpm seed --definition <name> --definition <name>` — mehrere ausgewählte.
- Ohne `--all` oder `--definition`: Fehlermeldung mit Hinweis.

### REQ-5: Immer neu generieren (Replace-Semantik)

- Jeder Seed-Lauf ist ein vollständiger Reset der jeweiligen Definition:
  1. Bestehende Trino-Tabelle droppen (`DROP TABLE IF EXISTS`)
  2. Bestehende Daten im MinIO-Prefix löschen
  3. Neue Daten generieren
  4. Upload nach MinIO
  5. Schema sicherstellen (`CREATE SCHEMA IF NOT EXISTS`)
  6. Tabelle neu anlegen (`CREATE TABLE`)

### REQ-6: Connector-Strategie mit Flag

- `--connector` Flag zur Auswahl des Connectors (Default: aus Definition).
- Überschreibt den in der Definition konfigurierten Connector.
- Hive-Connector: Vollständig implementiert.
- ClickHouse-Connector: Stub mit "not yet implemented" — Interface vorbereitet.

### REQ-7: Statische Defaults für Minitrino

- Trino: `http://localhost:8080`, user `admin`, password `secret123`, catalog `hive`
- MinIO: `http://localhost:9000`, access-key `access-key`, secret-key `secret-key`, bucket `minitrino`
- Hardcoded für das lokale minitrino-Setup.

### REQ-8: Datenmenge via CLI

- `--amount` Flag (Default: 1000) für die Anzahl der generierten Records.
- Gilt global für alle Definitions im aktuellen Lauf.
- Wird an die `generate`-Funktion übergeben.

### REQ-9: S3-Pfadkonvention

- Daten liegen unter `<schema>/<table>/data.parquet` im MinIO-Bucket `minitrino`.
- Bei jedem Seed-Lauf wird der Prefix `<schema>/<table>/` gelöscht und die Datei neu geschrieben.
- Trino `external_location` zeigt auf `s3a://minitrino/<schema>/<table>/`.

### REQ-10: Feedback während der Ausführung

- Der Command gibt für jeden Schritt eine Statusmeldung aus (Spinner/Log).
- Bei Fehlern: klare Fehlermeldung mit Kontext (welcher Schritt, welche Definition).

### REQ-11: Bestehende Generierung wiederverwenden

- Parquet-Generierung: Generator schreibt auf Disk (FS). Der Seed liest die Datei und streamt nach MinIO.
- MinIO-Upload: `files-sdk` (wie in bestehender `sync.ts`)
- Trino DDL: `@lakeql/trino-client` (createTable, dropTable, query für Schema-Erstellung)
