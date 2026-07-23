import { Space_Grotesk } from "next/font/google"
import Image from "next/image"

import { PageContainer } from "@/components/page-container"

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"] })

const poweredBy = [
  {
    name: "GraphQL",
    url: "https://graphql.org",
    logo: "https://graphql.org/img/logo.svg",
    size: "large",
  },
  {
    name: "Trino",
    url: "https://trino.io",
    logo: "https://raw.githubusercontent.com/trinodb/presentations/main/assets/logos/trino-logo.png",
    logoDark:
      "https://raw.githubusercontent.com/trinodb/presentations/main/assets/logos/trino-logo-dk-bg.svg",
    size: "large",
  },
  {
    name: "GraphQL Yoga",
    url: "https://the-guild.dev/graphql/yoga-server",
    logo: "https://raw.githubusercontent.com/graphql-hive/graphql-yoga/main/website/public/assets/logo.svg",
    size: "medium",
  },
  {
    name: "Pothos",
    url: "https://pothos-graphql.dev",
    logo: "https://pothos-graphql.dev/assets/logo-name-auto.svg",
    size: "medium",
  },
  {
    name: "Hono",
    url: "https://hono.dev",
    logo: "https://raw.githubusercontent.com/honojs/website/main/public/images/logo.svg",
    size: "medium",
  },
  {
    name: "Kysely",
    url: "https://kysely.dev",
    logo: "https://kysely.dev/img/logo.svg",
    size: "medium",
  },
]

export function PoweredBySection() {
  return (
    <section className="">
      <PageContainer>
        <div className="mb-12 text-center">
          <h2
            className="text-3xl font-semibold tracking-tight"
            style={{ fontFamily: spaceGrotesk.style.fontFamily }}
          >
            Standing on the shoulders of giants
          </h2>
          <p className="text-muted-foreground mt-3 text-lg">
            Built with the power of open source.
          </p>
        </div>
        <div className="mx-auto grid max-w-3xl grid-cols-4 grid-rows-2 gap-4">
          {poweredBy.map((project) => (
            <a
              key={project.name}
              href={project.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`border-border bg-card hover:bg-muted group flex flex-col items-center justify-center gap-3 rounded-xl border p-6 transition-all hover:shadow-md ${
                project.size === "large"
                  ? "col-span-2 row-span-2"
                  : project.size === "medium"
                    ? "col-span-2"
                    : "col-span-1"
              }`}
              title={project.name}
            >
              {project.logoDark ? (
                <>
                  <Image
                    src={project.logo}
                    width="100"
                    height={100}
                    alt={project.name}
                    className={`w-auto opacity-60 grayscale transition-all group-hover:opacity-100 group-hover:grayscale-0 dark:hidden ${
                      project.size === "large" ? "h-16" : "h-12"
                    }`}
                  />
                  <Image
                    src={project.logoDark}
                    width="100"
                    height={100}
                    alt={project.name}
                    className={`hidden w-auto opacity-60 grayscale transition-all group-hover:opacity-100 group-hover:grayscale-0 dark:block ${
                      project.size === "large" ? "h-16" : "h-12"
                    }`}
                  />
                </>
              ) : (
                <Image
                  src={project.logo}
                  width="100"
                  height={100}
                  alt={project.name}
                  className={`w-auto opacity-60 grayscale transition-all group-hover:opacity-100 group-hover:grayscale-0 ${
                    project.size === "large" ? "h-16" : "h-12"
                  }`}
                />
              )}
              <span className="text-muted-foreground group-hover:text-foreground text-sm font-medium transition-colors">
                {project.name}
              </span>
            </a>
          ))}
        </div>
        <p className="text-muted-foreground/60 mt-8 text-center text-sm">
          …and many more amazing open source projects that make LakeQL possible.{" "}
          <a
            href="https://github.com/noxify/lakeql/network/dependencies?q=relationship%3Adirect+"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground underline transition-colors"
          >
            View all direct dependencies
          </a>
        </p>
      </PageContainer>
    </section>
  )
}
