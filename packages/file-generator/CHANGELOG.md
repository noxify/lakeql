# @lakeql/file-generator

## 0.1.6

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
  - @lakeql/helpers@0.1.3

## 0.1.5

### Patch Changes

- Updated dependencies [abadd24]
  - @lakeql/schema-generator@0.3.0

## 0.1.4

### Patch Changes

- 136670e: Hardened the generators by adding an explicit root-model guard, making mutation config handling treat empty mutation lists as disabled, and switching JSON schema generation to fail fast instead of silently swallowing invalid field definitions.
- Updated dependencies [136670e]
  - @lakeql/schema-generator@0.2.1

## 0.1.3

### Patch Changes

- Updated dependencies [c30f3d9]
  - @lakeql/schema-generator@0.2.0

## 0.1.2

### Patch Changes

- 450ba80: Add package description and keywords to package.json for npm discoverability
- 2432512: Extract inline parameter types into named exported interfaces with JSDoc for improved API reference documentation
- Updated dependencies [450ba80]
- Updated dependencies [2432512]
  - @lakeql/schema-generator@0.1.2
  - @lakeql/helpers@0.1.2

## 0.1.1

### Patch Changes

- 974e04d: Add package README files
- Updated dependencies [974e04d]
  - @lakeql/helpers@0.1.1
  - @lakeql/schema-generator@0.1.1

## 0.1.0

### Minor Changes

- 12dd6ae: initial release

### Patch Changes

- Updated dependencies [12dd6ae]
  - @lakeql/helpers@0.1.0
  - @lakeql/schema-generator@0.1.0
