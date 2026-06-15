"use client"

import { SiGithub as Github } from "@icons-pack/react-simple-icons"
import { Search } from "lucide-react"
import { Space_Grotesk } from "next/font/google"
import Link from "next/link"

import { LakeqlLogo } from "@/components/lakeql-logo"
import { Button, buttonVariants } from "@/components/ui/button"
import { useScrollVisibility } from "@/hooks/use-scroll-visibility"
import { cn } from "@/lib/utils"

import { SearchCommand } from "./search-command"
import ThemeToggle from "./theme-toggle"

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"] })

export function SiteHeader({ fullWidth = false }: { fullWidth?: boolean }) {
  const { hasScrolled: isScrolled } = useScrollVisibility({
    hideAfterScrollY: 0,
  })

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-all duration-200",
        isScrolled
          ? "border-border/60 bg-background/80 border-b backdrop-blur-sm"
          : "border-transparent bg-transparent"
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center px-6",
          fullWidth ? "w-full" : "mx-auto max-w-6xl"
        )}
      >
        {/* Left: logo + nav */}
        <div className="flex items-center gap-6">
          <Link href="/" prefetch={false} className="flex items-center gap-2.5">
            <LakeqlLogo className="size-6" />
            <span
              className="text-sm font-semibold"
              style={{ fontFamily: spaceGrotesk.style.fontFamily }}
            >
              LakeQL
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              href="/"
              prefetch={false}
              className="text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-sm transition-colors"
            >
              Home
            </Link>
            <Link
              href="/docs"
              prefetch={false}
              className="text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-sm transition-colors"
            >
              Docs
            </Link>

            <Link
              href="/endpoint-builder"
              prefetch={false}
              className="text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-sm transition-colors"
            >
              Endpoint Builder
            </Link>
          </nav>
        </div>

        {/* Right: search + github + theme */}
        <div className="ml-auto flex items-center gap-1">
          <SearchCommand>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground size-8"
            >
              <Search className="size-4" />
            </Button>
          </SearchCommand>

          <a
            href="https://github.com/noxify/lakeql"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className={cn(
              buttonVariants({ size: "icon", variant: "ghost" }),
              "text-muted-foreground size-8"
            )}
          >
            <Github className="size-4" />
          </a>

          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
