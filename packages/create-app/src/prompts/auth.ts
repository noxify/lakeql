import { cancel, isCancel, select } from "@clack/prompts"

import type { AuthStrategyId } from "../features/auth-strategies"
import { AUTH_STRATEGIES, AUTH_STRATEGY_IDS } from "../features/auth-strategies"

export async function promptAuthStrategy(): Promise<string> {
  const result = await select({
    message: "Which authentication strategy?",
    options: AUTH_STRATEGIES.map((s) => ({
      hint: s.hint,
      label: s.label,
      value: s.id,
    })),
  })

  if (isCancel(result)) {
    cancel("Operation cancelled")
    process.exit(0)
  }

  return result
}

export function resolveAuthFromFlag(strategyId: string): AuthStrategyId {
  const valid: readonly string[] = AUTH_STRATEGY_IDS
  if (!valid.includes(strategyId)) {
    cancel(
      `Invalid auth strategy: ${strategyId}. Valid options: ${valid.join(", ")}`
    )
    process.exit(1)
  }
  return strategyId as AuthStrategyId
}
