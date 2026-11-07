import { Activity, Filter, Layers, Lock, RefreshCw, Shield } from "lucide-react"
import { Space_Grotesk } from "next/font/google"

import { PageContainer } from "@/components/page-container"

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"] })

const features = [
  {
    icon: <Layers className="size-5" />,
    title: "Type-safe GraphQL APIs",
    description:
      "Adapter-agnostic query generation with full TypeScript support. Get autocomplete and compile-time checks for your entire data layer.",
  },
  {
    icon: <RefreshCw className="size-5" />,
    title: "CLI-based schema generation",
    description:
      "Pull live catalog metadata from multiple sources and generate typed schemas that stay in sync as upstream tables evolve.",
  },
  {
    icon: <Filter className="size-5" />,
    title: "Filtering, sorting & pagination",
    description:
      "Built-in support for expressive filters, sorting, and pagination with engine-specific SQL dialect generation.",
  },
  {
    icon: <Shield className="size-5" />,
    title: "Adapter-agnostic permissions",
    description:
      "Define access rules per dataSource and table name. Enforce them consistently across every connected adapter.",
  },
  {
    icon: <Activity className="size-5" />,
    title: "OpenTelemetry tracing",
    description:
      "Optional per-DataSource tracing out of the box. Monitor query latency, errors, and throughput with your existing observability stack.",
  },
  {
    icon: <Lock className="size-5" />,
    title: "Flexible authentication",
    description:
      "OAuth2, Basic Auth, and Bearer token authentication with configurable impersonation strategies per DataSource.",
  },
]

export const FeaturesSection = () => (
  <section className="border-border bg-muted/40 border-b">
    <PageContainer className="py-24">
      <div className="mb-14 text-center">
        <h2
          className="text-foreground text-3xl font-semibold tracking-tight sm:text-4xl"
          style={{ fontFamily: spaceGrotesk.style.fontFamily }}
        >
          Powerful features
        </h2>
        <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-lg text-pretty">
          Everything you need to query, govern, and ship data products faster.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => (
          <div
            key={feature.title}
            className="border-border bg-card group rounded-2xl border p-6 transition-shadow hover:shadow-md"
          >
            <div className="bg-brand/10 text-brand mb-4 flex size-10 items-center justify-center rounded-lg">
              {feature.icon}
            </div>
            <h3 className="text-foreground font-semibold">{feature.title}</h3>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              {feature.description}
            </p>
          </div>
        ))}
      </div>
    </PageContainer>
  </section>
)
