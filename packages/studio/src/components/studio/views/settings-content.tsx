import { MetadataForm } from "../metadata-form"
import { MutationConfigForm } from "../mutation-config-form"

/**
 * The General Settings view's main content: the metadata form and the mutation
 * config form, both reused unchanged (Req 2.1).
 */
export const SettingsContent = () => (
  <div className="flex flex-1 flex-col gap-4 px-4 py-10">
    <div className="mx-auto w-full max-w-3xl">
      <section className="grid gap-3">
        <h2 className="text-sm font-medium">Metadata</h2>
        <MetadataForm />
      </section>
      <section className="grid gap-3">
        <h2 className="text-sm font-medium">Mutation</h2>
        <MutationConfigForm />
      </section>
    </div>
  </div>
)
