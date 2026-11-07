// oxlint-disable react/no-unstable-nested-components
import "server-only"
import type { CommandOptionMeta } from "@lakeql/cli"
import { getCommandConfig } from "@lakeql/cli"
import { getCreateAppCommandConfig } from "@lakeql/create-app/metadata"
import { MDX as Mdx } from "renoun"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

function resolveConfig(command: string) {
  if (command === "create-app") {
    return getCreateAppCommandConfig()
  }
  return getCommandConfig(command)
}

/**
 * Escapes MDX-significant characters in CLI metadata descriptions.
 *
 * Command descriptions are plain text that may legitimately contain `{`, `}`,
 * or `<` (for example `import.config.{mjs,ts,js,json}`). Because they are
 * rendered through the MDX parser to support inline `` `code` `` spans, those
 * characters would otherwise be parsed as JSX expressions or tags and break the
 * build. Backticks are deliberately left intact so code spans still render.
 */
function escapeMdxText(text: string): string {
  return text
    .replaceAll("{", "\\{")
    .replaceAll("}", "\\}")
    .replaceAll("<", "\\<")
}

function formatDefault(opt: CommandOptionMeta): string | null {
  if (opt.defaultValueDescription) {
    return opt.defaultValueDescription
  }
  if (opt.defaultValue === undefined || opt.defaultValue === null) {
    return null
  }
  if (Array.isArray(opt.defaultValue) && opt.defaultValue.length === 0) {
    return "[]"
  }
  return JSON.stringify(opt.defaultValue)
}

interface CliCommandDetailsProps {
  /** The command name, e.g. "pull", "list-tables" */
  command: string
}

/**
 * Renders CLI command options in a structured per-option format with descriptions,
 * types, defaults, and environment variable info.
 *
 * Reads command metadata directly from @lakeql/cli/commands at build time.
 *
 * @example
 * ```mdx
 * <CliCommandDetails command="pull" />
 * ```
 */
export const CliCommandDetails = ({ command }: CliCommandDetailsProps) => {
  const config = resolveConfig(command)

  return (
    <div className="not-prose my-6 space-y-8">
      {config.arguments.length > 0 && (
        <div className="border-border border-b pb-8">
          <h3 className="text-sm font-semibold tracking-tight">Arguments</h3>
          <div className="mt-3">
            <Table variant="outline">
              <TableHeader>
                <TableRow>
                  <TableHead className="bg-muted font-semibold">Name</TableHead>
                  <TableHead className="bg-muted font-semibold">
                    Description
                  </TableHead>
                  <TableHead className="bg-muted font-semibold">
                    Required
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {config.arguments.map((arg) => (
                  <TableRow key={arg.name}>
                    <TableCell>
                      <code className="border-border bg-muted/60 rounded border px-1.5 py-0.5 font-mono text-xs">
                        {arg.required ? `<${arg.name}>` : `[${arg.name}]`}
                        {arg.variadic ? "..." : ""}
                      </code>
                    </TableCell>
                    <TableCell className="text-sm">
                      <Mdx
                        components={{
                          code: (props) => (
                            <code
                              className="bg-muted text-foreground rounded px-1 py-0.5 text-[0.85em]"
                              {...props}
                            />
                          ),
                          p: (props) => <p className="m-0" {...props} />,
                        }}
                      >
                        {escapeMdxText(arg.description)}
                      </Mdx>
                    </TableCell>
                    <TableCell className="text-sm">
                      {arg.required ? "Yes" : "No"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {config.options.map((opt) => {
        const defaultDisplay = formatDefault(opt)
        const anchorId = opt.long?.replace("--", "")

        return (
          <div
            key={opt.flags}
            className="border-border border-b pb-8 last:border-b-0 last:pb-0"
          >
            <h3
              id={anchorId}
              className="font-mono text-sm font-semibold tracking-tight"
            >
              {opt.flags}
            </h3>

            <div className="text-muted-foreground mt-2 text-sm leading-relaxed">
              <Mdx
                components={{
                  code: (props) => (
                    <code
                      className="bg-muted text-foreground rounded px-1 py-0.5 text-[0.85em]"
                      {...props}
                    />
                  ),
                }}
              >
                {escapeMdxText(opt.description)}
              </Mdx>
            </div>

            <div className="mt-3">
              <Table variant="outline">
                <TableHeader>
                  <TableRow>
                    <TableHead className="bg-muted w-28 font-semibold">
                      Property
                    </TableHead>
                    <TableHead className="bg-muted font-semibold">
                      Value
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="text-sm font-medium">Type</TableCell>
                    <TableCell>
                      <code className="border-border bg-muted/60 rounded border px-1.5 py-0.5 font-mono text-xs">
                        {opt.isBoolean ? "boolean" : "string"}
                      </code>
                    </TableCell>
                  </TableRow>
                  {opt.choices && opt.choices.length > 0 && (
                    <TableRow>
                      <TableCell className="text-sm font-medium">
                        Choices
                      </TableCell>
                      <TableCell className="flex flex-wrap gap-1.5">
                        {opt.choices.map((choice) => (
                          <code
                            key={choice}
                            className="border-border bg-muted/60 rounded border px-1.5 py-0.5 font-mono text-xs"
                          >
                            {choice}
                          </code>
                        ))}
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow>
                    <TableCell className="text-sm font-medium">
                      Required
                    </TableCell>
                    <TableCell className="text-sm">
                      {opt.required ? "Yes" : "No"}
                    </TableCell>
                  </TableRow>
                  {defaultDisplay !== null && (
                    <TableRow>
                      <TableCell className="text-sm font-medium">
                        Default
                      </TableCell>
                      <TableCell>
                        <code className="border-border bg-muted/60 rounded border px-1.5 py-0.5 font-mono text-xs">
                          {defaultDisplay}
                        </code>
                      </TableCell>
                    </TableRow>
                  )}
                  {opt.envVar && (
                    <TableRow>
                      <TableCell className="text-sm font-medium">
                        Env var
                      </TableCell>
                      <TableCell>
                        <code className="border-border bg-muted/60 rounded border px-1.5 py-0.5 font-mono text-xs">
                          {opt.envVar}
                        </code>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
