import { ChevronRightIcon, PlusIcon, Trash2Icon } from "lucide-react"
import type { KeyboardEvent } from "react"
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
} from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type {
  EditorArrayItemType,
  EditorField,
  EditorFieldType,
  FieldPath,
  TypeChangePlan,
} from "@/core"
import { createField } from "@/core"
import { cn } from "@/lib/utils"

import {
  arrayItemTypeOptions,
  fieldNameError,
  fieldTypeOptions,
} from "./field-meta"
import { childrenOf, flattenVisible, nextFocusId } from "./tree-nav"
import type { VisibleNode } from "./tree-nav"
import { TypeChangeConfirmDialog } from "./type-change-dialog"
import { useEditorContext } from "./use-editor"

/**
 * Tree-wide navigation state shared by every `FieldNode`: the flattened visible
 * rows, expansion state, the roving-tabindex active id, and the handlers that
 * move focus or toggle expansion. Keeping this at the tree root (rather than
 * per-node `open` state) is what makes the WAI-ARIA tree pattern — a single
 * tab stop plus arrow-key navigation across the whole hierarchy — possible.
 */
interface TreeNavContextValue {
  rows: VisibleNode[]
  /** The id of the row that currently owns the single tree tab stop. */
  activeId: string | null
  isExpanded: (id: string) => boolean
  setExpanded: (id: string, expanded: boolean) => void
  /** Registers a node's focusable row element for programmatic focus. */
  registerRow: (id: string, element: HTMLDivElement | null) => void
  /** Handles a keydown on a tree row, driving focus and expand/collapse. */
  onRowKeyDown: (
    event: KeyboardEvent<HTMLDivElement>,
    node: VisibleNode
  ) => void
  /** Marks a row active (roving tabindex) when it receives focus. */
  onRowFocus: (id: string) => void
}

const TreeNavContext = createContext<TreeNavContextValue | null>(null)

/**
 * Reads the tree navigation context. Thrown access outside the tree is a
 * programming error, surfaced loudly rather than rendering a broken tree.
 */
function useTreeNav(): TreeNavContextValue {
  const value = useContext(TreeNavContext)
  if (value === null) {
    throw new Error("useTreeNav must be used within the FieldTree")
  }
  return value
}

/**
 * The button that adds a new field to a container, used both at the top level
 * and inside each `Object`/`Array`-of-`Object` node.
 */
const AddFieldButton = ({
  parentPath,
  label,
}: {
  parentPath: FieldPath
  label: string
}) => {
  const editor = useEditorContext()
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => editor.addField(parentPath, createField())}
    >
      <PlusIcon />
      {label}
    </Button>
  )
}

/**
 * A `Select` over the eight field types (six primitives + `Object` + `Array`).
 */
const FieldTypeSelect = ({
  value,
  onChange,
  label,
}: {
  value: EditorFieldType
  onChange: (next: EditorFieldType) => void
  label: string
}) => (
  <Select
    value={value}
    onValueChange={(next) => onChange(next as EditorFieldType)}
  >
    <SelectTrigger size="sm" aria-label={label}>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {fieldTypeOptions.map((type) => (
        <SelectItem key={type} value={type}>
          {type}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
)

/**
 * A `Select` over the valid `Array` item types (primitives + `Object`, never
 * `Array`).
 */
const ArrayItemTypeSelect = ({
  value,
  onChange,
}: {
  value: EditorArrayItemType
  onChange: (next: EditorArrayItemType) => void
}) => (
  <Select
    value={value}
    onValueChange={(next) => onChange(next as EditorArrayItemType)}
  >
    <SelectTrigger size="sm" aria-label="Array item type">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {arrayItemTypeOptions.map((type) => (
        <SelectItem key={type} value={type}>
          {type}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
)

/**
 * A single tree node, rendered as a WAI-ARIA `treeitem`: its name input, type
 * picker, array-item picker (only for `Array`), remove button, and — for
 * `Object`/`Array`-of-`Object` — a group of child nodes with an add affordance.
 *
 * The row carries the tree semantics: `aria-level` from its depth,
 * `aria-expanded` when it is a container, `aria-selected` from the editor
 * selection, and a roving `tabIndex` (only the active row is tabbable).
 * Arrow-key navigation and expand/collapse are handled centrally by the tree
 * (see {@link TreeNavContextValue}); interactive controls inside the row keep
 * their own keyboard behaviour because the handler ignores keys originating
 * from them.
 *
 * Add/remove/type operations route through the shared editor (and thence to
 * `@/core/field-ops`); the node never reimplements the transition logic. A
 * lossy type change opens the confirmation dialog and is applied only on
 * confirm — no structure is dropped silently.
 */
const FieldNode = ({
  node,
  field,
}: {
  node: VisibleNode
  field: EditorField
}) => {
  const editor = useEditorContext()
  const tree = useTreeNav()
  const nameId = useId()
  const nameErrorId = `${nameId}-error`
  const rowRef = useRef<HTMLDivElement>(null)

  const { path } = node
  const open = node.expanded

  // A lossy type change the user has not yet confirmed. When set, the
  // confirmation dialog is open and the change is applied only on confirm.
  const [pending, setPending] = useState<{
    kind: "field" | "item"
    nextType: EditorFieldType | EditorArrayItemType
    plan: TypeChangePlan
    targetLabel: string
  } | null>(null)

  const requestFieldType = (nextType: EditorFieldType): void => {
    const outcome = editor.changeFieldType(path, nextType)
    if (!outcome.applied && outcome.plan.needsConfirmation) {
      setPending({
        kind: "field",
        nextType,
        plan: outcome.plan,
        targetLabel: nextType,
      })
    }
  }

  const requestArrayItemType = (nextType: EditorArrayItemType): void => {
    const outcome = editor.changeArrayItemType(path, nextType)
    if (!outcome.applied && outcome.plan.needsConfirmation) {
      setPending({
        kind: "item",
        nextType,
        plan: outcome.plan,
        targetLabel: `Array of ${nextType}`,
      })
    }
  }

  const confirmPending = (): void => {
    if (pending === null) {
      return
    }
    if (pending.kind === "field") {
      editor.changeFieldType(path, pending.nextType as EditorFieldType, {
        confirm: true,
      })
    } else {
      editor.changeArrayItemType(
        path,
        pending.nextType as EditorArrayItemType,
        {
          confirm: true,
        }
      )
    }
    setPending(null)
  }

  const children = childrenOf(field)
  const isContainer = children !== undefined
  const selected = editor.selectedFieldId === field.id
  const nameErr = fieldNameError(field.name)

  const row = (
    <div
      ref={(element) => {
        rowRef.current = element
        tree.registerRow(field.id, element)
      }}
      role="treeitem"
      aria-level={node.level}
      aria-selected={selected}
      aria-expanded={isContainer ? open : undefined}
      aria-label={field.name === "" ? "Unnamed field" : field.name}
      tabIndex={tree.activeId === field.id ? 0 : -1}
      onKeyDown={(event) => tree.onRowKeyDown(event, node)}
      onFocus={(event) => {
        // Only react to focus landing on the row itself, not bubbling up from
        // an inner control (which manages its own focus).
        if (event.target === event.currentTarget) {
          tree.onRowFocus(field.id)
        }
      }}
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-md border border-transparent px-2 py-1.5 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        selected && "border-ring bg-accent/40"
      )}
    >
      {isContainer ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={open ? "Collapse" : "Expand"}
          tabIndex={-1}
          onClick={() => tree.setExpanded(field.id, !open)}
        >
          <ChevronRightIcon
            className={cn("transition-transform", open && "rotate-90")}
          />
        </Button>
      ) : (
        <span className="inline-block w-7" aria-hidden="true" />
      )}

      <div className="grid min-w-40 flex-1 gap-1">
        <Input
          id={nameId}
          value={field.name}
          placeholder="field_name"
          aria-label="Field name"
          aria-invalid={nameErr !== undefined}
          aria-describedby={nameErr === undefined ? undefined : nameErrorId}
          onFocus={() => editor.selectField(field.id)}
          onChange={(event) => {
            editor.renameField(path, event.target.value)
          }}
          onBlur={() => editor.commitEdits()}
        />
        {nameErr !== undefined && (
          <p id={nameErrorId} className="text-destructive text-xs">
            {nameErr}
          </p>
        )}
      </div>

      <FieldTypeSelect
        label="Field type"
        value={field.type}
        onChange={requestFieldType}
      />

      {field.type === "Array" && (
        <>
          <span className="text-muted-foreground text-xs">of</span>
          <ArrayItemTypeSelect
            value={field.items?.type ?? "String"}
            onChange={requestArrayItemType}
          />
        </>
      )}

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Remove field"
        onClick={() => editor.removeField(path)}
      >
        <Trash2Icon />
      </Button>
    </div>
  )

  const dialog = (
    <TypeChangeConfirmDialog
      pending={
        pending === null
          ? null
          : { plan: pending.plan, targetLabel: pending.targetLabel }
      }
      onConfirm={confirmPending}
      onCancel={() => setPending(null)}
    />
  )

  if (!isContainer) {
    return (
      <>
        {row}
        {dialog}
      </>
    )
  }

  return (
    <>
      {row}
      {open && (
        <div
          role="group"
          className="border-border/60 mt-1 ml-5 grid gap-1 border-l pl-3"
        >
          {children.length === 0 ? (
            <p className="text-muted-foreground py-1 text-xs">
              No child fields yet. {field.type} requires at least one.
            </p>
          ) : (
            children.map((child, index) => (
              <FieldNode
                key={child.id}
                field={child}
                node={{
                  id: child.id,
                  path: [...path, index],
                  level: node.level + 1,
                  expandable: childrenOf(child) !== undefined,
                  expanded: tree.isExpanded(child.id),
                  parentId: field.id,
                }}
              />
            ))
          )}
          <div>
            <AddFieldButton parentPath={path} label="Add child field" />
          </div>
        </div>
      )}
      {dialog}
    </>
  )
}

/**
 * The recursive, keyboard-navigable field tree (Req 12.4). Renders the
 * top-level `fields` with an add affordance inside a `role="tree"` container,
 * each node a `treeitem` carrying `aria-level`/`aria-expanded`/`aria-selected`.
 *
 * Focus uses a roving tabindex: the tree is a single tab stop, and Arrow keys
 * move between rows, `ArrowRight`/`ArrowLeft` expand/collapse (or step into/out
 * of a subtree), `Home`/`End` jump to the first/last visible row, and
 * `Enter`/`Space` select the focused field. Selection is surfaced through the
 * shared editor so the properties panel can target the active field.
 */
export const FieldTree = () => {
  const editor = useEditorContext()
  const { fields } = editor.state

  // Expansion is tree-level state so the flattened navigation order and the
  // render agree. Default: containers are expanded; a node drops out of the set
  // only when explicitly collapsed.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set()
  )
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const [activeId, setActiveId] = useState<string | null>(null)

  const isExpanded = useCallback(
    (id: string) => !collapsed.has(id),
    [collapsed]
  )

  const rows = useMemo(
    () => flattenVisible(fields, isExpanded),
    [fields, isExpanded]
  )

  // Keep the roving tab stop valid: if the active row disappears (removed, or a
  // collapsed ancestor hid it), fall back to the first visible row.
  const effectiveActiveId =
    activeId !== null && rows.some((row) => row.id === activeId)
      ? activeId
      : (rows[0]?.id ?? null)

  const setExpanded = useCallback((id: string, expanded: boolean) => {
    setCollapsed((previous) => {
      const next = new Set(previous)
      if (expanded) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const registerRow = useCallback(
    (id: string, element: HTMLDivElement | null) => {
      if (element === null) {
        rowRefs.current.delete(id)
      } else {
        rowRefs.current.set(id, element)
      }
    },
    []
  )

  const focusRow = useCallback((id: string | null) => {
    if (id === null) {
      return
    }
    setActiveId(id)
    // Move DOM focus after the tabindex update so the browser accepts it.
    const element = rowRefs.current.get(id)
    element?.focus()
  }, [])

  const onRowFocus = useCallback((id: string) => {
    setActiveId(id)
  }, [])

  const onRowKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>, node: VisibleNode) => {
      // Ignore keys originating from an inner control (name input, selects,
      // buttons) so they keep their own keyboard behaviour; the tree only owns
      // keys pressed while the row itself is focused.
      if (event.target !== event.currentTarget) {
        return
      }

      const { key } = event

      if (key === "Enter" || key === " ") {
        event.preventDefault()
        editor.selectField(node.id)
        return
      }

      if (key === "ArrowRight" && node.expandable && !node.expanded) {
        event.preventDefault()
        setExpanded(node.id, true)
        return
      }

      if (key === "ArrowLeft" && node.expandable && node.expanded) {
        event.preventDefault()
        setExpanded(node.id, false)
        return
      }

      if (
        key === "ArrowDown" ||
        key === "ArrowUp" ||
        key === "ArrowRight" ||
        key === "ArrowLeft" ||
        key === "Home" ||
        key === "End"
      ) {
        const target = nextFocusId(rows, node.id, key)
        if (target !== null) {
          event.preventDefault()
          focusRow(target)
        }
      }
    },
    [editor, rows, setExpanded, focusRow]
  )

  const navValue = useMemo<TreeNavContextValue>(
    () => ({
      rows,
      activeId: effectiveActiveId,
      isExpanded,
      setExpanded,
      registerRow,
      onRowKeyDown,
      onRowFocus,
    }),
    [
      rows,
      effectiveActiveId,
      isExpanded,
      setExpanded,
      registerRow,
      onRowKeyDown,
      onRowFocus,
    ]
  )

  return (
    <TreeNavContext.Provider value={navValue}>
      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <h2 id="field-tree-label" className="text-sm font-medium">
            Fields
          </h2>
          <AddFieldButton parentPath={[]} label="Add field" />
        </div>

        {fields.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No fields yet. A top-level definition with no fields is valid; add
            fields to describe the structure.
          </p>
        ) : (
          <div
            role="tree"
            aria-labelledby="field-tree-label"
            className="grid gap-1"
          >
            {fields.map((field, index) => (
              <FieldNode
                key={field.id}
                field={field}
                node={{
                  id: field.id,
                  path: [index],
                  level: 1,
                  expandable: childrenOf(field) !== undefined,
                  expanded: isExpanded(field.id),
                  parentId: null,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </TreeNavContext.Provider>
  )
}
