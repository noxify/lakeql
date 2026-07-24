import "./globals.css"
import type { Metadata } from "next"
import { RootProvider } from "renoun"

import Analytics from "@/components/analytics"
import { SearchCommandProvider } from "@/components/search-command"
import { TailwindIndicator } from "@/components/tailwind-indicator"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const SITE_URL = "https://lakeql.dev"

function toJsonLd(value: unknown) {
  return JSON.stringify(value).replaceAll("</", "<\\/")
}

export const metadata: Metadata = {
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "LakeQL",
  },
  alternates: {
    types: {
      "application/x-ndjson": "/docs.snapshot.jsonl",
    },
  },
  description:
    "Build predictable, secure GraphQL APIs on top of Trino metadata with LakeQL’s type-safe runtime and schema generation CLI.",
  icons: {
    apple: [
      { sizes: "180x180", type: "image/png", url: "/apple-touch-icon.png" },
    ],
    icon: [
      { type: "image/svg+xml", url: "/icon.svg" },
      { sizes: "96x96", type: "image/png", url: "/icon.png" },
    ],
    shortcut: "/favicon.ico",
  },
  title: {
    default: "LakeQL",
    template: "%s | LakeQL",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    inLanguage: "en",
    name: "LakeQL",
    potentialAction: {
      "@type": "SearchAction",
      query: "required name=search_term_string",
      target: `${SITE_URL}/docs?search={search_term_string}`,
    },
    url: SITE_URL,
  }

  return (
    <RootProvider
      theme={{
        dark: ["github-dark", { colors: { "panel.border": "#24292e" } }],
        light: [
          "github-light",
          {
            colors: {
              "editor.background": "#f5f5f5",
              "panel.border": "#f5f5f5",
              "activityBar.background": "#f5f5f5",
            },
          },
        ],
      }}
      languages={[
        "ts",
        "tsx",
        "mdx",
        "bash",
        "sql",
        "graphql",
        "json",
        "dockerfile",
      ]}
      siteUrl={SITE_URL}
    >
      <html lang="en" suppressHydrationWarning className={cn("antialiased")}>
        <body>
          <script
            type="application/ld+json"
            // oxlint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: toJsonLd(websiteJsonLd) }}
          />
          <Analytics />
          <ThemeProvider
            attribute={["class", "data-theme"]}
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <TooltipProvider>
              <SearchCommandProvider>{children}</SearchCommandProvider>
            </TooltipProvider>
            <TailwindIndicator />
          </ThemeProvider>
        </body>
      </html>
    </RootProvider>
  )
}
