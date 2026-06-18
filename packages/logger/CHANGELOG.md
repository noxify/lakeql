# @lakeql/logger

## 0.2.1

### Patch Changes

- dec54a0: Improve CLI pull UX and harden code generation/error handling.

  - fix CLI argument parsing so `pull` executes instead of showing help
  - improve CLI error rendering with clearer contextual messages
  - remove implicit dotenv loading from CLI runtime (environment must be provided by caller)
  - add interactive pull task progress and generate config registry once per run
  - expand logger console helpers with `info` and `warning`
  - harden schema generation for invalid field names by central normalization in schema-generator
  - add/adjust regression tests for pull output and identifier handling

## 0.2.0

### Minor Changes

- ef6209b: Extend console formatting helpers used by CLI output.

  - Add `info()` and `warning()` console helpers in `@lakeql/logger/console`.
  - Enable consistent status/error formatting across CLI command and error output paths.

## 0.1.3

### Patch Changes

- b48beff: Bump tsdown devDependency from 0.22.2 to 0.22.3

## 0.1.2

### Patch Changes

- 450ba80: Add package description and keywords to package.json for npm discoverability

## 0.1.1

### Patch Changes

- 974e04d: Add package README files

## 0.1.0

### Minor Changes

- 12dd6ae: initial release
