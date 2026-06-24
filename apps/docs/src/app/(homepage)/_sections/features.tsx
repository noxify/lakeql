import { Space_Grotesk } from "next/font/google"

import { PageContainer } from "@/components/page-container"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"] })

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

export function FeaturesSection() {
  return (
    <section className="py-24">
      <PageContainer>
        <div className="mb-12 text-center">
          <h2
            className="text-3xl font-semibold tracking-tight"
            style={{ fontFamily: spaceGrotesk.style.fontFamily }}
          >
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
  )
}
