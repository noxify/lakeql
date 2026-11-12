import { PanelRightIcon } from "lucide-react"
import type { ReactNode } from "react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useIsNarrow } from "@/hooks/use-narrow"

import { Palette } from "./canvas/palette"
import { useShellView } from "./shell-view"
import { ValidationsView } from "./validations-view"

/**
 * Describes the active view's contextual secondary panel: its accessible
 * label, the inline column's width class, and the panel content. Fields shows
 * the field-type palette, Validations the consolidated issue list; Settings and
 * JSON have no secondary panel (so `null`).
 */
interface SecondaryPanel {
  /** The accessible name for the panel region (and its mobile sheet title). */
  label: string
  /** The inline column's width utility class (desktop / tablet layout). */
  widthClass: string
  /** Whether the panel body needs the palette's `p-3` padding. */
  padded: boolean
  /** The panel's content. */
  content: ReactNode
}

/**
 * Resolves the {@link SecondaryPanel} for the active view, or `null` for views
 * (Settings, JSON) that have no contextual secondary navigation.
 */
const useSecondaryPanel = (): SecondaryPanel | null => {
  const { view } = useShellView()

  if (view === "fields") {
    return {
      label: "Field palette",
      widthClass: "w-64",
      padded: true,
      content: <Palette />,
    }
  }
  if (view === "validations") {
    return {
      label: "Validation issues",
      widthClass: "w-72",
      padded: false,
      content: <ValidationsView />,
    }
  }
  return null
}

/**
 * The contextual secondary sidebar, rendered as an inline column on viewports
 * wider than the phone breakpoint ({@link useIsNarrow}). At phone widths
 * (`≤560px`) it renders nothing inline — a fixed side column there would steal
 * horizontal space and clip the main content's field rows — and the panel is
 * reached on demand through the header's contextual-nav sheet
 * ({@link SecondaryNavSheet}) instead. Desktop and tablet (`>560px`) layout is
 * unchanged.
 */
export const SecondarySidebar = () => {
  const panel = useSecondaryPanel()
  const isNarrow = useIsNarrow()

  if (panel === null || isNarrow) {
    return null
  }

  return (
    <aside
      aria-label={panel.label}
      className={`border-border shrink-0 overflow-y-auto border-r ${panel.widthClass} ${panel.padded ? "p-3" : ""}`}
    >
      {panel.content}
    </aside>
  )
}

/**
 * The phone-width (`≤560px`) presentation of the contextual secondary
 * navigation: a header trigger (shown alongside the primary-nav trigger)
 * opening a right-side {@link Sheet} that holds the active view's secondary
 * panel. It mounts only when the viewport is narrow and the active view
 * actually has a secondary panel, so Settings and JSON show no trigger. This
 * keeps the main content full-width on phones while the secondary nav stays
 * reachable. Desktop and tablet (`>560px`) are unaffected (the inline
 * {@link SecondarySidebar} column renders there instead).
 */
export const SecondaryNavSheet = () => {
  const panel = useSecondaryPanel()
  const isNarrow = useIsNarrow()
  const [open, setOpen] = useState(false)

  if (panel === null || !isNarrow) {
    return null
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Open ${panel.label}`}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <PanelRightIcon />
      </Button>
      <SheetContent
        side="right"
        aria-label={panel.label}
        className="w-80 max-w-[90vw] gap-0 overflow-y-auto p-0"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>{panel.label}</SheetTitle>
          <SheetDescription>
            The contextual navigation for the current view.
          </SheetDescription>
        </SheetHeader>
        <div className={panel.padded ? "p-3" : ""}>{panel.content}</div>
      </SheetContent>
    </Sheet>
  )
}
