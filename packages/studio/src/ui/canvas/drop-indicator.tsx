import { cn } from "@/lib/utils"

/**
 * The horizontal line shown where a dragged field will land (Requirement 2.4).
 * Rendered before the node the pointer is dropping before, or at the end of a
 * container zone when appending.
 *
 * `valid` tints it to signal whether the current hover is a structurally
 * possible drop: the handler drives this from the live `planMove` result.
 */
export const DropIndicator = ({ valid }: { valid: boolean }) => (
  <div
    aria-hidden="true"
    data-drop-indicator={valid ? "valid" : "invalid"}
    className={cn(
      "my-0.5 h-0.5 w-full rounded-full",
      valid ? "bg-ring" : "bg-destructive"
    )}
  />
)
