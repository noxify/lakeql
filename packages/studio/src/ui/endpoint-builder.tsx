import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { FieldPropertiesPanel } from "./field-properties-panel"
import { FieldTree } from "./field-tree"
import { ImportExportBar } from "./import-export-bar"
import { JsonView } from "./json-view"
import { MetadataForm } from "./metadata-form"
import { MutationConfigForm } from "./mutation-config-form"
import { EditorProvider, useEditor } from "./use-editor"

/**
 * The left region: endpoint-level settings — the metadata form and the mutation
 * config form (task 14).
 */
const LeftRegion = () => (
  <div className="flex h-full flex-col gap-6 overflow-y-auto p-4">
    <section className="grid gap-3">
      <h2 className="text-sm font-medium">Metadata</h2>
      <MetadataForm />
    </section>
    <section className="grid gap-3">
      <h2 className="text-sm font-medium">Mutation</h2>
      <MutationConfigForm />
    </section>
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
 * (task 13) and the live JSON view (task 15).
 */
const RightRegion = () => (
  <div className="h-full overflow-hidden p-4">
    <Tabs defaultValue="properties" className="flex h-full flex-col">
      <TabsList>
        <TabsTrigger value="properties">Properties</TabsTrigger>
        <TabsTrigger value="json">JSON</TabsTrigger>
      </TabsList>
      <TabsContent value="properties" className="flex-1 overflow-y-auto">
        <FieldPropertiesPanel />
      </TabsContent>
      <TabsContent value="json" className="min-h-0 flex-1 overflow-hidden">
        <JsonView />
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
 * The detail editors are all wired: the field properties panel (task 13), the
 * mutation config form (task 14), the live JSON view (task 15), and the lossy
 * type-change confirmation dialog (task 16).
 */
export const EndpointBuilder = () => {
  const editor = useEditor()
  return (
    <EditorProvider value={editor}>
      <EndpointBuilderLayout />
    </EditorProvider>
  )
}
