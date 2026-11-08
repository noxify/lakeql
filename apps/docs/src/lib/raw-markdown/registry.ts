import { apiReferenceToMarkdown } from "./api-reference-markdown"
import { cliCommandDetailsToMarkdown } from "./cli-command-details-markdown"
import { commandToMarkdown } from "./command-markdown"

/**
 * A Markdown renderer for a code-aware component.
 *
 * @param attrs - The element's string-literal JSX attributes.
 * @param childrenText - The whitespace-collapsed text content of the element's
 *   children, for components whose payload is their body (e.g. `Command`).
 */
export type MarkdownComponentRenderer = (
  attrs: Record<string, string>,
  childrenText: string
) => Promise<string>

/**
 * Markdown mirror of the code-aware components in `mdx-components.tsx`.
 *
 * Each entry maps a JSX tag name to an async renderer that turns the tag's
 * string-literal attributes (and, where relevant, its children text) into a
 * Markdown string. Only the components whose output is generated rather than
 * merely degraded to children (`ApiReference`, `CliCommandDetails`, `Command`)
 * are registered; every other JSX element is degraded to its children by the
 * expand plugin.
 */
export const markdownComponentRegistry: Record<
  string,
  MarkdownComponentRenderer
> = {
  ApiReference: (attrs) =>
    apiReferenceToMarkdown({ file: attrs.file ?? "", name: attrs.name }),
  CliCommandDetails: (attrs) =>
    cliCommandDetailsToMarkdown({ command: attrs.command ?? "" }),
  Command: (attrs, childrenText) =>
    commandToMarkdown({ variant: attrs.variant }, childrenText),
}
