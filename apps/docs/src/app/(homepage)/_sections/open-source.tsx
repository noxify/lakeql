import { Space_Grotesk } from "next/font/google"

import { GradientGridBackground } from "@/components/grid-background"
import { PageContainer } from "@/components/page-container"

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"] })

export function OpenSourceSection() {
  return (
    <section className="py-24">
      <GradientGridBackground
        className="relative w-full py-28"
        gridSize={48}
        gridColor="rgba(107,114,128,0.20)"
        transparentBackground
        fadeStartPercent={20}
        fadeMidPercent={86}
        midOpacity={0.44}
        edgeOpacity={0}
        fadeRadiusXPercent={100}
        fadeRadiusYPercent={80}
      >
        <PageContainer className="text-center">
          <h2
            className="text-3xl font-semibold tracking-tight"
            style={{ fontFamily: spaceGrotesk.style.fontFamily }}
          >
            Free &amp; open source
          </h2>
          <p className="text-muted-foreground mx-auto mt-4 max-w-2xl text-lg">
            LakeQL is completely free and open source. Built by developers, for
            developers. No hidden costs, no vendor lock-in, no limitations. Use
            it in your personal projects, startups, or enterprise applications.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm font-medium">
            <span className="text-muted-foreground">Apache 2.0 License</span>
            <span className="text-muted-foreground">&middot;</span>
            <span className="text-muted-foreground">Community Driven</span>
            <span className="text-muted-foreground">&middot;</span>
            <span className="text-muted-foreground">No Vendor Lock-in</span>
          </div>
        </PageContainer>
      </GradientGridBackground>
    </section>
  )
}
