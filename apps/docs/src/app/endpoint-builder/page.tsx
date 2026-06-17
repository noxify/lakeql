import { ClientOnly } from "@/components/client-only"
import { SiteHeader } from "@/components/site-header"

import { BuilderTabs } from "./_components/builder-tabs"
import { EndpointBuilderProvider } from "./_components/endpoint-builder-context"

export default function EndpointBuilderPage() {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <SiteHeader fullWidth bordered />
      <ClientOnly>
        <EndpointBuilderProvider>
          <BuilderTabs />
        </EndpointBuilderProvider>
      </ClientOnly>
    </div>
  )
}
