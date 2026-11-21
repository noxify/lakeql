import { MOBILE_BREAKPOINT } from "@/hooks/use-mobile"

import { LakeqlLogo } from "../lakeql-logo"

/**
 * The notice shown instead of the editor on viewports narrower than the
 * desktop breakpoint, while the desktop-only gate is enabled.
 *
 * It is a standalone `main` landmark with a single heading so assistive
 * technology announces it as the page content.
 */
export const DesktopOnlyNotice = () => (
  <main className="bg-background text-foreground flex min-h-svh w-full items-center justify-center p-6">
    <div className="grid max-w-sm gap-3 text-center">
      <LakeqlLogo className="mx-auto h-8 w-auto" />
      <h1 className="text-lg font-semibold">Desktop only</h1>
      <p className="text-muted-foreground text-sm">
        The Endpoint Builder is designed for larger screens. Open it in a
        desktop or laptop browser, with a window at least {MOBILE_BREAKPOINT}px
        wide.
      </p>
      <p className="text-muted-foreground text-xs">
        Your saved draft is not affected.
      </p>
    </div>
  </main>
)
