import { createRequire } from "node:module"

import * as prettier from "prettier"

const require = createRequire(import.meta.url)

const prettierConfig = {
  arrowParens: "always" as const,
  endOfLine: "lf" as const,
  importOrder: [
    "<TYPES>",
    "^(react/(.*)$)|^(react$)|^(react-native(.*)$)",
    "^(next/(.*)$)|^(next$)",
    "^(expo(.*)$)|^(expo$)",
    "<THIRD_PARTY_MODULES>",
    "",
    "<TYPES>^@lakeql",
    "^@lakeql/(.*)$",
    "",
    "<TYPES>^[.|..|~|@]",
    "^~/",
    "^@/",
    "^[../]",
    "^[./]",
  ],
  importOrderParserPlugins: ["typescript", "jsx", "decorators-legacy"],
  importOrderTypeScriptVersion: "4.4.0",
  overrides: [
    {
      files: "*.json.hbs",
      options: {
        parser: "json",
      },
    },
    {
      files: "*.js.hbs",
      options: {
        parser: "babel",
      },
    },
  ],
  plugins: [require.resolve("@ianvs/prettier-plugin-sort-imports")],
  printWidth: 100,
  semi: false,
  tabWidth: 2,
  trailingComma: "es5" as const,
  useTabs: false,
}

export default async function formatCode(value: string) {
  try {
    return await prettier.format(value, {
      ...prettierConfig,
      parser: "typescript",
    })
  } catch {
    // oxlint-disable-next-line no-console
    console.error("Unable to format the code - fallback to given value")
    return value
  }
}
