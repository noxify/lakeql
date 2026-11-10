import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { FieldTree } from "./field-tree"
import { ImportExportBar } from "./import-export-bar"
import { MetadataForm } from "./metadata-form"
import { EditorProvider, useEditor } from "./use-editor"

/**
 * A clearly-marked placeholder for a slot whose content lands in a later phase.
 */
const PlaceholderSlot = ({
  title,
  task,
  children,
}: {
  title: string
  task: string
  children: string
}) => (
  <Card size="sm" className="border-dashed bg-transparent">
    <CardHeader>
      <CardTitle className="text-muted-foreground text-sm">{title}</CardTitle>
      <CardDescription className="text-xs">{task}</CardDescription>
    </CardHeader>
    <CardContent className="text-muted-foreground text-xs">
      {children}
    </CardContent>
  </Card>
)

/**
 * The left region: endpoint-level settings — the metadata form plus a marked
 * slot for the mutation config form (task 14).
 */
const LeftRegion = () => (
  <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
    <section className="grid gap-3">
      <h2 className="text-sm font-medium">Metadata</h2>
      <MetadataForm />
    </section>
    <PlaceholderSlot title="Mutation config" task="Arrives in task 14.">
      Enable/disable, load strategy, base path, and partitioning controls will
      live here.
    </PlaceholderSlot>
  </div>
)

/**
 * The center region: the recursive field tree.
 */
const CenterRegion = () => (
  <div className="h-full overflow-y-auto p-4">
    <FieldTree />
  </div>
)

/**
 * The right region: a tab set switching between the field properties panel
 * (task 13) and the live JSON view (task 15), both marked placeholders this
 * run.
 */
const RightRegion = () => (
  <div className="h-full overflow-y-auto p-4">
    <Tabs defaultValue="properties" className="h-full">
      <TabsList>
        <TabsTrigger value="properties">Properties</TabsTrigger>
        <TabsTrigger value="json">JSON</TabsTrigger>
      </TabsList>
      <TabsContent value="properties">
        <PlaceholderSlot title="Field properties" task="Arrives in task 13.">
          Options and validations for the selected field will render here. A
          field is selectable now; the panel that targets it is next.
        </PlaceholderSlot>
      </TabsContent>
      <TabsContent value="json">
        <PlaceholderSlot title="Live JSON" task="Arrives in task 15.">
          A live, read-oriented reflection of the exported definition will
          render here.
        </PlaceholderSlot>
      </TabsContent>
    </Tabs>
  </div>
)

/**
 * The three-region layout wired to the live editor state. Rendered under an
 * {@link EditorProvider} by {@link EndpointBuilder}.
 */
const EndpointBuilderLayout = () => (
  <div className="bg-background text-foreground flex h-svh flex-col">
    <header className="border-border border-b p-4">
      <div className="mb-3">
        <h1 className="text-base font-semibold">LakeQL Endpoint Builder</h1>
        <p className="text-muted-foreground text-sm">
          Visual authoring for LakeQL endpoint definitions.
        </p>
      </div>
      <ImportExportBar />
    </header>

    <ResizablePanelGroup orientation="horizontal" className="flex-1">
      <ResizablePanel defaultSize={28} minSize={18}>
        <LeftRegion />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={44} minSize={25}>
        <CenterRegion />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={28} minSize={18}>
        <RightRegion />
      </ResizablePanel>
    </ResizablePanelGroup>
  </div>
)

/**
 * Root component of the LakeQL Endpoint Builder.
 *
 * Composes the three-region layout (metadata + mutation slot / field tree /
 * properties + JSON tabs) and the import/export bar over the framework-agnostic
 * `@/core`: the live `EditorState` drives rendering and validation, structural
 * actions route through the core field operations, and the draft autosaves via
 * the core persistence layer.
 *
 * The detail editors — field properties panel (task 13), mutation config form
 * (task 14), live JSON view (task 15), and the type-change confirmation dialog
 * (task 16) — are marked placeholders in this iteration.
 */
export const EndpointBuilder = () => {
  const editor = useEditor()
  return (
    <EditorProvider value={editor}>
      <EndpointBuilderLayout />
    </EditorProvider>
  )
}
