import { SiGraphql, SiHono } from "@icons-pack/react-simple-icons"
import { Space_Grotesk } from "next/font/google"

import { PageContainer } from "@/components/page-container"
import { cn } from "@/lib/utils"

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"] })

const poweredBy = [
  {
    name: "GraphQL",
    url: "https://graphql.org",
    icon: <SiGraphql className="size-10 text-[#E10098]" />,
  },
  {
    name: "Zod",
    url: "https://zod.dev",
    logo: "/logos/zod.svg",
    invertDark: true,
  },
  {
    name: "GraphQL Yoga",
    url: "https://the-guild.dev/graphql/yoga-server",
    logo: "/logos/graphql-yoga.svg",
  },
  {
    name: "Pothos",
    url: "https://pothos-graphql.dev",
    logo: "/logos/pothos.svg",
  },
  {
    name: "Hono",
    url: "https://hono.dev",
    icon: <SiHono className="size-10" />,
  },
  {
    name: "Kysely",
    url: "https://kysely.dev",
    logo: "/logos/kysely.svg",
  },
]

export const PoweredBySection = () => (
  <section className="border-border border-b">
    <PageContainer className="max-w-4xl py-24">
      <div className="mb-14 text-center">
        <h2
          className="text-foreground text-3xl font-semibold tracking-tight sm:text-4xl"
          style={{ fontFamily: spaceGrotesk.style.fontFamily }}
        >
          Standing on the shoulders of giants
        </h2>
        <p className="text-muted-foreground mt-4 text-lg">
          Built with the best open source tools available.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {poweredBy.map((project) => (
          <a
            key={project.name}
            href={project.url}
            target="_blank"
            rel="noopener noreferrer"
            className="border-border bg-card hover:border-brand/30 group flex flex-col items-center justify-center gap-3 rounded-2xl border px-4 py-8 transition-all hover:shadow-md"
            title={project.name}
          >
            {project.icon ? (
              <div className="flex h-10 items-center justify-center opacity-60 grayscale transition-all group-hover:opacity-100 group-hover:grayscale-0">
                {project.icon}
              </div>
            ) : (
              // Using plain img to avoid next/image aspect-ratio warnings with SVGs
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={project.logo}
                alt={project.name}
                className={cn(
                  "h-10 w-auto opacity-60 grayscale transition-all group-hover:opacity-100 group-hover:grayscale-0",
                  "invertDark" in project && project.invertDark && "dark:invert"
                )}
              />
            )}
            <span className="text-muted-foreground group-hover:text-foreground text-sm font-medium transition-colors">
              {project.name}
            </span>
          </a>
        ))}
      </div>
    </PageContainer>
  </section>
)
