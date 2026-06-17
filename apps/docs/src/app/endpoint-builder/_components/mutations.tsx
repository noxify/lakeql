"use client"

import { MutationForm } from "@/components/endpoint-builder/mutation-form"

import { useEndpointBuilder } from "./endpoint-builder-context"

export function MutationsTab() {
  const { def, handleMutationChange } = useEndpointBuilder()

  return (
    <div className="flex flex-col gap-6 p-6">
      <section>
        <h2 className="text-foreground mb-3 text-sm font-semibold">
          Mutation Pipeline
        </h2>
        <MutationForm
          mutation={def.mutation}
          onChange={handleMutationChange}
          fields={def.fields}
        />
      </section>
    </div>
  )
}
