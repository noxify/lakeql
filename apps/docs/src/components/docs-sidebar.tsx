import { SiGithub as Github } from "@icons-pack/react-simple-icons"
import { Space_Grotesk } from "next/font/google"
import Link from "next/link"
import * as React from "react"

import {
  SidebarMenu,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarTrigger,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from "@/components/ui/sidebar"
import type { NavigationGroup } from "@/lib/navigation"
import { cn } from "@/lib/utils"

import { LakeqlLogo } from "./lakeql-logo"
import PlatformModifierKey from "./platform-modifier-key"
import { SearchCommand } from "./search-command"
import { SidebarItem } from "./sidebar-item"
import ThemeToggle from "./theme-toggle"
import { buttonVariants } from "./ui/button"
import { Item, ItemActions, ItemContent, ItemTitle } from "./ui/item"
import { Kbd } from "./ui/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip"

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"] })

export function DocsSidebar({
  className,
  collectionChooser,
  navigationItems,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  collectionChooser?: React.ReactNode
  navigationItems?: NavigationGroup[]
}) {
  return (
    <Sidebar
      variant="sidebar"
      className={cn(
        "group-data-[collapsible=offcanvas]:border-r-0!",
        className
      )}
      {...props}
    >
      <SidebarHeader className="p-4 group-data-[collapsible=offcanvas]:hidden">
        <div className="flex items-center justify-between">
          <Link href="/" prefetch={false} className="flex items-center gap-3">
            <LakeqlLogo className="size-10" />

            <div
              className="text-foreground leading-none font-bold"
              style={{ fontFamily: spaceGrotesk.style.fontFamily }}
            >
              LakeQL
            </div>
          </Link>
          <div>
            <Tooltip>
              <TooltipTrigger
                render={<SidebarTrigger className="cursor-pointer" />}
              />
              <TooltipContent>
                Toggle sidebar{" "}
                <Kbd>
                  <PlatformModifierKey />B
                </Kbd>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <SearchCommand>
          <Item
            size="xs"
            variant="outline"
            className="bg-background cursor-pointer"
            render={<button type="button" />}
          >
            <ItemContent className="gap-0">
              <ItemTitle>Search...</ItemTitle>
            </ItemContent>
            <ItemActions>
              <Kbd>
                <PlatformModifierKey />K
              </Kbd>
            </ItemActions>
          </Item>
        </SearchCommand>

        {collectionChooser}
      </SidebarHeader>

      <SidebarContent className="gap-0 p-4 group-data-[collapsible=offcanvas]:hidden">
        {(navigationItems ?? []).map((group, groupIdx) => (
          <SidebarGroup key={group.label + groupIdx} className="px-0">
            {group.label && (
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarItem key={item.url} item={item} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="group-data-[collapsible=offcanvas]:hidden">
        <div className="flex items-center justify-end">
          <div>
            <a
              href="https://github.com/noxify/lakeql"
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ size: "icon", variant: "ghost" })}
            >
              <Github className="size-4" />
            </a>
          </div>
          <div>
            <ThemeToggle />
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
