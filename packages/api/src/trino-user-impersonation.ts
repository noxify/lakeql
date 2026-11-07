/**
 * Convenience factory for Trino user impersonation.
 *
 * Trino performs impersonation via the `X-Trino-User` header, which the
 * Trino adapter reads from `options.impersonateAs`. This helper produces an
 * {@link ImpersonationResolver} that maps a field of the current user's JWT
 * payload to that option.
 *
 * @module
 */

import type { ImpersonationResolver } from "@lakeql/config"

/**
 * How to map the claim value to the Trino username before it is sent as
 * `X-Trino-User`.
 *
 * - `"lower"` / `"upper"`: declarative case normalization for the common case
 *   where the IdP claim differs from the Trino username only in case.
 * - a function: any custom mapping, e.g. stripping a domain
 *   (`(v) => v.split("@")[0]`).
 */
export type TrinoUsernameTransform =
  | "lower"
  | "upper"
  | ((value: string) => string)

/**
 * Options for {@link trinoUserImpersonation}.
 */
export interface TrinoUserImpersonationOptions {
  /**
   * Name of the JWT payload field to impersonate as.
   * @default "userName"
   */
  nameField?: string
  /**
   * Maps the claim value to the Trino username before it is sent as
   * `X-Trino-User`. Use this when the IdP claim does not match the Trino
   * username verbatim: `"lower"` / `"upper"` for case normalization, or a
   * function for anything else.
   *
   * Applied only to a present, non-empty string claim. When the result is an
   * empty string, the resolver returns `null` (no impersonation).
   *
   * @default the claim value is used unchanged
   */
  transform?: TrinoUsernameTransform
}

/** Resolve a {@link TrinoUsernameTransform} into a plain mapping function. */
function toTransformFn(
  transform: TrinoUsernameTransform | undefined
): (value: string) => string {
  if (transform === "lower") {
    return (value) => value.toLowerCase()
  }
  if (transform === "upper") {
    return (value) => value.toUpperCase()
  }
  return transform ?? ((value) => value)
}

/**
 * Creates an {@link ImpersonationResolver} that impersonates the current
 * user by their JWT `nameField` via Trino's `impersonateAs` option
 * (`X-Trino-User`).
 *
 * Returns `null` when the field is missing or not a non-empty string, so the
 * caller falls back to the system user.
 *
 * @example
 * ```ts
 * // lakeql.config.ts
 * dataSources: {
 *   warehouse: {
 *     adapter: "trino",
 *     connection: { … },
 *     impersonationResolver: trinoUserImpersonation(),                    // userName
 *     // impersonationResolver: trinoUserImpersonation({ nameField: "preferred_username" }),
 *     // impersonationResolver: trinoUserImpersonation({ nameField: "onpremsamaccountname", transform: "lower" }),
 *     // impersonationResolver: trinoUserImpersonation({ transform: (v) => v.split("@")[0] }),
 *   },
 * }
 * ```
 *
 * @param options - Optional field selection.
 * @returns An `ImpersonationResolver` producing `{ options: { impersonateAs } }`.
 */
export function trinoUserImpersonation(
  options: TrinoUserImpersonationOptions = {}
): ImpersonationResolver {
  const nameField = options.nameField ?? "userName"
  const transform = toTransformFn(options.transform)

  const resolver: ImpersonationResolver = ({ currentUser }) => {
    const value = currentUser[nameField]

    if (typeof value !== "string" || value === "") {
      return Promise.resolve(null)
    }

    const impersonateAs = transform(value)
    if (impersonateAs === "") {
      return Promise.resolve(null)
    }

    return Promise.resolve({ options: { impersonateAs } })
  }

  return resolver
}
