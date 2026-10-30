import { createLakeQLRuntime } from "./create-runtime"
import type { CreateLakeQLRuntimeOptions, LakeQLRuntime } from "./types"

/**
 * Manages a single active LakeQL runtime with safe reload semantics.
 *
 * During reload, a new runtime is created first. The old runtime is
 * only closed after the new one resolves successfully. If creation
 * fails, the old runtime remains active and the construction error
 * propagates to the caller.
 *
 * If the old runtime's `close()` rejects after a successful swap,
 * the new runtime remains active and the close error propagates.
 */
export class RuntimeLifecycleManager {
  #runtime: LakeQLRuntime

  /**
   * @param initialRuntime - The first active runtime instance.
   */
  constructor(initialRuntime: LakeQLRuntime) {
    this.#runtime = initialRuntime
  }

  /** The currently active runtime instance. */
  get runtime(): LakeQLRuntime {
    return this.#runtime
  }

  /**
   * Reloads the runtime with new configuration.
   *
   * Creates a new runtime before closing the old one. If creation
   * fails, the old runtime remains active and the error propagates.
   * If the old runtime's `close()` rejects after a successful swap,
   * the new runtime is still exposed as active and the close error
   * propagates to the caller.
   *
   * @param options - New configuration for the replacement runtime.
   * @returns The new active runtime.
   * @throws {Error} If `createLakeQLRuntime` rejects (old runtime preserved).
   * @throws {Error} If old runtime `close()` rejects (new runtime still active).
   */
  async reload(options: CreateLakeQLRuntimeOptions): Promise<LakeQLRuntime> {
    // Step 1: Create the new runtime. If this fails, old runtime stays active.
    const newRuntime = await createLakeQLRuntime(options)

    // Step 2: Swap the active runtime reference before closing old.
    const oldRuntime = this.#runtime
    this.#runtime = newRuntime

    // Step 3: Close old runtime. Error propagates but new runtime remains active.
    await oldRuntime.close()

    return newRuntime
  }
}
