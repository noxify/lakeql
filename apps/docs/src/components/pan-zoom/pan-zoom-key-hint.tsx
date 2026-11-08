"use client"

import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { cn } from "@/lib/utils"

/**
 * Keyboard-shortcut hint overlay for the pan/zoom viewport.
 *
 * The library enables keyboard navigation (arrows pan, `+`/`-` zoom, `0`
 * resets) but ships no visible affordance, so this overlay surfaces the
 * shortcuts as `<kbd>` chips and tells the user whether the diagram currently
 * holds keyboard focus. It sits bottom-left — clear of the bottom-right
 * {@link PanZoomControls} cluster so the two never collide — and is
 * `pointer-events-none` so it never blocks interaction with the viewport.
 *
 * It stays faint when the viewport is idle and becomes fully visible on focus
 * or hover, keeping it unobtrusive docs chrome rather than a demo panel.
 *
 * @param props.focused - Whether keyboard focus is currently inside the
 *   viewport. Drives the leading label and the overlay's prominence.
 */
export const PanZoomKeyHint = ({ focused }: { focused: boolean }) => (
  <div
    aria-hidden="true"
    className={cn(
      "bg-background/95 pointer-events-none absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-md border p-1.5 pr-2 text-xs shadow-sm backdrop-blur-sm transition-opacity",
      focused
        ? "opacity-100"
        : "opacity-40 group-hover:opacity-100 group-focus-within:opacity-100"
    )}
  >
    <span className="text-muted-foreground pl-0.5 font-medium">
      {focused ? "Keyboard active" : "Click to focus"}
    </span>

    <div className="bg-border h-4 w-px" />

    <div className="flex items-center gap-2">
      <KbdGroup title="Pan">
        <Kbd>←</Kbd>
        <Kbd>↑</Kbd>
        <Kbd>→</Kbd>
        <Kbd>↓</Kbd>
      </KbdGroup>

      <KbdGroup title="Zoom">
        <Kbd>+</Kbd>
        <span className="text-muted-foreground">/</span>
        <Kbd>−</Kbd>
      </KbdGroup>

      <KbdGroup title="Reset">
        <Kbd>0</Kbd>
      </KbdGroup>
    </div>
  </div>
)
