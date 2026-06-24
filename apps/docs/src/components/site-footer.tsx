import { Space_Grotesk } from "next/font/google"
import Link from "next/link"

import { LakeqlLogo } from "@/components/lakeql-logo"
import { PageContainer } from "@/components/page-container"

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"] })

export function SiteFooter() {
  return (
    <footer className="border-t">
      <PageContainer>
        <div className="flex flex-col gap-8 py-12 md:flex-row md:items-start md:justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/95 shadow-sm ring-1 ring-black/5 dark:bg-slate-700/70 dark:ring-white/10">
                <LakeqlLogo className="size-5" />
              </div>
              <span
                className="text-lg font-bold"
                style={{ fontFamily: spaceGrotesk.style.fontFamily }}
              >
                LakeQL
              </span>
            </div>
            <p className="text-muted-foreground max-w-md text-sm">
              A type-safe GraphQL access layer for Trino-powered data platforms.
              Built for developers who need predictable, secure data APIs.
            </p>
          </div>

          <nav className="flex gap-8 text-sm">
            <div className="flex flex-col gap-3">
              <span className="font-semibold">Navigation</span>
              <Link
                href="/"
                prefetch={false}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Home
              </Link>
              <Link
                href="/docs"
                prefetch={false}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Docs
              </Link>
            </div>
            <div className="flex flex-col gap-3">
              <span className="font-semibold">Project</span>
              <a
                href="https://github.com/noxify/lakeql"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                GitHub
              </a>
              <a
                href="https://github.com/noxify/lakeql/blob/main/LICENSE"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                License
              </a>
            </div>
          </nav>
        </div>

        <div className="border-t py-6 text-center text-sm">
          <p className="text-muted-foreground">
            © {new Date().getFullYear()} LakeQL. Released under the Apache 2.0
            License.
          </p>
          <p className="text-muted-foreground mt-1">
            Powered by{" "}
            <a
              href="https://nextjs.org"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground font-semibold transition-colors"
            >
              Next.js
            </a>{" "}
            and{" "}
            <a
              href="https://renoun.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground font-semibold transition-colors"
            >
              Renoun
            </a>
          </p>
          <p className="text-muted-foreground/60 mt-3 text-xs">
            Trino is a trademark of the Trino Software Foundation. All other
            trademarks are the property of their respective owners.
          </p>
        </div>
      </PageContainer>
    </footer>
  )
}
