---
packages:
  "@lakeql/adapter-trino":
    type: minor
---

### Trino INSERT write strategy

`@lakeql/adapter-trino` can now write through `INSERT INTO` statements with no object-storage dependency, selected via an adapter-owned `writeConfig` discriminator. Set `writeConfig: { strategy: "insert" }` on `createWriteStrategy` to route writes through the new strategy; the default (`"storage"`, or an omitted `strategy`) keeps the existing upload+DDL storage pipeline unchanged.

The insert strategy supports the `append`, `full_load`, and `full_load_append` load strategies, optional typed `CREATE TABLE IF NOT EXISTS` auto-creation (`autoCreateTable`), and batched inserts (`batchSize`). For `full_load` it creates a pending typed table, inserts, drops the original, and renames the pending table into place; on insert failure the pending table is dropped and the original is left unchanged, and on rename failure the pending table is retained and its fully-qualified name is reported for recovery.

New public exports: `createTrinoInsertWriteStrategy`, `DEFAULT_BATCH_SIZE`, `validateTrinoWriteConfig`, and the `TrinoWriteConfig` / `TrinoStorageWriteConfig` / `TrinoInsertWriteConfig` / `TrinoInsertWriteStrategyConfig` types.
