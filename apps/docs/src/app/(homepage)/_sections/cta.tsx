import { ArrowRight } from "lucide-react"
import Link from "next/link"

import { GradientGridBackground } from "@/components/grid-background"
import { PageContainer } from "@/components/page-container"
import { buttonVariants } from "@/components/ui/button"

export function CtaSection() {
  return (
    <section className="">
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
        <PageContainer className="py-24 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">
            Ready to dive deeper?
          </h2>
          <p className="text-muted-foreground mt-4 text-lg">
            Explore the full documentation to learn about schema generation and
            more.
          </p>
          <Link
            href="/docs"
            prefetch={false}
            className={`${buttonVariants({ size: "lg" })} mt-8`}
          >
            Read the docs
            <ArrowRight className="size-4" />
          </Link>
        </PageContainer>
      </GradientGridBackground>
    </section>
  )
}
