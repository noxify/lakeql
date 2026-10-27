import {
  extractSeeLinks,
  kindToLabel,
  resolvePackagePath,
} from "@/components/mdx/api-reference/utils"
import { resolveFileExports } from "@/lib/ts-morph-analysis"
import type {
  ResolvedExport,
  ResolvedExportMember,
  ResolvedExportParam,
  ResolvedTypeParam,
} from "@/lib/ts-morph-analysis"

import { tableCell } from "./mdast-helpers"

/** String-literal attributes the Markdown `ApiReference` renderer reads. */
export interface ApiReferenceAttrs {
  /** File path relative to the packages directory, e.g. `config/src/index`. */
  file: string
  /** Optional single-export filter; only honored on the inline tag path. */
  name?: string
}

/** A table row mirroring {@link MemberRow} from the React `MembersTable`. */
interface MemberRowInput {
  name: string
  type: string
  description?: string
  defaultValue?: string
  isRequired?: boolean
  typeMembers?: ResolvedExportMember[]
  seeLinks?: { url: string; label: string }[]
}

const INLINE_CODE = (value: string): string => `\`${value}\``

/** Collapses internal newlines/runs of whitespace into single spaces. */
function collapseWhitespace(text: string): string {
  return text.replaceAll(/\s*\n\s*/gu, " ").trim()
}

function seeLinksSuffix(
  seeLinks: { url: string; label: string }[] | undefined
): string {
  if (!seeLinks || seeLinks.length === 0) {
    return ""
  }

  const rendered = seeLinks.map((l) => `[${l.label}](${l.url})`).join(", ")
  return ` See: ${rendered}`
}

/**
 * Renders a member detail bullet mirroring the React `MembersTable` sub-row.
 *
 * The bullet is emitted only when the row carries a description, default, or
 * `@see` link; otherwise an empty string is returned so no bullet is produced.
 */
function memberDetailBullet(row: MemberRowInput): string {
  const hasDetail = !!(
    row.description ||
    row.defaultValue ||
    (row.seeLinks && row.seeLinks.length > 0)
  )

  if (!hasDetail) {
    return ""
  }

  const parts: string[] = [`- **${INLINE_CODE(row.name)}**`]

  if (row.isRequired) {
    parts.push(" (required)")
  }

  if (row.description) {
    parts.push(` — ${collapseWhitespace(row.description)}`)
  }

  if (row.defaultValue) {
    parts.push(`. Default: ${INLINE_CODE(row.defaultValue)}`)
  }

  parts.push(seeLinksSuffix(row.seeLinks))

  return parts.join("")
}

/**
 * Renders a nested `Property | Type` table for a member's `typeMembers`.
 *
 * Mirrors the single nested sub-table in the React `MembersTable` and is
 * intentionally only one level deep — `typeMembers` is not descended further,
 * matching the component.
 */
function renderNestedTypeMembers(
  ownerName: string,
  typeMembers: ResolvedExportMember[]
): string[] {
  const lines: string[] = [
    `**${INLINE_CODE(ownerName)}** properties:`,
    "",
    "| Property | Type |",
    "| --- | --- |",
  ]

  for (const m of typeMembers) {
    const name = `${m.name}${m.isOptional ? "?" : ""}`
    lines.push(
      `| ${tableCell(INLINE_CODE(name))} | ${tableCell(INLINE_CODE(m.type))} |`
    )
  }

  const descriptionBullets = typeMembers
    .filter((m) => m.description)
    .map(
      (m) =>
        `- **${INLINE_CODE(`${m.name}${m.isOptional ? "?" : ""}`)}** — ${collapseWhitespace(m.description ?? "")}`
    )

  if (descriptionBullets.length > 0) {
    lines.push("", ...descriptionBullets)
  }

  return lines
}

/**
 * Renders a members table (top-level `Name | Type` plus detail/nested blocks).
 *
 * Mirrors the React `MembersTable`: a two-column table, a detail bullet per row
 * that has a description/default/`@see`, and a single nested `typeMembers`
 * sub-table where present.
 */
function renderMembersTable(rows: MemberRowInput[]): string[] {
  if (rows.length === 0) {
    return []
  }

  const lines: string[] = ["| Name | Type |", "| --- | --- |"]

  for (const row of rows) {
    lines.push(
      `| ${tableCell(INLINE_CODE(row.name))} | ${tableCell(INLINE_CODE(row.type))} |`
    )
  }

  for (const row of rows) {
    const bullet = memberDetailBullet(row)

    if (bullet) {
      lines.push("", bullet)
    }

    if (row.typeMembers && row.typeMembers.length > 0) {
      lines.push("", ...renderNestedTypeMembers(row.name, row.typeMembers))
    }
  }

  return lines
}

function paramToRow(p: ResolvedExportParam): MemberRowInput {
  return {
    name: `${p.name}${p.isOptional ? "?" : ""}`,
    type: p.type,
    description: p.description,
    defaultValue: p.defaultValue,
    isRequired: !p.isOptional,
    typeMembers: p.typeMembers,
  }
}

function renderSeeLinksBlock(
  tags: { name: string; text?: string }[] | undefined
): string[] {
  const links = extractSeeLinks(tags)

  if (!links) {
    return []
  }

  const lines = ["See:"]
  for (const link of links) {
    lines.push(`- [${link.label}](${link.url})`)
  }

  return lines
}

/**
 * Renders a `Parameter | Constraint | Default` table plus `@template` sub-list.
 *
 * Re-implements the exact `@template` parse rule from the React
 * `TypeParamsTable` (`/^(?<name>\S+)(?:\s+-\s+(?<desc>.+))?$/u`): a description
 * is attached only when the `desc` group is present.
 */
function renderTypeParamsTable(
  typeParams: ResolvedTypeParam[],
  templateTags: { name: string; text?: string }[] | undefined
): string[] {
  const templateDescriptions = new Map<string, string>()

  if (templateTags) {
    for (const tag of templateTags) {
      if (tag.name === "template" && tag.text) {
        const match = /^(?<name>\S+)(?:\s+-\s+(?<desc>.+))?$/u.exec(
          tag.text.trim()
        )

        if (match?.groups?.name && match.groups.desc) {
          templateDescriptions.set(match.groups.name, match.groups.desc)
        }
      }
    }
  }

  const lines: string[] = [
    "#### Type Parameters",
    "",
    "| Parameter | Constraint | Default |",
    "| --- | --- | --- |",
  ]

  for (const tp of typeParams) {
    lines.push(
      `| ${tableCell(INLINE_CODE(tp.name))} | ${tableCell(INLINE_CODE(tp.constraint ?? "—"))} | ${tableCell(INLINE_CODE(tp.defaultType ?? "—"))} |`
    )
  }

  const descriptionBullets: string[] = []
  for (const tp of typeParams) {
    const desc = templateDescriptions.get(tp.name)

    if (desc) {
      descriptionBullets.push(`- **${INLINE_CODE(tp.name)}** — ${desc}`)
    }
  }

  if (descriptionBullets.length > 0) {
    lines.push("", ...descriptionBullets)
  }

  return lines
}

function renderReturns(sig: {
  returnType: string
  returnsDescription?: string
}): string[] {
  const showReturnType = !!(sig.returnType && sig.returnType !== "void")

  if (!showReturnType && !sig.returnsDescription) {
    return []
  }

  const lines: string[] = ["#### Returns"]

  if (showReturnType) {
    lines.push("", "```ts", sig.returnType, "```")
  }

  if (sig.returnsDescription) {
    lines.push("", sig.returnsDescription.trim())
  }

  return lines
}

function renderMethod(method: ResolvedExport): string[] {
  const sig = method.signatures?.[0]
  const heading = method.isAsync
    ? `#### \`async\` ${method.name}`
    : `#### ${method.name}`
  const lines: string[] = [heading]

  if (method.description) {
    lines.push("", method.description.trim())
  }

  if (method.typeParams && method.typeParams.length > 0) {
    lines.push("", ...renderTypeParamsTable(method.typeParams, method.tags))
  }

  if (sig && sig.params.length > 0) {
    lines.push(
      "",
      "#### Parameters",
      "",
      ...renderMembersTable(sig.params.map(paramToRow))
    )
  }

  if (sig) {
    const returns = renderReturns(sig)

    if (returns.length > 0) {
      lines.push("", ...returns)
    }
  }

  return lines
}

function renderExportHeader(source: ResolvedExport): string[] {
  const lines: string[] = [
    `### ${source.name}`,
    "",
    `*${kindToLabel(source.kind)}*`,
  ]

  if (source.description) {
    lines.push("", source.description.trim())
  }

  const seeBlock = renderSeeLinksBlock(source.tags)
  if (seeBlock.length > 0) {
    lines.push("", ...seeBlock)
  }

  return lines
}

function renderSignatures(source: ResolvedExport): string[] {
  if (!source.signatures || source.signatures.length === 0) {
    return []
  }

  const lines: string[] = []

  if (source.typeParams && source.typeParams.length > 0) {
    lines.push("", ...renderTypeParamsTable(source.typeParams, source.tags))
  }

  for (const sig of source.signatures) {
    if (sig.params.length > 0) {
      lines.push(
        "",
        "#### Parameters",
        "",
        ...renderMembersTable(sig.params.map(paramToRow))
      )
    }

    const returns = renderReturns(sig)
    if (returns.length > 0) {
      lines.push("", ...returns)
    }
  }

  return lines
}

function renderConstructor(source: ResolvedExport): string[] {
  if (!source.classConstructor || source.classConstructor.params.length === 0) {
    return []
  }

  const lines: string[] = ["", "#### Constructor"]

  if (source.classConstructor.description) {
    lines.push("", source.classConstructor.description.trim())
  }

  lines.push(
    "",
    ...renderMembersTable(source.classConstructor.params.map(paramToRow))
  )

  return lines
}

function renderProperties(source: ResolvedExport): string[] {
  if (!source.members || source.members.length === 0) {
    return []
  }

  const rows = source.members.map<MemberRowInput>((m) => ({
    name: `${m.name}${m.isOptional ? "?" : ""}`,
    type: m.type,
    description: m.description,
    defaultValue: m.tags?.find((t) => t.name === "default")?.text,
    isRequired: !m.isOptional,
    typeMembers: m.typeMembers,
    seeLinks: extractSeeLinks(m.tags),
  }))

  return ["", "#### Properties", "", ...renderMembersTable(rows)]
}

function renderMethods(source: ResolvedExport): string[] {
  if (!source.methods || source.methods.length === 0) {
    return []
  }

  const lines: string[] = ["", "#### Methods"]

  for (const method of source.methods) {
    lines.push("", ...renderMethod(method))
  }

  return lines
}

function renderEnumMembers(source: ResolvedExport): string[] {
  if (!source.enumMembers || source.enumMembers.length === 0) {
    return []
  }

  const rows = source.enumMembers.map<MemberRowInput>((m) => ({
    name: m.name,
    type: m.value ?? "",
    description: m.description,
  }))

  return ["", ...renderMembersTable(rows)]
}

function renderDefinition(source: ResolvedExport): string[] {
  const showDefinition =
    source.typeText &&
    ((source.kind === "TypeAlias" &&
      (!source.members || source.members.length === 0)) ||
      source.kind === "Variable")

  if (!showDefinition || !source.typeText) {
    return []
  }

  const lines: string[] = [
    "",
    "#### Definition",
    "",
    "```ts",
    source.typeText,
    "```",
  ]

  if (source.referencedTypes && source.referencedTypes.length > 0) {
    lines.push("", `See: ${source.referencedTypes.join(", ")}`)
  }

  return lines
}

function renderExport(source: ResolvedExport): string[] {
  const lines: string[] = renderExportHeader(source)

  // Type parameters for non-function exports (functions render them per-signature).
  if (!source.signatures && source.typeParams && source.typeParams.length > 0) {
    lines.push("", ...renderTypeParamsTable(source.typeParams, source.tags))
  }

  lines.push(
    ...renderSignatures(source),
    ...renderConstructor(source),
    ...renderProperties(source),
    ...renderMethods(source),
    ...renderEnumMembers(source),
    ...renderDefinition(source)
  )

  return lines
}

/**
 * Renders a package's TypeScript exports as Markdown mirroring the React
 * `ApiReference` component in its `"full"` variant.
 *
 * Resolution reuses {@link resolveFileExports} and the component `utils`
 * (`resolvePackagePath`, `kindToLabel`, `extractSeeLinks`) so the Markdown and
 * the rendered documentation share a single source of truth. Type links are
 * always rendered as plain type text (full-variant, anchors-as-text form).
 *
 * @param attrs - The resolved string attributes. `name` applies a single-export
 *   filter and is only forwarded on the inline tag path.
 * @returns The Markdown for the matched exports, or a one-line fallback note
 *   when resolution throws.
 */
export async function apiReferenceToMarkdown(
  attrs: ApiReferenceAttrs
): Promise<string> {
  let exports: ResolvedExport[]

  try {
    const all = await resolveFileExports(resolvePackagePath(attrs.file))
    exports = attrs.name
      ? all.filter((exp) => exp.name === attrs.name)
      : [...all]
  } catch (error) {
    // oxlint-disable-next-line no-console
    console.warn(
      `[raw-markdown] ApiReference expansion failed for file "${attrs.file}":`,
      error
    )
    return `> Documentation for \`ApiReference\` could not be generated.`
  }

  if (exports.length === 0) {
    return ""
  }

  return exports.map((exp) => renderExport(exp).join("\n")).join("\n\n")
}
