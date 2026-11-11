import {
  BracesIcon,
  CircleAlertIcon,
  LayersIcon,
  SettingsIcon,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

import { LakeqlLogo } from "../components/lakeql-logo"
import { summarizeDiagnostics } from "./diagnostics"
import type { ShellView } from "./shell-view"
import { useShellView } from "./shell-view"
import { useEditorContext } from "./use-editor"

/** A rail section descriptor: its view id, label, and icon. */
interface RailSection {
  view: ShellView
  label: string
  icon: typeof SettingsIcon
}

const RAIL_SECTIONS: RailSection[] = [
  { view: "settings", label: "General Settings", icon: SettingsIcon },
  { view: "fields", label: "Fields", icon: LayersIcon },
  { view: "validations", label: "Validations", icon: CircleAlertIcon },
  { view: "json", label: "JSON", icon: BracesIcon },
]

/**
 * The icon rail (primary sidebar, collapsible to icons): one entry per view.
 * Each is a labelled, keyboard-operable `SidebarMenuButton` reflecting the
 * active view with `isActive`. The Validations entry carries a live badge with
 * the count of issues blocking export, matching the gate. Accessibility comes
 * from the shadcn sidebar primitives (roles, focus, keyboard toggle).
 */
export const Rail = () => {
  const { view, setView } = useShellView()
  const { isMobile, setOpenMobile } = useSidebar()
  const editor = useEditorContext()
  const issueCount = summarizeDiagnostics(editor.validation).length

  // On mobile the rail is an off-canvas sheet; selecting a view should also
  // dismiss it so the chosen view's content (and its contextual secondary nav)
  // is visible. On desktop the rail stays put, so this is a no-op there.
  const selectView = (next: ShellView) => {
    setView(next)
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  // The rail's collapse behavior is viewport-aware (the `useIsMobile` 768px
  // breakpoint, surfaced here as the sidebar context's `isMobile`):
  //
  // - Mobile (≤767px): an off-canvas Sidebar so the shadcn Sheet path engages
  //   and the header's always-visible "Open navigation" trigger has a rail
  //   sheet to open. `collapsible="none"` would render a plain inline column at
  //   every viewport, leaving mobile with no reachable rail — the regression
  //   this restores.
  // - Desktop (≥768px): a slim, fixed icon-only column (`collapsible="none"`)
  //   with no expand/collapse chrome, no in-rail trigger, and no wordmark —
  //   just the logo and the view icons.
  return (
    <Sidebar
      collapsible={isMobile ? "offcanvas" : "none"}
      className={
        isMobile
          ? undefined
          : "w-[calc(var(--sidebar-width-icon)+1px)]! border-r"
      }
    >
      <SidebarHeader>
        <div className="flex items-center gap-2">
          <LakeqlLogo className="size-6 shrink-0 group-data-[collapsible=icon]:hidden" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {RAIL_SECTIONS.map((section) => {
                const Icon = section.icon
                const showBadge =
                  section.view === "validations" && issueCount > 0
                return (
                  <SidebarMenuItem key={section.view}>
                    <SidebarMenuButton
                      tooltip={section.label}
                      isActive={view === section.view}
                      aria-current={view === section.view ? "page" : undefined}
                      onClick={() => selectView(section.view)}
                    >
                      <Icon />
                      <span>{section.label}</span>
                    </SidebarMenuButton>
                    {showBadge && (
                      <SidebarMenuBadge className="text-destructive">
                        {issueCount}
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
