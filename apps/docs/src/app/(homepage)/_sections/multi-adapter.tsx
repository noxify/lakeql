import { ArrowRight } from "lucide-react"
import { Space_Grotesk } from "next/font/google"
import Link from "next/link"

import {
  ClickHouseLogo,
  DuckDBLogo,
  MicrosoftFabricLogo,
  TrinoLogo,
} from "@/components/adapter-logos"
import { PageContainer } from "@/components/page-container"

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"] })

const adapters = [
  {
    name: "Trino",
    icon: <TrinoLogo className="size-8" />,
    description:
      "Query federated data across Trino clusters, with pushdown for joins, aggregations, and filters.",
    href: "/docs/datasources/setup/adapters/trino",
    accent: "from-pink-500/10 to-transparent",
    comingSoon: false,
  },
  {
    name: "Microsoft Fabric",
    icon: <MicrosoftFabricLogo className="size-8" />,
    description:
      "Connect directly to Fabric warehouses and lakehouses using OneLake shortcuts and managed identity.",
    href: "/docs/datasources/setup/adapters/fabric",
    accent: "from-emerald-500/10 to-transparent",
    comingSoon: false,
  },
  {
    name: "ClickHouse",
    icon: <ClickHouseLogo className="size-8" />,
    description:
      "Run sub-second analytical queries against ClickHouse clusters with native protocol batching.",
    href: "/docs/data-sources/clickhouse",
    accent: "from-amber-500/10 to-transparent",
    comingSoon: true,
  },
  {
    name: "DuckDB",
    icon: <DuckDBLogo className="size-8" />,
    description:
      "Query local or in-memory DuckDB files and Parquet datasets directly from your app or CLI.",
    href: "/docs/data-sources/duckdb",
    accent: "from-yellow-500/10 to-transparent",
    comingSoon: true,
  },
]

export const MultiAdapterSection = () => (
  <section className="border-border border-b">
    <PageContainer className="py-24">
      <div className="mb-14 text-center">
        <h2
          className="text-foreground text-3xl font-semibold tracking-tight sm:text-4xl"
          style={{ fontFamily: spaceGrotesk.style.fontFamily }}
        >
          Multi-Adapter Support
        </h2>
        <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-lg text-pretty">
          One interface, many platforms. Connect LakeQL to the data engines your
          team already runs on.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {adapters.map((adapter) =>
          adapter.comingSoon ? (
            <div
              key={adapter.name}
              className="border-border bg-card group relative flex flex-col overflow-hidden rounded-2xl border p-6 opacity-75"
            >
              {/* Colored gradient at top */}
              <div
                className={`pointer-events-none absolute inset-x-0 top-0 h-24 bg-linear-to-b ${adapter.accent}`}
                aria-hidden="true"
              />

              <div className="relative flex flex-1 flex-col">
                <div className="border-border bg-background mb-5 flex size-14 items-center justify-center rounded-xl border shadow-sm">
                  {adapter.icon}
                </div>
                <h3 className="text-foreground text-base font-semibold">
                  {adapter.name}
                </h3>
                <p className="text-muted-foreground mt-2 flex-1 text-sm leading-relaxed">
                  {adapter.description}
                </p>
                <div className="mt-5">
                  <span className="text-muted-foreground/70 bg-muted inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium">
                    Coming soon
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <Link
              key={adapter.name}
              href={adapter.href}
              prefetch={false}
              className="border-border bg-card group relative flex flex-col overflow-hidden rounded-2xl border p-6 transition-shadow hover:shadow-lg"
            >
              {/* Colored gradient at top */}
              <div
                className={`pointer-events-none absolute inset-x-0 top-0 h-24 bg-linear-to-b ${adapter.accent}`}
                aria-hidden="true"
              />

              <div className="relative flex flex-1 flex-col">
                <div className="border-border bg-background mb-5 flex size-14 items-center justify-center rounded-xl border shadow-sm">
                  {adapter.icon}
                </div>
                <h3 className="text-foreground text-base font-semibold">
                  {adapter.name}
                </h3>
                <p className="text-muted-foreground mt-2 flex-1 text-sm leading-relaxed">
                  {adapter.description}
                </p>
                <div className="text-foreground hover:text-brand mt-5 inline-flex items-center gap-1 text-sm font-medium">
                  Learn more
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </div>
            </Link>
          )
        )}
      </div>
    </PageContainer>
  </section>
)
