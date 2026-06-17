"use client"

import { FileJson, Layers, Shield, Zap } from "lucide-react"

export function InfoTab() {
  return (
    <div className="flex flex-col gap-8 p-6">
      {/* Hero */}
      <section>
        <h2 className="text-foreground text-lg font-semibold">
          Welcome to the Endpoint Builder
        </h2>
        <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
          Define custom endpoint schemas visually — including nested objects,
          arrays, and mutation pipelines — then export the JSON definition for
          CLI generation. Your data stays in your browser and is never sent to
          any server.
        </p>
      </section>

      {/* Workflow steps */}
      <section>
        <h3 className="text-foreground mb-3 text-sm font-semibold">
          How it works
        </h3>
        <ol className="border-border divide-border divide-y rounded-lg border">
          <li className="flex items-start gap-3 p-4">
            <span className="bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold">
              1
            </span>
            <div>
              <p className="text-foreground text-sm font-medium">
                Configure General Settings
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Set your table name, catalog, and schema in the{" "}
                <strong>General</strong> tab. You can also import an existing
                endpoint definition.
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3 p-4">
            <span className="bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold">
              2
            </span>
            <div>
              <p className="text-foreground text-sm font-medium">
                Define Your Fields
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Add fields with types (String, Integer, Object, Array, etc.),
                configure validations, and nest objects up to 5 levels deep in
                the <strong>Fields</strong> tab.
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3 p-4">
            <span className="bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold">
              3
            </span>
            <div>
              <p className="text-foreground text-sm font-medium">
                Configure Mutations (optional)
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Enable write operations with load strategy, storage config, and
                partitioning in the <strong>Mutations</strong> tab.
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3 p-4">
            <span className="bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold">
              4
            </span>
            <div>
              <p className="text-foreground text-sm font-medium">
                Export &amp; Generate
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Preview and download the JSON in the <strong>Preview</strong>{" "}
                tab, then run{" "}
                <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
                  lakeql-cli create-endpoint --from-file ./your-endpoint.json
                </code>
              </p>
            </div>
          </li>
        </ol>
      </section>

      {/* Feature highlights */}
      <section>
        <h3 className="text-foreground mb-3 text-sm font-semibold">Features</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FeatureCard
            icon={<Layers className="size-4" />}
            title="Nested Schemas"
            description="Object and Array fields with up to 5 levels of nesting, drag-and-drop reordering."
          />
          <FeatureCard
            icon={<Shield className="size-4" />}
            title="Field Validations"
            description="Email, URL, UUID, min/max, and regex validations — generated as Zod schemas."
          />
          <FeatureCard
            icon={<Zap className="size-4" />}
            title="Mutation Pipeline"
            description="Full load, append, and full_load_append strategies with configurable partitioning."
          />
          <FeatureCard
            icon={<FileJson className="size-4" />}
            title="Import & Export"
            description="Import existing definitions, auto-save to localStorage, copy or download JSON."
          />
        </div>
      </section>

      {/* Supported field types */}
      <section>
        <h3 className="text-foreground mb-3 text-sm font-semibold">
          Supported Field Types
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            {
              type: "String",
              color:
                "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
            },
            {
              type: "Integer",
              color:
                "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
            },
            {
              type: "Float",
              color:
                "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
            },
            {
              type: "Boolean",
              color:
                "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
            },
            {
              type: "Date",
              color:
                "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
            },
            {
              type: "DateTime",
              color:
                "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
            },
            {
              type: "Object",
              color:
                "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
            },
            {
              type: "Array",
              color:
                "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
            },
          ].map(({ type, color }) => (
            <span
              key={type}
              className={`rounded-md px-3 py-1.5 text-center text-xs font-medium ${color}`}
            >
              {type}
            </span>
          ))}
        </div>
      </section>

      {/* Quick start CTA */}
      <section className="border-border rounded-lg border bg-linear-to-r from-transparent to-transparent p-4">
        <p className="text-muted-foreground text-sm">
          Ready to start? Head to the{" "}
          <strong className="text-foreground">General</strong> tab to configure
          your endpoint metadata, or import an existing definition.
        </p>
      </section>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="border-border flex gap-3 rounded-lg border p-3">
      <div className="text-muted-foreground mt-0.5 shrink-0">{icon}</div>
      <div>
        <p className="text-foreground text-sm font-medium">{title}</p>
        <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  )
}
