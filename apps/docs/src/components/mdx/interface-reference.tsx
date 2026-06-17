import { readFile } from "node:fs/promises"

import { Markdown } from "renoun/components"
import type { ModuleExport } from "renoun/file-system"
import { Node, Project, SyntaxKind } from "ts-morph"

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
  /** Extraction mode. "declaration" avoids resolving external library types. */
  mode?: "declaration" | "resolved"
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

function extractMembers(resolvedType: ResolvedType): ResolvedProperty[] {
  if (resolvedType.kind === "Interface" && resolvedType.members) {
    return resolvedType.members.filter(
      (member) => member.kind === "PropertySignature"
    )
  }

  if (
    resolvedType.kind === "TypeAlias" &&
    resolvedType.type?.kind === "TypeLiteral" &&
    resolvedType.type.members
  ) {
    return resolvedType.type.members.filter(
      (member) => member.kind === "PropertySignature"
    )
  }

  return []
}

function normalizeJsDocTag(tagText: string) {
  const normalizedText = tagText.trim()
  const match = /^@(?<name>\S+)(?:\s+(?<text>[\s\S]*))?$/u.exec(normalizedText)

  if (!match?.groups?.name) {
    return {
      name: normalizedText.replace(/^@/u, ""),
    }
  }

  return {
    name: match.groups.name,
    text: match.groups.text?.trim() || undefined,
  }
}

function resolvePropertyDescription(property: {
  getJsDocs: () => { getDescription: () => string }[]
}) {
  const description = property
    .getJsDocs()
    .map((doc) => doc.getDescription().trim())
    .filter(Boolean)
    .join("\n\n")

  return description || undefined
}

function resolvePropertyTags(property: {
  getJsDocs: () => { getTags: () => { getText: () => string }[] }[]
}) {
  const tags = property
    .getJsDocs()
    .flatMap((doc) =>
      doc.getTags().map((tag) => normalizeJsDocTag(tag.getText()))
    )

  return tags.length > 0 ? tags : undefined
}

function toResolvedProperty(property: {
  getName: () => string
  getTypeNode: () => { getText: () => string } | undefined
  hasQuestionToken: () => boolean
  isReadonly: () => boolean
  getJsDocs: () => {
    getDescription: () => string
    getTags: () => { getText: () => string }[]
  }[]
}): ResolvedProperty {
  return {
    name: property.getName(),
    kind: "PropertySignature",
    type: {
      text: property.getTypeNode()?.getText().trim() || "unknown",
    },
    isOptional: property.hasQuestionToken(),
    isReadonly: property.isReadonly(),
    description: resolvePropertyDescription(property),
    tags: resolvePropertyTags(property),
  }
}

async function getDeclarationType(file: string, name: string) {
  const sourceEntry = await PackagesDirectory.getFile(file, "ts")
  const filePath = sourceEntry.absolutePath
  const fileContent = await readFile(filePath, "utf-8")
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    useInMemoryFileSystem: true,
  })
  const sourceFile = project.createSourceFile(filePath, fileContent, {
    overwrite: true,
  })

  const interfaceDeclaration = sourceFile.getInterface(name)

  if (interfaceDeclaration) {
    return {
      kind: "Interface",
      members: interfaceDeclaration.getProperties().map(toResolvedProperty),
    } satisfies ResolvedType
  }

  const typeAliasDeclaration = sourceFile.getTypeAlias(name)
  const typeLiteral = typeAliasDeclaration
    ?.getTypeNode()
    ?.asKind(SyntaxKind.TypeLiteral)

  if (!typeLiteral) {
    return
  }

  return {
    kind: "TypeAlias",
    type: {
      kind: "TypeLiteral",
      members: typeLiteral
        .getMembers()
        .filter(Node.isPropertySignature)
        .map(toResolvedProperty),
    },
  } satisfies ResolvedType
}

async function getResolvedType(file: string, name: string) {
  const sourceFile = await PackagesDirectory.getFile(file, "ts")
  // oxlint-disable-next-line typescript/no-explicit-any
  const fileExports: ModuleExport<any>[] =
    // oxlint-disable-next-line typescript/no-explicit-any
    await (sourceFile as any).getExports()
  const targetExport = fileExports.find((exp) => exp.name === name)

  if (!targetExport) {
    return
  }

  return (await targetExport.getType()) as ResolvedType | undefined
}

/**
 * Renders a TypeScript interface as a properties table with description as sub-row
 * and @default tag support. Styled consistently with the InlineReference/Reference component.
 */
export async function InterfaceReference({
  file,
  name,
  mode = "declaration",
}: InterfaceReferenceProps) {
  try {
    const resolvedType =
      mode === "resolved"
        ? await getResolvedType(file, name)
        : await getDeclarationType(file, name)

    if (!resolvedType) {
      return null
    }

    const members = extractMembers(resolvedType)

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
        <TableCell className="max-w-75 font-mono text-xs font-semibold break-all whitespace-normal">
          {member.name}
          {member.isOptional ? "?" : ""}
        </TableCell>
        <TableCell className="text-muted-foreground max-w-75 font-mono text-xs break-all whitespace-normal">
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
