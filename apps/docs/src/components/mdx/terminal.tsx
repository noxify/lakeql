import type { ReactNode } from "react"

import {
  Terminal as BaseTerminal,
  TerminalContent,
  TerminalHeader,
  TerminalTitle,
} from "@/components/ai/terminal"

interface MdxTerminalProps {
  children: ReactNode
  title?: string
}

/**
 * MDX wrapper for the Terminal component.
 * Renders children as terminal output with ANSI color support.
 *
 * @example
 * ```mdx
 * <Terminal title="pnpm cli pull">
 * {`✔ Choose a DataSource › warehouse
 * ✔ Pull completed`}
 * </Terminal>
 * ```
 */
export const MdxTerminal = ({ children, title }: MdxTerminalProps) => {
  // Extract string content from children
  const output =
    typeof children === "string" ? children : String(children ?? "")

  return (
    <BaseTerminal output={output.trim()} isStreaming={false}>
      <TerminalHeader>
        <TerminalTitle>{title ?? "Terminal"}</TerminalTitle>
      </TerminalHeader>
      <TerminalContent />
    </BaseTerminal>
  )
}
