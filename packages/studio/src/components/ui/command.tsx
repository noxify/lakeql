import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { Command as CommandPrimitive } from "cmdk"
import { cn } from "cn"
import { SearchIcon } from "lucide-react"
import * as React from "react"

/**
 * The `cmdk` command menu root, styled for the studio popover surface. Owns the
 * filtered-list behaviour (type-to-filter, arrow-key navigation, Enter to run);
 * compose it from {@link CommandInput}, {@link CommandList}, and the item
 * primitives below.
 */
function Command({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        "flex size-full flex-col overflow-hidden rounded-xl bg-popover p-1 text-popover-foreground",
        className
      )}
      {...props}
    />
  )
}

/**
 * A modal command palette: a centred Base UI dialog hosting a {@link Command}.
 *
 * Built on the same `@base-ui/react/dialog` primitive as the studio sheet so it
 * portals to `<body>` and inherits the document-root `.dark` theme. The title
 * and description are rendered visually hidden for assistive technology; pass
 * `open`/`onOpenChange` to control it.
 *
 * @param props.title - The accessible dialog title (visually hidden).
 * @param props.description - The accessible dialog description (visually
 *   hidden).
 * @param props.commandProps - Props forwarded to the inner {@link Command}
 *   root, e.g. the controlled `value`/`onValueChange` pair that drives the
 *   active item.
 * @param props.children - The {@link Command} subtree to render inside.
 */
function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  className,
  commandProps,
  children,
  ...props
}: Omit<DialogPrimitive.Root.Props, "children"> & {
  title?: string
  description?: string
  className?: string
  commandProps?: React.ComponentProps<typeof CommandPrimitive>
  children: React.ReactNode
}) {
  return (
    <DialogPrimitive.Root data-slot="command-dialog" {...props}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          data-slot="command-dialog-overlay"
          className="fixed inset-0 z-50 bg-black/10 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs"
        />
        <DialogPrimitive.Popup
          data-slot="command-dialog-content"
          className={cn(
            "fixed top-1/4 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10 transition duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0",
            className
          )}
        >
          <DialogPrimitive.Title
            data-slot="command-dialog-title"
            className="sr-only"
          >
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description
            data-slot="command-dialog-description"
            className="sr-only"
          >
            {description}
          </DialogPrimitive.Description>
          <Command
            className="[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-input-wrapper]_svg]:size-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:size-5"
            {...commandProps}
          >
            {children}
          </Command>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/**
 * The command palette's search input, prefixed with a search icon. Typing
 * filters the {@link CommandItem} list.
 */
function CommandInput({
  className,
  leading,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input> & {
  /**
   * Optional element rendered inside the input row, before the search icon —
   * e.g. a back button. Kept inside the bordered wrapper so the row's border
   * and padding span the full width rather than splitting the layout.
   */
  leading?: React.ReactNode
}) {
  return (
    <div
      data-slot="command-input-wrapper"
      className="flex items-center gap-2 border-b px-3"
    >
      {leading}
      <SearchIcon className="size-4 shrink-0 opacity-50" />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    </div>
  )
}

/** The scrollable results region holding the groups and items. */
function CommandList({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      ref={ref}
      data-slot="command-list"
      className={cn(
        "max-h-80 scroll-py-1 overflow-x-hidden overflow-y-auto outline-none",
        className
      )}
      {...props}
    />
  )
}

/** The message shown when the query matches no command. */
function CommandEmpty({
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className="py-6 text-center text-sm"
      {...props}
    />
  )
}

/** A labelled group of related commands. */
function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

/** A thin rule separating command groups. */
function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("-mx-1 h-px bg-border", className)}
      {...props}
    />
  )
}

/** A single runnable command row; `onSelect` fires on click or Enter. */
function CommandItem({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-muted data-[selected=true]:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

/** A right-aligned keyboard-hint label for a command row. */
function CommandShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

/**
 * A thin footer strip below the command list, for contextual hints such as the
 * available keyboard shortcuts. Rendered inside the {@link Command} root, below
 * {@link CommandList}; purely presentational.
 */
function CommandFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="command-footer"
      className={cn(
        "flex items-center gap-3 border-t px-3 py-2 text-xs text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
}
