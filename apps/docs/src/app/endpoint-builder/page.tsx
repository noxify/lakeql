import { ClientOnly } from "@/components/client-only"
import { EndpointBuilder } from "@/components/endpoint-builder/endpoint-builder"
import { SiteHeader } from "@/components/site-header"

export default function EndpointBuilderPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        {/* Hero / Intro */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">
            Endpoint Builder
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Visually define your custom endpoint schema — including nested
            objects and arrays — then export the JSON definition for CLI
            generation.
          </p>
          <ol className="text-muted-foreground mt-3 list-inside list-decimal space-y-1 text-sm">
            <li>Define your schema below</li>
            <li>Download the JSON definition</li>
            <li>
              Run{" "}
              <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
                lakeql-cli create-endpoint --from-file ./your-endpoint.json
              </code>
            </li>
          </ol>
          <p className="text-muted-foreground mt-4 flex items-start gap-2 rounded-md border px-4 py-3 text-xs">
            <span className="mt-px shrink-0">🔒</span>
            <span>
              Your data stays in your browser. Definitions are saved to
              localStorage only and are never sent to any server.
            </span>
          </p>
        </div>

        {/* Builder */}
        <ClientOnly>
          <EndpointBuilder />
        </ClientOnly>
      </main>
    </div>
  )
}
