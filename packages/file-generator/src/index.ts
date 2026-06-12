import formatCode from "@lakeql/helpers/format-code"
import ts from "typescript"

/**
 * Parameters for generateCode.
 */
export interface GenerateCodeProps {
  /** The output file name for the generated source. */
  fileName: string
  /** The TypeScript AST nodes to print and format. */
  nodes: ts.Node[]
}

/**
 * Generates formatted TypeScript source from AST nodes.
 */
export async function generateCode({ fileName, nodes }: GenerateCodeProps) {
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
