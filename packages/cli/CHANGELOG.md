# @lakeql/cli

## 0.7.1

### Patch Changes

- ed10860: Improve pull command UX for large table selections by switching to compact live output.

  - for interactive pull with >10 tables selected: use compact live progress (`Completed X/Y | Active A/B`) instead of rendering one task line per table
  - parallelizes table pulls with bounded concurrency (8 concurrent workers) to balance speed and resource usage
  - displays active table names (up to 5) with `… +N more active` indicator when queue is large
  - prevents terminal flooding for large schema pulls while maintaining visibility into active work

## 0.7.0

### Minor Changes

- c7a14f5: Add `generate-import-config` command to generate an `import.config.mjs` from already-pulled schemas.

  - scans `schemas/generated/<catalog>/<schema>/<table>/` and builds a ready-to-use bulk pull config
  - previews the generated config in the terminal before writing
  - prompts for confirmation before writing; warns and asks for overwrite confirmation when file already exists
  - `--force` flag skips confirmation and overwrites without prompting
  - `--output <path>` to customise the output file (default: `import.config.mjs` in the invocation directory)

## 0.6.2

### Patch Changes

- dec54a0: Improve CLI pull UX and harden code generation/error handling.

  - fix CLI argument parsing so `pull` executes instead of showing help
  - improve CLI error rendering with clearer contextual messages
  - remove implicit dotenv loading from CLI runtime (environment must be provided by caller)
  - add interactive pull task progress and generate config registry once per run
  - expand logger console helpers with `info` and `warning`
  - harden schema generation for invalid field names by central normalization in schema-generator
  - add/adjust regression tests for pull output and identifier handling

- Updated dependencies [dec54a0]
  - @lakeql/logger@0.2.1
  - @lakeql/schema-generator@0.4.3
  - @lakeql/file-generator@0.1.9

## 0.6.1

### Patch Changes

- bf033ab: Improve `pull` command UX by adding explicit progress and completion messages for successful runs.

  - Print a visible start message before generation begins.
  - Print a clear success summary after files are generated, including item count and target path.
  - Update CLI pull documentation examples to reflect the new output.
  - Add test coverage for the new pull command output messaging.

## 0.6.0

### Minor Changes

- ef6209b: Improve CLI reliability, command execution, and user-facing diagnostics.

  - Fix command argument parsing so direct subcommands (for example `pull`) execute correctly instead of falling back to help output.
  - Add structured top-level CLI error handling with headline, reason, error code, root cause and actionable hints.
  - Handle user aborts consistently as non-error exits (`exitCode: 0`) and render them as warnings.
  - Introduce typed CLI errors (`CliError`) to keep command failures consistent across commands.
  - Add Trino request context to failures in `pull`, `list-schemas`, `list-tables`, `list-views` and `list-columns`.
  - Validate bulk pull config entries strictly (each entry must define `schema` and at least one non-empty `tables` or `views` list).
  - Remove implicit `.env` loading from the CLI runtime so environment injection is explicit and standalone-friendly.

### Patch Changes

- Updated dependencies [ef6209b]
  - @lakeql/logger@0.2.0

## 0.5.1

### Patch Changes

- 2acd5ad: Fix config loading when using `lakeql.config.json` on Node.js 24 with ESM.

  When `c12` fails with `ERR_IMPORT_ATTRIBUTE_MISSING` for JSON config imports,
  `@lakeql/cli` now falls back to reading `lakeql.config.json` directly and still
  applies default config values.

  The CLI also exits successfully when invoked without arguments, printing the
  top-level help instead of treating the missing command as an error.

  Other config loading errors are still rethrown unchanged.

## 0.5.0

### Minor Changes

- b48beff: Extract command metadata into standalone modules for documentation builds

  - Separated command structure (options, arguments, descriptions) from action handlers into dedicated `metadata/` files
  - Added `commands-metadata.ts` module with `getCommandConfig` and `availableCommands` exports for programmatic introspection
  - Exported `CommandConfig`, `CommandOptionMeta`, and `CommandArgumentMeta` types from package entry
  - Updated `tsdown.config.ts` to produce a separate `commands-metadata` entry point
  - Removed standalone `format-field-tree.ts` file (inlined into `create-endpoint.ts`)

### Patch Changes

- Updated dependencies [b48beff]
- Updated dependencies [de184c3]
  - @lakeql/column-parser@0.1.4
  - @lakeql/file-generator@0.1.8
  - @lakeql/helpers@0.1.4
  - @lakeql/logger@0.1.3
  - @lakeql/response-transformer@0.1.4
  - @lakeql/schema-generator@0.4.2
  - @lakeql/trino-client@0.4.0

## 0.4.2

### Patch Changes

- Updated dependencies [3ba4ef2]
  - @lakeql/schema-generator@0.4.1
  - @lakeql/file-generator@0.1.7

## 0.4.1

### Patch Changes

- 3d4e6c9: Add configurable partitioning support for write pipelines
  - Introduce `partitioning` and `partitioningFormat` options to mutation config
  - Support timestamp-based (default), field-based, custom format, and disabled partitioning modes
  - Add validation for custom partition format strings with date component extraction
  - Enrich schema and records with `load_timestamp` for timestamp-based partitioning
  - Generate flat paths when partitioning is disabled
  - Group records by partition field or custom format segments
  - Wire partitioning config through CLI generation and file-generator output

- 5c3c967: update dependencies
- Updated dependencies [3d4e6c9]
- Updated dependencies [5c3c967]
  - @lakeql/schema-generator@0.4.0
  - @lakeql/file-generator@0.1.6
  - @lakeql/response-transformer@0.1.3
  - @lakeql/column-parser@0.1.3
  - @lakeql/trino-client@0.3.1
  - @lakeql/helpers@0.1.3

## 0.4.0

### Minor Changes

- 5227bfa: Add bulk pull mode (`--bulk`) to the `pull` command for importing multiple schemas and tables from a single config file.
  - New `--bulk` flag enables bulk mode
  - New `--bulk-config <path>` option to specify config file (default: `import.config.mjs`)
  - Config file is an ES module exporting an array of `{ schema, tables?, views?, catalog? }` entries
  - Schema entries are processed in parallel using `listr2`
  - Catalog precedence: CLI flag > config entry > ENV variable
  - Config registry is generated once at the end (not per entry)
  - Exports `BulkPullConfig`, `BulkPullEntry`, and `LakeQLConfig` types for type-safe config files
  - Replaces `ora` with `listr2` for structured terminal output
  - Extracts reusable `executePull` action from the pull command
  - Migrates config loading to [c12](https://github.com/unjs/c12) — supports `.mjs`, `.ts`, `.js`, `.json` formats
  - `lakeql.config.mjs` now takes precedence over `lakeql.config.json`
  - `init` command now lets you choose between `.mjs` (recommended) and `.json` format

## 0.3.0

### Minor Changes

- abadd24: Add configurable storage adapter type (`s3` | `minio`) to the mutation pipeline. Credentials are read from standard environment variables per adapter (AWS*\* for S3, MINIO*\* for MinIO). The `bucket` field is now part of the per-endpoint mutation configuration alongside `basePath`. Generated `config.ts` exports a typed `storageConfig` object.

### Patch Changes

- abadd24: Fix env validation still triggering for non-Trino commands after bundling. Replace eager `createEnv()` with lazy `getEnv()` that only validates when called. Use Commander's `.env()` for catalog option fallback. Remove unused `--no-interactive` flag from `create-endpoint`. Add `--force` flag to skip overwrite confirmation.
- abadd24: Stop generating `mutation-schema.ts` when no `mutation` config is present in the endpoint definition. Previously, omitting the `mutation` field would still produce a placeholder resolver.
- Updated dependencies [abadd24]
  - @lakeql/schema-generator@0.3.0
  - @lakeql/file-generator@0.1.5

## 0.2.4

### Patch Changes

- Updated dependencies [136670e]
  - @lakeql/file-generator@0.1.4
  - @lakeql/schema-generator@0.2.1

## 0.2.3

### Patch Changes

- e1650f8: Stop generating `mutation-schema.ts` when no `mutation` config is present in the endpoint definition. Previously, omitting the `mutation` field would still produce a placeholder resolver — now it correctly skips the file.

## 0.2.2

### Patch Changes

- 5031bcb: Defer env validation to commands that actually need Trino access. Commands like `create-endpoint`, `config-registry`, and `init` no longer require a valid `.env` file to run. Use Commander's `.env()` for catalog option fallback. Remove unused `--no-interactive` flag from `create-endpoint`.

## 0.2.1

### Patch Changes

- 878220b: Defer env validation to commands that actually need Trino access. Commands like `create-endpoint`, `config-registry`, and `init` no longer require a valid `.env` file to run.

## 0.2.0

### Minor Changes

- c30f3d9: Add mutation pipeline support across the LakeQL stack.
  - **schema-generator**: Extend endpoint definition schema with optional `mutation` config (load strategy + base path) and per-field `options` (required, validations)
  - **cli**: Generate working mutation resolvers that invoke the write pipeline, generate Zod validation schemas from field options, display mutation config in `create-endpoint` summary, set `mutation: false` for pulled endpoints
  - **api/trino-client/create-app**: Dependency updates to support the new write pipeline integration

### Patch Changes

- Updated dependencies [c30f3d9]
  - @lakeql/schema-generator@0.2.0
  - @lakeql/trino-client@0.3.0
  - @lakeql/file-generator@0.1.3

## 0.1.2

### Patch Changes

- 450ba80: Add package description and keywords to package.json for npm discoverability
- Updated dependencies [450ba80]
- Updated dependencies [9c7ff16]
- Updated dependencies [2432512]
  - @lakeql/response-transformer@0.1.2
  - @lakeql/schema-generator@0.1.2
  - @lakeql/file-generator@0.1.2
  - @lakeql/column-parser@0.1.2
  - @lakeql/trino-client@0.2.0
  - @lakeql/helpers@0.1.2
  - @lakeql/logger@0.1.2

## 0.1.1

### Patch Changes

- 974e04d: Add package README files
- Updated dependencies [974e04d]
  - @lakeql/column-parser@0.1.1
  - @lakeql/file-generator@0.1.1
  - @lakeql/helpers@0.1.1
  - @lakeql/logger@0.1.1
  - @lakeql/response-transformer@0.1.1
  - @lakeql/schema-generator@0.1.1
  - @lakeql/trino-client@0.1.1

## 0.1.0

### Minor Changes

- 12dd6ae: initial release

### Patch Changes

- Updated dependencies [12dd6ae]
  - @lakeql/column-parser@0.1.0
  - @lakeql/file-generator@0.1.0
  - @lakeql/helpers@0.1.0
  - @lakeql/logger@0.1.0
  - @lakeql/response-transformer@0.1.0
  - @lakeql/schema-generator@0.1.0
  - @lakeql/trino-client@0.1.0
