import fs from "fs/promises"
import path from "path"

import { cli } from "cleye"
import { Files } from "files-sdk"
import { s3 } from "files-sdk/s3"

const parsed = cli({
  name: "generate-test-data",

  flags: {
    bucket: {
      type: String,
      alias: "b",
      default: "minitrino",
      description: `Optional - The minio bucket to use`,
    },

    source: {
      type: String,
      alias: "s",
      description: "Required - the source file to upload",
    },

    target: {
      type: String,
      alias: "t",
      description: "Required - the target path",
    },
  },
  strictFlags: true,
})

async function syncFile(props: typeof parsed.flags) {
  const files = new Files({
    adapter: s3({
      bucket: props.bucket,
      region: "us-east-1",
      endpoint: "http://localhost:9000",
      credentials: { accessKeyId: "access-key", secretAccessKey: "secret-key" },
    }),
  })

  if (!props.source || !props.target) {
    console.error("Source and/or target are missing.")
    process.exit(1)
  }

  // INIT_CWD is set by pnpm/npm to the directory from which the command was invoked
  const root = process.env["INIT_CWD"] ?? process.cwd()
  const source = path.resolve(root, props.source)

  const file = await fs.readFile(source)

  const sourceFileName = path.basename(source)

  const uploaded = await files.upload(
    path.join(props.target, sourceFileName),
    file
  )

  process.exit(0)
}

syncFile(parsed.flags).catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error)
  process.exit(1)
})
