import { Markdown } from "renoun/components"
import type { ModuleExport } from "renoun/file-system"

import { PackagesDirectory } from "@/collections"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import { LinkHandler } from "./link-handler"

interface InterfaceReferenceProps {
  /** File path relative to PackagesDirectory, e.g. "schema-generator/src/endpoint-schema" */
  file: string
  /** Export name of the interface to render. */
  name: string
}

interface ResolvedProperty {
  name?: string
  kind: string
  type: { text: string }
  isOptional?: boolean
  isReadonly?: boolean
  description?: string
  tags?: { name: string; text?: string }[]
}

interface ResolvedType {
  kind: string
  members?: ResolvedProperty[]
  type?: { kind: string; members?: ResolvedProperty[] }
}

/**
 * Renders a TypeScript interface as a properties table with description as sub-row
 * and @default tag support. Styled consistently with the InlineReference/Reference component.
 */
export async function InterfaceReference({
  file,
  name,
}: InterfaceReferenceProps) {
  try {
    const sourceFile = await PackagesDirectory.getFile(file, "ts")
    // oxlint-disable-next-line typescript/no-explicit-any
    const fileExports: ModuleExport<any>[] =
      // oxlint-disable-next-line typescript/no-explicit-any
      await (sourceFile as any).getExports()
    const targetExport = fileExports.find((exp) => exp.name === name)

    if (!targetExport) {
      return null
    }

    const resolvedType = (await targetExport.getType()) as
      | ResolvedType
      | undefined

    if (!resolvedType) {
      return null
    }

    // Extract members from Interface or TypeAlias with TypeLiteral
    let members: ResolvedProperty[] = []

    if (resolvedType.kind === "Interface" && resolvedType.members) {
      members = resolvedType.members.filter(
        (m) => m.kind === "PropertySignature"
      )
    } else if (
      resolvedType.kind === "TypeAlias" &&
      resolvedType.type?.kind === "TypeLiteral" &&
      resolvedType.type.members
    ) {
      members = resolvedType.type.members.filter(
        (m) => m.kind === "PropertySignature"
      )
    }

    if (members.length === 0) {
      return null
    }

    return (
      <div className="not-prose my-6">
        <Table variant="outline">
          <TableHeader>
            <TableRow>
              <TableHead className="bg-muted font-bold">Property</TableHead>
              <TableHead className="bg-muted font-bold">Type</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => {
              const defaultTag = member.tags?.find(
                (tag: { name: string }) => tag.name === "default"
              )
              const hasSubRow = !!(member.description || defaultTag)

              return (
                <PropertyRow
                  key={member.name}
                  member={member}
                  defaultTag={defaultTag}
                  hasSubRow={hasSubRow}
                />
              )
            })}
          </TableBody>
        </Table>
      </div>
    )
  } catch {
    return null
  }
}

function PropertyRow({
  member,
  defaultTag,
  hasSubRow,
}: {
  member: ResolvedProperty
  defaultTag?: { name: string; text?: string }
  hasSubRow: boolean
}) {
  return (
    <>
      <TableRow>
        <TableCell className="max-w-[300px] font-mono text-xs font-semibold break-all whitespace-normal">
          {member.name}
          {member.isOptional ? "?" : ""}
        </TableCell>
        <TableCell className="text-muted-foreground max-w-[300px] font-mono text-xs break-all whitespace-normal">
          <code className="border-border bg-muted/60 inline-flex rounded border px-1.5 py-0.5 font-mono text-xs">
            {member.type.text}
          </code>
        </TableCell>
      </TableRow>
      {hasSubRow && (
        <TableRow>
          <TableCell
            colSpan={2}
            className="text-muted-foreground whitespace-normal"
          >
            <div className="ml-4 flex flex-col gap-1.5">
              {member.description && (
                <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
                  <Markdown
                    components={{
                      // oxlint-disable-next-line react/no-unstable-nested-components
                      a: ({
                        href,
                        children,
                        ...props
                      }: React.ComponentPropsWithoutRef<"a">) => (
                        <LinkHandler href={href} {...props}>
                          {children}
                        </LinkHandler>
                      ),
                    }}
                  >
                    {member.description}
                  </Markdown>
                </div>
              )}
              {defaultTag && (
                <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                  Default:{" "}
                  <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
                    {defaultTag.text ?? "—"}
                  </code>
                </span>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}
