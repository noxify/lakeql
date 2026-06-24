import { ArrowRight } from "lucide-react"
import { Space_Grotesk } from "next/font/google"
import Link from "next/link"

import { GradientGridBackground } from "@/components/grid-background"
import { LakeqlLogo } from "@/components/lakeql-logo"
import { PageContainer } from "@/components/page-container"
import { buttonVariants } from "@/components/ui/button"

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"] })

export function HeroSection() {
  return (
    <section className="relative -mt-14 overflow-hidden">
      <GradientGridBackground
        className="relative w-full py-28"
        gridSize={48}
        gridColor="rgba(107,114,128,0.2)"
        transparentBackground
        fadeStartPercent={20}
        fadeMidPercent={84}
        midOpacity={0.35}
        edgeOpacity={0}
        fadeRadiusXPercent={100}
        fadeRadiusYPercent={80}
      >
        <PageContainer className="relative flex flex-col items-center gap-8 text-center">
          <span className="bg-muted text-muted-foreground rounded-full px-4 py-1.5 text-sm font-medium ring-1 ring-black/5 dark:ring-white/10">
            Streamlined Data Access Layer for Data Platforms
          </span>
          <div className="flex items-center gap-5">
            <div className="flex size-20 shrink-0 items-center justify-center rounded-3xl bg-white/95 shadow-[0_18px_40px_rgba(2,73,118,0.18)] ring-1 ring-black/5 backdrop-blur-sm dark:bg-slate-700/70 dark:shadow-[0_16px_34px_rgba(0,0,0,0.45)] dark:ring-white/10">
              <LakeqlLogo className="size-14" />
            </div>
            <h1
              className="text-foreground text-[72px] leading-none font-medium"
              style={{ fontFamily: spaceGrotesk.style.fontFamily }}
            >
              LakeQL
            </h1>
          </div>
          <p className="text-muted-foreground max-w-2xl text-xl leading-relaxed">
            Build predictable, secure GraphQL APIs on top of Trino metadata with
            LakeQL&apos;s type-safe runtime and schema generation CLI.
          </p>
          <div className="flex items-center gap-3">
            <Link
              href="/docs"
              prefetch={false}
              className={buttonVariants({ size: "lg" })}
            >
              Get started
              <ArrowRight className="size-4" />
            </Link>
            <a
              href="https://github.com/noxify/lakeql"
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ size: "lg", variant: "outline" })}
            >
              View on GitHub
            </a>
          </div>
        </PageContainer>
      </GradientGridBackground>
    </section>
  )
}
