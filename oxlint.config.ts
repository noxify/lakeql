import { defineConfig } from "oxlint"
import core from "ultracite/oxlint/core"
import next from "ultracite/oxlint/next"
import react from "ultracite/oxlint/react"
import vitest from "ultracite/oxlint/vitest"

export default defineConfig({
  extends: [core, vitest, react, next],
  ignorePatterns: [
    "apps/docs/src/components/beautiful-mermaid/**",
    ".tegami/publish-lock.yaml",
    // Vendored minitrino library — keep it byte-for-byte identical to the
    // upstream release so version upgrades stay a clean, diffable swap.
    ".minitrino/**",
  ],

  overrides: [
    {
      files: [
        "apps/docs/src/app/**/*.{ts,tsx}",
        "packages/cli/src/**/*.ts",
        "packages/query-builder/src/**/*.ts",
        "packages/trino-client/src/**/*.ts",
      ],
      rules: {
        "no-use-before-define": [
          "error",
          {
            allowNamedExports: true,
            functions: false,
            ignoreTypeReferences: true,
          },
        ],
      },
    },
    {
      // Default-export components (Next.js pages/layouts, async RSCs) are
      // idiomatically written as function declarations. Allow both forms so
      // the arrow-function preference still applies to inline/named components.
      files: ["apps/docs/**/*.{ts,tsx}"],
      rules: {
        "react/function-component-definition": [
          "error",
          {
            namedComponents: ["arrow-function", "function-declaration"],
            unnamedComponents: "arrow-function",
          },
        ],
      },
    },
  ],
  rules: {
    "jsx-a11y/prefer-tag-over-role": "off",
    "jsx-a11y/control-has-associated-label": "off",
    "func-style": "off",
    "no-console": "error",
    "no-inline-comments": "off",
    "no-nested-ternary": "off",
    // Keep disabled globally; re-enable selectively via overrides for runtime-heavy paths.
    "no-use-before-define": "off",
    "no-restricted-imports": [
      "error",
      {
        importNames: ["env"],
        message:
          "Use `import { env } from '~/env'` instead to ensure validated types.",
        name: "process",
      },
    ],
    "no-restricted-properties": [
      "error",
      {
        message:
          "Use `import { env } from '~/env'` instead to ensure validated types.",
        object: "process",
        property: "env",
      },
    ],
    "require-await": "off",
    "sort-keys": "off",
    "unicorn/no-nested-ternary": "off",
  },
})
