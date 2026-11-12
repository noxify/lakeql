import { useTheme } from "better-themes"
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { useSyncExternalStore } from "react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

/**
 * The ordered theme cycle the toggle steps through on each activation:
 * `light` → `dark` → `system` → `light`.
 */
const THEME_CYCLE = ["light", "dark", "system"] as const

/** A theme value the toggle understands. */
type CycleTheme = (typeof THEME_CYCLE)[number]

/** Human-readable label for each theme, used in the tooltip and a11y name. */
const THEME_LABEL: Record<CycleTheme, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
}

/**
 * Resolves the next theme in the {@link THEME_CYCLE} after `current`. An
 * unknown or absent current theme (the provider's no-op default before mount)
 * falls back to the start of the cycle.
 */
function nextTheme(current: string | undefined): CycleTheme {
  const index = THEME_CYCLE.indexOf(current as CycleTheme)
  return THEME_CYCLE[(index + 1) % THEME_CYCLE.length] ?? "light"
}

// `useSyncExternalStore` returns `false` on the server/first paint and `true`
// after hydration, so the toggle renders a stable placeholder until it is safe
// to read the actual (client-only) theme — mirroring the docs app's toggle.
const emptySubscribe = (_onStoreChange: () => void) => () => {
  /* no external store to unsubscribe from */
}

/**
 * A theme toggle for the studio global header, built on `better-themes`'
 * {@link useTheme}. Activating it cycles the applied theme light → dark →
 * system; `better-themes` writes the choice to `localStorage` and the matching
 * `.dark` class to the document root supplied by the host app's `ThemeProvider`
 * (the studio stays theme-agnostic and owns no provider).
 *
 * The icon reflects the current theme (sun for light, moon for dark, monitor
 * for system). It carries the stable accessible name `"Toggle theme"` so shell
 * tests and rail/header queries can target it unambiguously.
 *
 * @returns The rendered theme-toggle button.
 */
export const ThemeToggle = () => {
  const { theme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  )

  const current: CycleTheme = THEME_CYCLE.includes(theme as CycleTheme)
    ? (theme as CycleTheme)
    : "system"
  const Icon =
    current === "light" ? SunIcon : current === "dark" ? MoonIcon : MonitorIcon
  const label = `Toggle theme (${
    mounted ? THEME_LABEL[current] : THEME_LABEL.system
  })`

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Toggle theme"
            onClick={() => setTheme(nextTheme(theme))}
          >
            {mounted ? <Icon /> : <MonitorIcon />}
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
