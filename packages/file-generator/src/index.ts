import formatCode from "@lakeql/helpers/format-code"
import ts from "typescript"

export async function generateCode({
  fileName,
  nodes,
}: {
  fileName: string
  nodes: ts.Node[]
}) {
  const printer = ts.createPrinter({
    newLine: ts.NewLineKind.LineFeed,
    omitTrailingSemicolon: true,
  })
  const sourceFile = ts.createSourceFile(
    fileName,
    "",
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS
  )

  // Print each node and join them with double newlines
  const printedNodes = nodes
    .map((node) => printer.printNode(ts.EmitHint.Unspecified, node, sourceFile))
    .join("\n\n")

  const formattedCode = await formatCode(printedNodes)

  // Create a source file with the formatted code
  return ts.createSourceFile(
    fileName,
    formattedCode,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS
  )
}
