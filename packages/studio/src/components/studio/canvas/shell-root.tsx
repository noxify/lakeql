import { DndContext } from "@dnd-kit/core"
import type { ReactNode } from "react"

import {
  CanvasDndProvider,
  useCanvasDnd,
  useCanvasSensors,
} from "./use-canvas-dnd"
import {
  FieldFocusProvider,
  useFieldFocus,
  useFieldFocusContext,
} from "./use-field-focus"
import {
  FieldRemovalProvider,
  useCanvasFieldRemoval,
} from "./use-field-removal"
import { TypeChangeProvider, useCanvasTypeChange } from "./use-type-change"

/**
 * A visually hidden `aria-live` region announcing keyboard palette adds,
 * reusing the Iteration-1 announcer pattern. Polite so it does not interrupt
 * the user mid-navigation; atomic so each new message is read in full.
 *
 * Rendered once by {@link CanvasShellRoot} so the announcer lives under the
 * hoisted `FieldFocusProvider` regardless of where the palette and canvas
 * surface mount.
 */
export const CanvasAnnouncer = () => {
  const fieldFocus = useFieldFocusContext()
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
      data-testid="canvas-announcer"
    >
      {fieldFocus.announcement}
    </div>
  )
}

/**
 * The hoisted drag-and-drop shell root: owns the single `@dnd-kit`
 * `DndContext` and the canvas provider chain
 * (`CanvasDndProvider → FieldFocusProvider → TypeChangeProvider →
 * FieldRemovalProvider`) plus the
 * live-region announcer, and renders its `children` inside them.
 *
 * It is the reusable wrapper the iteration-3 shell mounts: it must sit **below**
 * `EditorProvider` — all three provider hooks call `useEditorContext`, so
 * hoisting this above `EditorProvider` would throw — and it is designed to sit
 * **above** the (later) `SidebarProvider`, so the palette and the
 * {@link CanvasSurface} can render in different subtrees (secondary sidebar vs
 * main content) while still sharing one `DndContext`. `@dnd-kit` resolves
 * droppables by payload, not DOM proximity, so the two need not be siblings.
 *
 * @param children - The subtree rendered under the hoisted contexts (the shell
 *   views, or a palette + canvas composition).
 */
export const CanvasShellRoot = ({ children }: { children: ReactNode }) => {
  const dnd = useCanvasDnd()
  const fieldFocus = useFieldFocus()
  const typeChange = useCanvasTypeChange()
  const fieldRemoval = useCanvasFieldRemoval()
  const sensors = useCanvasSensors()
  const { onDragStart: handleDragStart } = dnd
  const { onDragOver: handleDragOver } = dnd
  const { onDragEnd: handleDragEnd } = dnd

  return (
    <CanvasDndProvider value={dnd}>
      <FieldFocusProvider value={fieldFocus}>
        <TypeChangeProvider value={typeChange}>
          <FieldRemovalProvider value={fieldRemoval}>
            <DndContext
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
              <CanvasAnnouncer />
              {children}
            </DndContext>
          </FieldRemovalProvider>
        </TypeChangeProvider>
      </FieldFocusProvider>
    </CanvasDndProvider>
  )
}
