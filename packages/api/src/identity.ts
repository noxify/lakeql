import type {
  IdentityResolver,
  JWTPayload,
  ResolvedIdentity,
} from "@lakeql/config"

/**
 * Default identity resolver for Microsoft Entra ID (Azure AD) tokens.
 *
 * Extracts `userName` from the token using a fallback chain:
 * 1. `onpremsamaccountname` — synced on-prem AD account
 * 2. `preferred_username` — Entra ID UPN
 * 3. `azp` — authorized party (client ID for app-only tokens)
 * 4. `"unknown"` — fallback when none of the above are present
 *
 * Determines service principal status when:
 * - `idtyp` claim is `"app"` (explicit app-only token), or
 * - no `idtyp` claim is present AND no `onpremsamaccountname` claim exists
 *   (heuristic: app-only tokens typically lack user-linked claims)
 *
 * @param token - Decoded JWT payload from the token resolver.
 * @returns Resolved identity with userName and isServicePrincipal flag.
 */
export const entraIdIdentityResolver: IdentityResolver = (
  token: JWTPayload
): ResolvedIdentity => {
  const userName =
    asString(token.onpremsamaccountname) ??
    asString(token.preferred_username) ??
    asString(token.azp) ??
    "unknown"

  const idtyp = asString(token.idtyp)
  const isServicePrincipal =
    idtyp === "app" || (!idtyp && !token.onpremsamaccountname)

  return {
    userName,
    isServicePrincipal,
  }
}

/** Safely narrow an unknown claim value to string. */
function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}
