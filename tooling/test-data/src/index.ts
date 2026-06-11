import fs from "node:fs/promises"
import path from "node:path"

import { faker } from "@faker-js/faker"
import { cli } from "cleye"
import { parquetWriteFile } from "hyparquet-writer"

import { jsonSchemaToHyparquetSchema } from "./helpers.js"

const datasets = ["simple", "complex"] as const

type Datasets = (typeof datasets)[number]

const Dataset = (dataset: Datasets) => {
  if (!datasets.includes(dataset)) {
    throw new Error(`Invalid dataset: "${dataset}"`)
  }

  return dataset
}

const parsed = cli({
  name: "generate-test-data",

  flags: {
    dataset: {
      type: Dataset,
      alias: "d",
      description: `Required - The dataset to generate. Allowed datasets are: ${datasets.join(", ")}`,
    },
    amount: {
      type: Number,
      alias: "a",
      default: 1000,
      description:
        "Optional - The amount of records to generate. Default: 1000",
    },
    clean: {
      type: Boolean,
      alias: "c",
      default: false,
      description:
        "Optional - Whether to clean the output directory before generating the dataset: Default: false",
    },
    path: {
      type: String,
      alias: "p",
      description:
        "Required - The path where the generated dataset should be saved.",
    },
  },
  strictFlags: true,
})

async function generateTestData(props: typeof parsed.flags) {
  if (!props.dataset) {
    throw new Error("Please provide a dataset using the --dataset / -d flag.")
  }

  if (!props.path) {
    throw new Error("Please provide a path using the --path / -p flag.")
  }

  switch (props.dataset) {
    case "simple": {
      await simpleDataset({
        amount: props.amount,
        targetPath: props.path,
        clean: props.clean,
        dataset: props.dataset,
      })
      break
    }

    case "complex": {
      await complexDataset({
        amount: props.amount,
        targetPath: props.path,
        clean: props.clean,
        dataset: props.dataset,
      })
      break
    }

    default: {
      break
    }
  }
}

async function prepareTargetDir(targetPath: string, clean: boolean) {
  // INIT_CWD is set by pnpm/npm to the directory from which the command was invoked
  // oxlint-disable-next-line no-restricted-properties
  const root = process.env["INIT_CWD"] ?? process.cwd()
  const targetDir = path.resolve(root, targetPath)

  if (clean) {
    await fs.rm(targetDir, { recursive: true, force: true })
  }

  await fs.mkdir(targetDir, { recursive: true })

  return targetDir
}

const simpleSchema = jsonSchemaToHyparquetSchema({
  type: "object",
  properties: {
    name: {
      type: "string",
    },
    quantity: {
      type: "integer",
    },
    price: {
      type: "number",
    },
    date: {
      type: "string",
      format: "date-time",
    },
    in_stock: {
      type: "boolean",
    },
  },
  required: ["name", "quantity", "price", "date", "in_stock"],
})

const complexSchema = jsonSchemaToHyparquetSchema({
  type: "object",
  properties: {
    name: {
      type: "string",
    },
    colours: {
      type: "array",
      items: {
        type: "string",
      },
    },
    stock: {
      type: "array",
      items: {
        type: "object",
        properties: {
          price: {
            type: "number",
          },
          quantity: {
            type: "integer",
          },
        },
        required: ["price", "quantity"],
      },
    },
  },
  required: ["name"],
})

async function simpleDataset({
  amount,
  targetPath,
  clean,
  dataset,
}: {
  amount: number
  targetPath: string
  clean: boolean
  dataset: Datasets
}) {
  const targetDir = await prepareTargetDir(targetPath, clean)

  // eslint-disable-next-line no-console
  console.log(
    `Generating simple dataset "${dataset}" with ${amount} records to ${targetDir}...`
  )

  const name: string[] = []
  const quantity: bigint[] = []
  const price: number[] = []
  const date: Date[] = []
  const inStock: boolean[] = []

  for (let i = 0; i < amount; i += 1) {
    name.push(`item-${i}`)
    quantity.push(BigInt(i * 10))
    price.push(i * 0.5)
    date.push(new Date())
    inStock.push(i % 2 === 0)
  }

  parquetWriteFile({
    filename: path.join(targetDir, `${dataset}.parquet`),
    schema: simpleSchema,
    columnData: [
      { name: "name", data: name },
      { name: "quantity", data: quantity },
      { name: "price", data: price },
      { name: "date", data: date },
      { name: "in_stock", data: inStock },
    ],
  })
}

async function complexDataset({
  amount,
  targetPath,
  clean,
  dataset,
}: {
  amount: number
  targetPath: string
  clean: boolean
  dataset: Datasets
}) {
  const targetDir = await prepareTargetDir(targetPath, clean)

  // eslint-disable-next-line no-console
  console.log(
    `Generating complex dataset "${dataset}" with ${amount} records to ${targetDir}...`
  )

  const name: string[] = []
  const colours: string[][] = []
  const stock: { price: number; quantity: bigint }[][] = []

  for (let i = 0; i < amount; i += 1) {
    name.push(faker.commerce.productName())
    colours.push(
      Array.from({ length: faker.number.int({ min: 1, max: 4 }) }, () =>
        faker.color.human()
      )
    )
    stock.push(
      Array.from({ length: faker.number.int({ min: 1, max: 5 }) }, () => ({
        price: faker.number.float({ min: 0.5, max: 999, fractionDigits: 2 }),
        quantity: BigInt(faker.number.int({ min: 1, max: 5000 })),
      }))
    )
  }

  parquetWriteFile({
    filename: path.join(targetDir, `${dataset}.parquet`),
    schema: complexSchema,
    columnData: [
      { name: "name", data: name },
      { name: "colours", data: colours },
      { name: "stock", data: stock },
    ],
  })
}

try {
  await generateTestData(parsed.flags)
} catch (error) {
  // eslint-disable-next-line no-console
  console.error(error)
  process.exit(1)
}
