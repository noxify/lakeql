/**
 * Feature-template model shared by `@lakeql/create-app` and `@lakeql/cli`.
 *
 * A feature template is declarative DATA: it describes what a feature
 * contributes to a project — dependency names, env vars, file contents, and
 * config wiring — as a set of {@link Op} descriptors plus human-readable
 * follow-up steps. A template never imports its target dependencies, so this
 * package stays dependency-light.
 *
 * A template reads only statically reliable project facts (the parsed
 * `package.json`) plus values the caller gathered from the user (`inputs`). It
 * never loads or executes the project's `lakeql.config.ts`, so applying a
 * feature never triggers the project's env validation or adapter validation.
 */

import type { Op } from "../ops"

/**
 * The subset of a project's `package.json` a feature template may read.
 *
 * Only the fields relevant to feature decisions are typed; unknown fields are
 * preserved so a template can read less common ones when needed.
 */
export interface ProjectPackageJson {
  name?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  [key: string]: unknown
}

/**
 * A value a feature needs that cannot be derived from static project files.
 *
 * The consumer maps each input to a CLI flag (non-interactive) and/or an
 * interactive prompt, then passes the resolved answers to the template via
 * {@link FeatureContext.inputs}. A template declares its inputs; it never
 * prompts or reads argv itself.
 */
export interface FeatureInput {
  /** Key under which the resolved answer is stored in `ctx.inputs`. */
  id: string
  /** Long CLI flag that supplies this input non-interactively, e.g. `source`. */
  flag: string
  /** Message shown when prompting for the value interactively. */
  prompt: string
  /**
   * Whether the input must be provided. A required input left unresolved in a
   * non-interactive run is an error the consumer surfaces; an optional input
   * simply stays `undefined`.
   *
   * @default false
   */
  required?: boolean
}

/**
 * The project context a feature is applied against.
 *
 * Carries only statically reliable facts and user-supplied answers — never the
 * executed project config.
 */
export interface FeatureContext {
  /** Absolute project root (`INIT_CWD`/cwd). */
  projectDir: string
  /** The project's parsed `package.json`. */
  packageJson: ProjectPackageJson
  /**
   * Resolved answers for the template's declared {@link FeatureInput}s, keyed
   * by input id. An unanswered optional input is absent.
   */
  inputs: Record<string, string | undefined>
}

/**
 * What a feature template contributes to a project.
 */
export interface FeatureResult {
  /** Scaffolding operations to apply (deps, env, files, config wiring). */
  ops: Op[]
  /** Human-readable follow-up steps the template cannot automate. */
  nextSteps: string[]
}

/**
 * A named, declarative feature definition.
 */
export interface FeatureTemplate {
  /** Registry key used by `lakeql add <id>`. */
  id: string
  /** One-line summary shown in listings and help output. */
  description: string
  /**
   * Values the feature needs from the user that are not in static project
   * files. The consumer resolves these from flags/prompts before `build`.
   *
   * @default [] (no inputs)
   */
  inputs?: FeatureInput[]
  /**
   * Verify the project satisfies the template's requirements, reading only
   * `ctx.packageJson` and `ctx.inputs`.
   *
   * @param ctx - The resolved project context.
   * @throws {Error} When a precondition is unmet; the thrown error carries an
   * actionable message describing what is missing.
   */
  checkPreconditions: (ctx: FeatureContext) => void
  /**
   * Produce the template's contributions for the given project.
   *
   * @param ctx - The resolved project context.
   * @returns The ops to apply and the follow-up steps to print.
   */
  build: (ctx: FeatureContext) => FeatureResult
}
