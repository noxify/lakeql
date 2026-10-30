import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

/**
 * Container for a numbered, sequential set of steps.
 *
 * Rendered statically with a CSS counter rather than interactive controls, so
 * step bodies may contain any content — including code blocks, links, and
 * other components — without producing invalid nested interactive markup.
 *
 * Each direct `<Step>` (an `<h3>`) increments the counter and shows its number
 * in the gutter. A vertical rule connects the steps.
 */
export const Steps = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    className={cn(
      "mb-12 ml-4 border-l pl-8 [counter-reset:step]",
      "[&>h3]:[counter-increment:step]",
      className
    )}
    {...props}
  />
)

/**
 * A single step heading within a {@link Steps} container.
 *
 * Renders an `<h3>` whose generated number is drawn in the left gutter via the
 * parent's CSS counter. Content for the step follows as normal sibling blocks
 * until the next `<Step>`.
 */
export const Step = ({
  className,
  children,
  ...props
}: ComponentProps<"h3">) => (
  <h3
    className={cn(
      "relative mt-8 mb-2 scroll-m-20 text-base font-semibold tracking-tight",
      "before:bg-muted before:text-muted-foreground before:absolute before:inline-flex before:items-center before:justify-center",
      "before:left-[-41.5px] before:size-7 before:rounded-full before:text-sm before:font-medium",
      "before:content-[counter(step)] before:ring-background before:ring-4",
      className
    )}
    {...props}
  >
    {children}
  </h3>
)
