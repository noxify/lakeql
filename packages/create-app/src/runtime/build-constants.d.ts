/**
 * Ambient declarations for the compile-time constants that tsdown's
 * `define` map replaces at build time (see `tsdown.config.ts`). These are
 * not real runtime globals — they only exist so the source type-checks
 * against the bundler's string replacement. `tsx` dev runs never define
 * them, which is why every read of these identifiers is guarded with a
 * `typeof … === "string"` check (see `src/runtime/build-env.ts`).
 */
declare const __TEMPLATE_REF__: string
declare const __LAKEQL_PKG_SHA__: string
