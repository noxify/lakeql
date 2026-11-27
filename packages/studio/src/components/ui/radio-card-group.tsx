import { Radio as RadioPrimitive } from "@base-ui/react/radio"
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group"
import { cn } from "cn"
import type * as React from "react"

/**
 * A radio group laid out as a vertical stack of rich option cards.
 *
 * Built on `@base-ui/react/radio-group`, mirroring the `data-slot`/`cn` wrapper
 * idiom of {@link RadioGroup}. Compose it from {@link RadioCardItem}s; it is a
 * drop-in replacement for the flat radio list when each option needs a title
 * and a description.
 */
function RadioCardGroup({ className, ...props }: RadioGroupPrimitive.Props) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-card-group"
      className={cn("grid w-full gap-2", className)}
      {...props}
    />
  )
}

/**
 * Props for a single {@link RadioCardItem}, extending the Base UI radio root
 * with the card's title and description copy.
 */
export interface RadioCardItemProps extends Omit<
  RadioPrimitive.Root.Props,
  "title"
> {
  /** Short bold label shown as the option title. */
  title: React.ReactNode
  /** Secondary explanatory copy under the title. */
  description?: React.ReactNode
}

/**
 * A single selectable card: the radio indicator, the title, and the optional
 * description.
 *
 * The whole `Radio.Root` wraps the title and description, so the card's
 * accessible name is the title and the description is associated through the
 * card markup. `disabled` surfaces a non-interactive, dimmed state conveyed to
 * assistive technology (the primitive's disabled state); callers supply the
 * disabled reason via {@link RadioCardItemProps.description}.
 */
function RadioCardItem({
  className,
  title,
  description,
  ...props
}: RadioCardItemProps) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-card-item"
      className={cn(
        "group/radio-card-item flex items-start gap-3 rounded-lg border border-input bg-transparent p-3 text-left outline-none transition-colors hover:bg-accent/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-checked:border-primary data-checked:bg-accent/40 dark:bg-input/30",
        className
      )}
      {...props}
    >
      <span
        data-slot="radio-card-indicator"
        className="border-input group-data-checked/radio-card-item:border-primary group-data-checked/radio-card-item:bg-primary group-data-checked/radio-card-item:text-primary-foreground relative mt-0.5 flex aspect-square size-4 shrink-0 rounded-full border"
      >
        <RadioPrimitive.Indicator className="flex size-4 items-center justify-center">
          <span className="bg-primary-foreground absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full" />
        </RadioPrimitive.Indicator>
      </span>
      <span className="grid gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        {description !== undefined && (
          <span className="text-muted-foreground text-xs">{description}</span>
        )}
      </span>
    </RadioPrimitive.Root>
  )
}

export { RadioCardGroup, RadioCardItem }
