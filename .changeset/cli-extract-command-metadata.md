---
"@lakeql/cli": minor
---

Extract command metadata into standalone modules for documentation builds

- Separated command structure (options, arguments, descriptions) from action handlers into dedicated `metadata/` files
- Added `commands-metadata.ts` module with `getCommandConfig` and `availableCommands` exports for programmatic introspection
- Exported `CommandConfig`, `CommandOptionMeta`, and `CommandArgumentMeta` types from package entry
- Updated `tsdown.config.ts` to produce a separate `commands-metadata` entry point
- Removed standalone `format-field-tree.ts` file (inlined into `create-endpoint.ts`)
