import { tegami } from "tegami"
import { runCli } from "tegami/cli"
import { github } from "tegami/plugins/github"

const paper = tegami({
  npm: {
    updateLockFile: true,
  },
  plugins: [
    github({
      repo: "noxify/lakeql",
      versionPr: {
        base: "main",
      },
    }),
  ],
})

await runCli(paper)
