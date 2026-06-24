import dedent from "dedent"
import type { CommandProps } from "renoun"
import { CodeBlock, MDX } from "renoun"

import { CommandWrapper } from "@/components/mdx/command"
import { PageContainer } from "@/components/page-container"

interface StepProps {
  title: string
  description: string
  code: string
  command?: CommandProps["variant"]
}

const steps: StepProps[] = [
  {
    code: "@lakeql/create-app@latest my-lakeql-project",
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

export function GettingStartedSection() {
  return (
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
  )
}
