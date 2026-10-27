import { ArrowRight } from "lucide-react"
import { Space_Grotesk } from "next/font/google"
import Link from "next/link"

import { PageContainer } from "@/components/page-container"
import { buttonVariants } from "@/components/ui/button"

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"] })

export const OpenSourceSection = () => (
  <section className="bg-muted/40">
    <PageContainer className="py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2
          className="text-foreground text-3xl font-semibold tracking-tight sm:text-4xl"
          style={{ fontFamily: spaceGrotesk.style.fontFamily }}
        >
          Free &amp; open source
        </h2>
        <p className="text-muted-foreground mt-4 text-lg text-pretty">
          LakeQL is Apache 2.0 licensed and built in the open. Read the source,
          file an issue, or ship a new adapter — every contribution makes data
          access better for everyone.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
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
            Star on GitHub
          </a>
        </div>

        <div className="text-muted-foreground mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm">
          <span>Apache 2.0 License</span>
          <span className="text-muted-foreground/50">&middot;</span>
          <span>Community Driven</span>
          <span className="text-muted-foreground/50">&middot;</span>
          <span>No Vendor Lock-in</span>
        </div>
      </div>
    </PageContainer>
  </section>
)
