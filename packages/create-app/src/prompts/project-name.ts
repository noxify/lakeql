import { cancel, isCancel, text } from "@clack/prompts"

const PROJECT_NAME_REGEX = /^[a-z0-9-_]+$/u

export async function promptProjectName(): Promise<string> {
  const result = await text({
    message: "What is your project name?",
    placeholder: "my-lakeql-project",
    validate: (value) => {
      if (!value) {
        return "Project name is required"
      }
      if (!PROJECT_NAME_REGEX.test(value)) {
        return "Project name must contain only lowercase letters, numbers, hyphens, and underscores"
      }
    },
  })

  if (isCancel(result)) {
    cancel("Operation cancelled")
    process.exit(0)
  }

  return result
}

export function validateProjectName(name: string): void {
  if (!PROJECT_NAME_REGEX.test(name)) {
    cancel(
      "Project name must contain only lowercase letters, numbers, hyphens, and underscores"
    )
    process.exit(1)
  }
}
