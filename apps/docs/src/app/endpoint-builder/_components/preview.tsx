"use client"

import { JSONPreview } from "@/components/endpoint-builder/json-preview"

import { useEndpointBuilder } from "./endpoint-builder-context"

export function PreviewTab() {
  const { output } = useEndpointBuilder()

  return (
    <div className="flex flex-col gap-6 p-6">
      <section>
        <div className="border-border overflow-hidden rounded-lg border">
          <JSONPreview output={output} showTopbar={false} />
        </div>
      </section>
    </div>
  )
}
