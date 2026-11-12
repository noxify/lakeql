import { DndContext } from "@dnd-kit/core"
import type { ReactNode } from "react"

import {
  CanvasDndProvider,
  useCanvasDnd,
  useCanvasSensors,
} from "./use-canvas-dnd"
import {
  KeyboardMoveProvider,
  useKeyboardMove,
  useKeyboardMoveContext,
} from "./use-keyboard-move"
import { TypeChangeProvider, useCanvasTypeChange } from "./use-type-change"

/**
 * A visually hidden `aria-live` region announcing keyboard structural actions
 * (pick up, target change, drop, cancel, palette add) reusing the Iteration-1
 * announcer pattern (Requirement 5.4). Polite so it does not interrupt the user
 * mid-navigation; atomic so each new message is read in full.
 *
 * Rendered once by {@link CanvasShellRoot} so the announcer lives under the
 * hoisted `KeyboardMoveProvider` regardless of where the palette and canvas
 * surface mount.
 */
export const KeyboardMoveAnnouncer = () => {
  const keyboard = useKeyboardMoveContext()
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
      data-testid="keyboard-move-announcer"
    >
      {keyboard.announcement}
    </div>
  )
}

/**
 * The hoisted drag-and-drop shell root: owns the single `@dnd-kit`
 * `DndContext` and the canvas provider chain
 * (`CanvasDndProvider → KeyboardMoveProvider → TypeChangeProvider`) plus the
 * keyboard-move live-region announcer, and renders its `children` inside them.
 *
 * It is the reusable wrapper the iteration-3 shell mounts: it must sit **below**
 * `EditorProvider` — all three provider hooks call `useEditorContext`, so
 * hoisting this above `EditorProvider` would throw — and it is designed to sit
 * **above** the (later) `SidebarProvider`, so the palette and the
 * {@link CanvasSurface} can render in different subtrees (secondary sidebar vs
 * main content) while still sharing one `DndContext`. `@dnd-kit` resolves
 * droppables by payload, not DOM proximity, so the two need not be siblings.
 *
 * The drag/keyboard/type-change **logic is unchanged** from the previous
 * self-providing `Canvas`; only where the providers sit moves up to here.
 *
 * @param children - The subtree rendered under the hoisted contexts (the shell
 *   views, or a palette + canvas composition).
 */
export const CanvasShellRoot = ({ children }: { children: ReactNode }) => {
  const dnd = useCanvasDnd()
  const keyboard = useKeyboardMove()
  const typeChange = useCanvasTypeChange()
  const sensors = useCanvasSensors()
  const { onDragStart: handleDragStart } = dnd
  const { onDragOver: handleDragOver } = dnd
  const { onDragEnd: handleDragEnd } = dnd

  return (
    <CanvasDndProvider value={dnd}>
      <KeyboardMoveProvider value={keyboard}>
        <TypeChangeProvider value={typeChange}>
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <KeyboardMoveAnnouncer />
            {children}
          </DndContext>
        </TypeChangeProvider>
      </KeyboardMoveProvider>
    </CanvasDndProvider>
  )
}
