import { apiReferenceToMarkdown } from "./api-reference-markdown"
import { cliCommandDetailsToMarkdown } from "./cli-command-details-markdown"

/**
 * Markdown mirror of the code-aware components in `mdx-components.tsx`.
 *
 * Each entry maps a JSX tag name to an async renderer that turns the tag's
 * string-literal attributes into a Markdown string. Only the two components
 * whose output is generated from source (`ApiReference`, `CliCommandDetails`)
 * are registered; every other JSX element is degraded to its children by the
 * expand plugin.
 */
export const markdownComponentRegistry: Record<
  string,
  (attrs: Record<string, string>) => Promise<string>
> = {
  ApiReference: (attrs) =>
    apiReferenceToMarkdown({ file: attrs.file ?? "", name: attrs.name }),
  CliCommandDetails: (attrs) =>
    cliCommandDetailsToMarkdown({ command: attrs.command ?? "" }),
}
