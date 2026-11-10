import type { ClassValue } from "clsx"
import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Merge class names with Tailwind-aware conflict resolution.
 *
 * Combines {@link clsx} (conditional class composition) with
 * {@link twMerge} (later Tailwind utilities win over earlier conflicting ones).
 *
 * @param inputs - Class values to combine (strings, arrays, or conditionals).
 * @returns The merged, de-conflicted class string.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
