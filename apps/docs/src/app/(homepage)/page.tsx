import dedent from "dedent"
import { ArrowRight } from "lucide-react"
import { Space_Grotesk } from "next/font/google"
import Link from "next/link"
import type { CommandProps } from "renoun"
import { CodeBlock, MDX } from "renoun"

import { GradientGridBackground } from "@/components/grid-background"
import { LakeqlLogo } from "@/components/lakeql-logo"
import { CommandWrapper } from "@/components/mdx/command"
import { PageContainer } from "@/components/page-container"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"] })

interface StepProps {
  title: string
  description: string
  code: string
  command?: CommandProps["variant"]
}

const steps: StepProps[] = [
  {
    code: "@lakeql/create-app@latest my-project",
    command: "exec",
    description: "Run the following command to scaffold a new LakeQL project.",
    title: "Create your project",
  },
  {
    code: dedent(/*ts*/ `
      // lakeql.config.ts
      export default defineConfig({
        connection: { host: 'localhost', port: 8080 },
        catalogs: ['my_catalog'],
      })
    `),
    description:
      "Open `lakeql.config.ts` and set your Trino connection details, catalogs, and schemas.",
    title: "Configure your project",
  },
  {
    code: "cli pull",
    command: "run",
    description:
      "Run the pull command to introspect Trino metadata and generate your type-safe GraphQL schema.",
    title: "Pull your schemas",
  },
  {
    code: "dev",
    command: "run",
    description: "Launch the LakeQL server and open the GraphQL playground.",
    title: "Start the server",
  },
]

const features = [
  {
    title: "Intuitive CLI & API",
    description:
      "Get started in minutes with a modern CLI and a flexible API that fit naturally into existing backend and platform workflows.",
  },
  {
    title: "Flexible filtering",
    description:
      "Apply expressive filters to handle complex query conditions across fields, helping teams narrow large datasets with confidence.",
  },
  {
    title: "Open source & transparent",
    description:
      "Built as open source with a transparent architecture and reusable packages across API, CLI, and tooling for long-term maintainability.",
  },
  {
    title: "Support for complex data types",
    description:
      "Query and process nested and structured data types without flattening everything first, while keeping your schema predictable.",
  },
  {
    title: "GraphQL interface for flexible queries",
    description:
      "Expose a modern GraphQL interface so consumers can request exactly the data they need through clear, flexible query patterns.",
  },
  {
    title: "Automatic/dynamic GraphQL schema generation",
    description:
      "Generate GraphQL schemas from your data sources through the CLI to reduce manual boilerplate and keep your API aligned with metadata changes.",
  },
]

export default function Page() {
  return (
    <div className="relative min-h-svh">
      <SiteHeader />

      <div className="pointer-events-none absolute inset-x-0 top-0 h-152 bg-linear-to-br from-[#f5f7fa] via-[#d8dee8] to-[#c3cfe2] mask-[linear-gradient(to_bottom,rgba(0,0,0,1)_0%,rgba(0,0,0,1)_72%,rgba(0,0,0,0)_100%)] [-webkit-mask-image:linear-gradient(to_bottom,rgba(0,0,0,1)_0%,rgba(0,0,0,1)_72%,rgba(0,0,0,0)_100%)] dark:hidden" />
      <div className="pointer-events-none absolute inset-x-0 top-0 hidden h-152 bg-linear-to-br from-[#1f2937] via-[#111827] to-[#020617] mask-[linear-gradient(to_bottom,rgba(0,0,0,1)_0%,rgba(0,0,0,1)_72%,rgba(0,0,0,0)_100%)] [-webkit-mask-image:linear-gradient(to_bottom,rgba(0,0,0,1)_0%,rgba(0,0,0,1)_72%,rgba(0,0,0,0)_100%)] dark:block" />

      {/* Hero */}
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
              Build predictable, secure GraphQL APIs on top of Trino metadata
              with LakeQL&apos;s type-safe runtime and schema generation CLI.
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

      {/* Getting Started */}
      <section className="py-24">
        <PageContainer>
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-semibold tracking-tight">
              Getting started
            </h2>
            <p className="text-muted-foreground mt-3 text-lg">
              Up and running in four steps.
            </p>
          </div>

          <div className="mx-auto flex w-full max-w-xl min-w-0 flex-col gap-0">
            {steps.map((step, index) => (
              <div key={index} className="flex min-w-0 gap-6">
                {/* Step indicator + connector */}
                <div className="flex flex-col items-center">
                  <div className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
                    {index + 1}
                  </div>
                  {index < steps.length - 1 && (
                    <div className="bg-border mt-1 w-px grow" />
                  )}
                </div>

                {/* Content */}
                <div className="w-full min-w-0 pt-0.5 pb-10">
                  <h3 className="text-base font-semibold">{step.title}</h3>
                  <div className="text-muted-foreground mt-1 mb-2">
                    <MDX
                      components={{
                        // oxlint-disable-next-line react/no-unstable-nested-components
                        code: (props) => (
                          <code className="text-foreground" {...props} />
                        ),
                      }}
                    >
                      {step.description}
                    </MDX>
                  </div>

                  {step.command && (
                    <CommandWrapper variant={step.command}>
                      {step.code}
                    </CommandWrapper>
                  )}
                  {!step.command && (
                    <CodeBlock language="ts" shouldAnalyze={false}>
                      {step.code}
                    </CodeBlock>
                  )}
                </div>
              </div>
            ))}
          </div>
        </PageContainer>
      </section>

      {/* CTA */}
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
              Explore the full documentation to learn about schema generation
              and more.
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

      {/* Feature Grid */}
      <section className="py-24">
        <PageContainer>
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-semibold tracking-tight">
              Powerful features
            </h2>
            <p className="text-muted-foreground mt-3 text-lg">
              Everything you need to build predictable, type-safe data APIs with
              LakeQL.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, idx) => (
              <Card key={idx}>
                <CardHeader>
                  <CardTitle>{feature.title}</CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </PageContainer>
      </section>

      {/* Free & Open Source */}
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
              Free &amp; open source
            </h2>
            <p className="text-muted-foreground mx-auto mt-4 max-w-2xl text-lg">
              LakeQL is completely free and open source. Built by developers,
              for developers. No hidden costs, no vendor lock-in, no
              limitations. Use it in your personal projects, startups, or
              enterprise applications.
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

      <SiteFooter />
    </div>
  )
}
