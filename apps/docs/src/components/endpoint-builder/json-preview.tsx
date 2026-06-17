"use client"

import { Check, Copy, Download } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { OutputDefinition } from "@/lib/endpoint-types"

interface JSONPreviewProps {
  output: OutputDefinition
  showTopbar?: boolean
}

export function JSONPreview({ output, showTopbar = true }: JSONPreviewProps) {
  const [copied, setCopied] = useState(false)

  const jsonString = JSON.stringify(output, null, 2)

  async function handleCopy() {
    await navigator.clipboard.writeText(jsonString)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleDownload() {
    const blob = new Blob([jsonString], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${output.tableName || "endpoint"}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      {showTopbar && (
        <div className="border-border flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="size-2 rounded-full bg-green-500" />
            <span className="text-sm font-medium">Live Preview</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-7 gap-1.5 text-xs"
            >
              {copied ? (
                <>
                  <Check
                    className="size-3 text-green-500"
                    data-icon="inline-start"
                  />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="size-3" data-icon="inline-start" />
                  Copy
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDownload}
              className="h-7 gap-1.5 text-xs"
            >
              <Download className="size-3" data-icon="inline-start" />
              Download
            </Button>
          </div>
        </div>
      )}

      {/* JSON Content */}
      <ScrollArea className="flex-1">
        <pre className="text-foreground p-4 font-mono text-xs leading-relaxed">
          <JSONHighlight json={jsonString} />
        </pre>
      </ScrollArea>
    </div>
  )
}

function JSONHighlight({ json }: { json: string }) {
  // Simple syntax highlighting using regex
  const highlighted = json
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll(
      // oxlint-disable-next-line prefer-named-capture-group
      /("(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/gu,
      (match) => {
        let cls = "text-amber-600 dark:text-amber-400" // number
        if (match.startsWith('"')) {
          cls = match.endsWith(":")
            ? "text-blue-600 dark:text-blue-400" // key
            : "text-green-600 dark:text-green-400" // string
        } else if (/true|false/u.test(match)) {
          cls = "text-purple-600 dark:text-purple-400" // boolean
        } else if (/null/u.test(match)) {
          cls = "text-red-600 dark:text-red-400" // null
        }
        return `<span class="${cls}">${match}</span>`
      }
    )

  return (
    <code
      dangerouslySetInnerHTML={{ __html: highlighted }}
      className="block whitespace-pre"
    />
  )
}
