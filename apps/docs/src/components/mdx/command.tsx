import type { CommandProps } from "renoun"
import { CodeBlock } from "renoun/components"

import { ClientOnly } from "@/components/client-only"
import { CommandTabsClient } from "@/components/mdx/command-client"
import {
  buildCommand,
  buildExecCommand,
  EXECUTION_MODES,
  PACKAGE_MANAGERS,
} from "@/components/mdx/command-strings"

function getChildrenText(children: React.ReactNode): string {
  const parts: string[] = []
  for (const child of Array.isArray(children) ? children : [children]) {
    if (typeof child === "string" || typeof child === "number") {
      parts.push(String(child))
    }
  }

  return parts.map((part) => part.trim()).join("")
}

export const CommandWrapper = ({ children, variant }: CommandProps) => {
  const subject = getChildrenText(children)

  if (!variant) {
    return (
      <ClientOnly>
        <CodeBlock language="shell">{subject}</CodeBlock>
      </ClientOnly>
    )
  }

  if (variant === "exec") {
    const commands = PACKAGE_MANAGERS.flatMap((packageManager) =>
      EXECUTION_MODES.map((executionMode) => ({
        content: (
          <CodeBlock language="shell">
            {buildExecCommand(packageManager, executionMode, subject)}
          </CodeBlock>
        ),
        executionMode,
        packageManager,
      }))
    )

    return <CommandTabsClient commands={commands} showExecutionMode />
  }

  const commands = PACKAGE_MANAGERS.map((packageManager) => ({
    content: (
      <CodeBlock language="shell">
        {buildCommand(packageManager, variant, subject)}
      </CodeBlock>
    ),
    packageManager,
  }))

  return <CommandTabsClient commands={commands} />
}
