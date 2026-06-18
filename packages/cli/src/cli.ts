#!/usr/bin/env node
import { runCli } from "./run-cli.js"

// oxlint-disable-next-line promise/prefer-await-to-then
runCli().catch(() => {
  process.exit(1)
})
