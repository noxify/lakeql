import { DummyDriver, Kysely } from "kysely"

import type { QueryDialect } from "./dialect"

/**
 * Creates a Kysely instance configured for SQL compilation only (no execution).
 *
 * Uses the DummyDriver since we only compile SQL — actual execution
 * happens through the DataSource. The dialect components come from
 * the adapter-specific QueryDialect.
 */
export const initDb = <T>(dialect: QueryDialect) =>
  new Kysely<T>({
    // Kysely reads only the four create* methods; the DummyDriver override
    // replaces createDriver so no real connection is ever opened. Any extra
    // QueryDialect members are inert here.
    dialect: { ...dialect, createDriver: () => new DummyDriver() },
  })
