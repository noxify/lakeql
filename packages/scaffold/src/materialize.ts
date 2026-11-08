/**
 * Materializer — writes generated files to disk.
 * Supports idempotent writes (only writes if content changed)
 * and a dry-run mode for CI preview.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

import {
  generateEnvExample,
  generateEnvTs,
  generateLakeqlConfig,
} from "./builders"
import type { Plan } from "./ops"

export type WriteMode = "write" | "dry-run"

/**
 * Write a file only if its content has changed.
 * In dry-run mode, logs what would be written without touching disk.
 */
function writeIfChanged(
  filePath: string,
  content: string,
  mode: WriteMode
): void {
  const prev = existsSync(filePath) ? readFileSync(filePath, "utf-8") : ""

  if (prev === content) {
    return
  }

  if (mode === "dry-run") {
    // eslint-disable-next-line no-console
    console.log(`  ~ would write: ${path.relative(process.cwd(), filePath)}`)
    return
  }

  writeFileSync(filePath, content, "utf-8")
}

/**
 * Materialize all generated files from a Plan into the target directory.
 */
export function materializeFiles(
  targetDir: string,
  plan: Plan,
  mode: WriteMode = "write"
): void {
  writeIfChanged(
    path.join(targetDir, ".env.example"),
    generateEnvExample(plan),
    mode
  )

  writeIfChanged(
    path.join(targetDir, "src", "env.ts"),
    generateEnvTs(plan),
    mode
  )

  writeIfChanged(
    path.join(targetDir, "lakeql.config.ts"),
    generateLakeqlConfig(plan),
    mode
  )

  // Write additional files from the plan
  for (const [filePath, content] of Object.entries(plan.files)) {
    writeIfChanged(path.join(targetDir, filePath), content, mode)
  }
}
