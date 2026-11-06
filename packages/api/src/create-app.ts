/**
 * Convenience wrapper that turns a loaded LakeQL project config into a running
 * API server with a single call, while staying fully ejectable.
 *
 * `createLakeQLApp` encapsulates the wiring a generated `src/index.ts` would
 * otherwise hand-write: load the config, derive per-source auth metadata,
 * build the `ResolveAuth`, compose the runtime, and define the API server. The
 * docs "eject" example is the expanded form of the standard call — the same
 * steps in the same order — so a user can inline it without surprises.
 *
 * @module
 */

import type { LakeQLRuntime, LoadedLakeQLProject } from "@lakeql/config"
import { createLakeQLRuntime, loadConfig } from "@lakeql/config"

import type { ApiRuntimeConfig } from "./config"
import { defineApiConfig } from "./config"
import type { ResolveAuthSourceInfo } from "./resolve-auth"
import { createApiResolveAuth } from "./resolve-auth"

/**
 * The warning printed on startup when no permission rules are configured.
 *
 * Exported so tests and the docs can assert the exact wording the wrapper
 * emits. Empty `auth.permissions` is a valid state, but it applies the
 * defaults, so surface it instead of leaving a silent gap.
 */
export const EMPTY_PERMISSIONS_WARNING =
  "No LakeQL permission rules configured. Defaults apply: human reads are delegated to each data source's own access control (e.g. Trino rules via impersonation, Fabric OBO), service-principal reads are denied, and all writes are denied until a matching Mutation rule is added. Ensure impersonation is configured — otherwise human queries run with the data source's service credentials."

/**
 * Options accepted by {@link createLakeQLApp}.
 *
 * Every server-shaping option is inherited structurally from
 * {@link ApiRuntimeConfig} (minus `runtime`, which the wrapper builds), so a
 * new `defineApiConfig` option is forwarded automatically without touching
 * this type. Two wrapper-only options are added: `project` selects an
 * already-loaded config, and `handleSignals` controls graceful shutdown.
 */
export interface CreateLakeQLAppOptions extends Omit<
  ApiRuntimeConfig,
  "runtime"
> {
  /**
   * An already-loaded project (from `loadConfig()`). When omitted, the wrapper
   * calls `loadConfig()` itself with no arguments, matching the generated
   * entry file's default.
   */
  project?: LoadedLakeQLProject
  /**
   * Permission rules for technical users.
   *
   * @default project.config.auth?.permissions ?? []
   */
  permissions?: ApiRuntimeConfig["permissions"]
  /**
   * Register `SIGTERM`/`SIGINT` handlers that close the runtime and exit.
   *
   * When `true` (the default) the wrapper owns graceful shutdown, reproducing
   * the generated entry file. Set to `false` to own the lifecycle yourself via
   * the returned `close()`/`runtime`.
   *
   * @default true
   */
  handleSignals?: boolean
}

/**
 * The composed application returned by {@link createLakeQLApp}.
 *
 * Exposes the underlying runtime for advanced control plus `start`/`close`
 * lifecycle helpers.
 */
export interface LakeQLApp {
  /**
   * The composed runtime that owns data sources and read/write strategies.
   * Advanced callers can drive it directly.
   */
  runtime: LakeQLRuntime
  /**
   * Starts the HTTP server. Reproduces the generated entry file's startup
   * error handling: configuration-state errors (e.g. no schema files yet) are
   * printed without a stack trace and the process exits non-zero.
   *
   * @returns A promise that resolves once the server has started.
   */
  start: () => Promise<void>
  /**
   * Closes the runtime, releasing all data-source connections. Note this does
   * not stop the HTTP listener — the socket is released on process exit. Call
   * it when `handleSignals` is `false` and you own shutdown.
   *
   * @returns A promise that resolves when the runtime is closed.
   */
  close: () => Promise<void>
}

/**
 * Builds a ready-to-start LakeQL API server from a loaded project config.
 *
 * Encapsulates the full wiring the generated `src/index.ts` would otherwise
 * hand-write: it loads the config (unless `project` is supplied), derives the
 * per-source `sources` map and the global impersonation resolver, builds the
 * `ResolveAuth` via {@link createApiResolveAuth}, composes the runtime via
 * `createLakeQLRuntime`, and defines the server via {@link defineApiConfig}.
 * Every remaining option is forwarded to {@link defineApiConfig} unchanged.
 *
 * Permissions default to `project.config.auth?.permissions ?? []` and can be
 * overridden via {@link CreateLakeQLAppOptions.permissions}. When the effective
 * rule set is empty, {@link EMPTY_PERMISSIONS_WARNING} is printed so the
 * default behavior is a deliberate choice, not a silent gap.
 *
 * @param options - Project source and server-shaping options. All optional.
 * @returns The composed {@link LakeQLApp} with `runtime`, `start`, and `close`.
 * @throws {Error} When `createLakeQLRuntime` rejects — for example a
 *   configured adapter name has no registered factory, two factories share a
 *   name, or a factory method fails while constructing a data source.
 */
export async function createLakeQLApp(
  options: CreateLakeQLAppOptions = {}
): Promise<LakeQLApp> {
  const {
    project: providedProject,
    handleSignals = true,
    permissions: permissionsOption,
    ...rest
  } = options

  // The `rest` spread carries only `ApiRuntimeConfig` fields now — `project`,
  // `handleSignals`, and `permissions` are destructured out above. This guard
  // fails to compile if either wrapper-only key ever leaks into `rest`.
  const _restGuard: Omit<ApiRuntimeConfig, "runtime" | "permissions"> = rest
  void _restGuard

  // Load the project config (adapters + data sources) unless one was passed in.
  const project = providedProject ?? (await loadConfig())

  // Derive per-source auth metadata (adapter + optional impersonation resolver)
  // from the loaded data sources. Empty until a data source is configured.
  const sources: Record<string, ResolveAuthSourceInfo> = Object.fromEntries(
    Object.entries(project.config.dataSources).map(([name, definition]) => [
      name,
      {
        adapter: definition.adapter,
        impersonationResolver: definition.impersonationResolver,
      },
    ])
  )

  const resolveAuth = createApiResolveAuth({
    sources,
    globalImpersonationResolver: project.config.auth?.impersonationResolver,
  })

  // Build the runtime that owns data sources and read/write strategies.
  const runtime = await createLakeQLRuntime({
    config: project.config,
    adapters: project.adapters,
    resolveAuth,
  })

  // Technical-user permission rules, declared on lakeql.config.ts under
  // `auth.permissions`. Absent/empty is a valid state, but it applies the
  // defaults: human reads are delegated to each data source's own access
  // control, service-principal reads are denied, and all writes are denied
  // until a matching Mutation rule is added. Warn so that fallback is a
  // deliberate choice, not a silent gap.
  const permissions =
    permissionsOption ?? project.config.auth?.permissions ?? []
  if (permissions.length === 0) {
    // eslint-disable-next-line no-console
    console.warn(EMPTY_PERMISSIONS_WARNING)
  }

  // Compose the API server around the runtime. Every forwarded option rides in
  // `...rest`; the wrapper only resolves `runtime` and `permissions`.
  const server = defineApiConfig({ ...rest, runtime, permissions })

  const close = async (): Promise<void> => {
    await runtime.close()
  }

  // Graceful shutdown: close all data-source connections, then exit.
  if (handleSignals) {
    const shutdown = async (): Promise<void> => {
      await close()
      process.exit(0)
    }
    process.on("SIGTERM", shutdown)
    process.on("SIGINT", shutdown)
  }

  const start = async (): Promise<void> => {
    try {
      await server.startServer()
    } catch (error) {
      // Startup errors (e.g. no schema files yet) are configuration states,
      // not crashes. Print the message without a stack trace and exit non-zero.
      // eslint-disable-next-line no-console
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  }

  return { runtime, start, close }
}
