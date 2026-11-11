import { MetadataForm } from "../metadata-form"
import { MutationConfigForm } from "../mutation-config-form"

/**
 * The General Settings view's main content: the metadata form and the mutation
 * config form, both reused unchanged (Req 2.1).
 */
export const SettingsContent = () => (
  <div className="flex flex-1 flex-col gap-4 p-4">
    <div className="grid max-w-2xl gap-6">
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
