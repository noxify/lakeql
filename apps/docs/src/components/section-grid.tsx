import Link from "next/link"
import type { z } from "zod"

import type { getSections } from "@/collection-helpers"
import { getFileContent, isExternal, isHidden } from "@/collection-helpers"
import { GradientGridBackground } from "@/components/grid-background"
import type { frontmatterSchema } from "@/validations"

export default async function SectionGrid({
  sections,
}: {
  sections: Awaited<ReturnType<typeof getSections>>
}) {
  if (sections.length === 0) {
    return <></>
  }

  const elements: {
    title: string
    description: string
    path: string
  }[] = []

  for (const section of sections) {
    if (isHidden(section) || isExternal(section)) {
      continue
    }

    let frontmatter: z.infer<typeof frontmatterSchema> | undefined
    try {
      const file = await getFileContent(section)
      frontmatter = await file?.getExportValue("frontmatter")
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch {
      continue
    }

    if (frontmatter) {
      elements.push({
        description: frontmatter.description ?? "",
        path: `/docs${section.getPathname({ includeBasePathname: true })}`,
        title: section.title,
      })
    } else {
      elements.push({
        description: "",
        path: `/docs${section.getPathname({ includeBasePathname: true })}`,
        title: section.title,
      })
    }
  }

  return (
    <div className="mt-12 grid auto-rows-fr gap-4 md:grid-cols-2 2xl:grid-cols-2">
      {elements.map((ele, index) => (
        <Link
          href={ele.path}
          prefetch={false}
          key={index}
          className="not-prose group block h-full"
        >
          <div className="hover:border-brand/50 hover:dark:border-brand/70 relative h-full overflow-hidden rounded-2xl border border-black/10 shadow transition-transform duration-200 dark:border-white/10">
            <div className="bg-sidebar pointer-events-none absolute inset-0" />

            <GradientGridBackground
              className="relative h-full px-4 py-8"
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
              <div className="justify-top relative flex h-full flex-col items-start text-left align-top">
                <h2 className="text-foreground/70 group-hover:text-foreground relative z-50 mt-0 mb-1 text-xl font-bold">
                  {ele.title}
                </h2>

                <p className="text-muted-foreground relative z-50 text-base font-normal">
                  {ele.description}
                </p>
              </div>
            </GradientGridBackground>
          </div>
        </Link>
      ))}
    </div>
  )
}
