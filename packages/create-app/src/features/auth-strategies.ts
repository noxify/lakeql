/**
 * Auth strategy definitions, kept dependency-free so both the runtime auth
 * feature and the command metadata (used by documentation builds) can share
 * a single source of truth without pulling in template-generation code.
 */

/** A selectable authentication strategy. */
export interface AuthStrategy {
  /** Stable identifier used by CLI flags and generated config. */
  id: string
  /** Human-readable label shown in interactive prompts. */
  label: string
  /** Short description shown alongside the label in prompts. */
  hint?: string
}

/** The supported authentication strategies. */
export const AUTH_STRATEGIES = [
  {
    id: "mock",
    label: "Mock Auth",
    hint: "token-based mock for local development",
  },
  {
    id: "entra-id",
    label: "Microsoft Entra ID",
    hint: "JWT verification via JWKS endpoint",
  },
  {
    id: "custom",
    label: "Custom",
    hint: "typed boilerplate to implement your own resolver",
  },
] as const satisfies readonly AuthStrategy[]

/** A supported authentication strategy ID. */
export type AuthStrategyId = (typeof AUTH_STRATEGIES)[number]["id"]

/** The supported authentication strategy IDs. */
export const AUTH_STRATEGY_IDS: AuthStrategyId[] = AUTH_STRATEGIES.map(
  (strategy) => strategy.id
)
