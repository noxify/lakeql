import path from "node:path"

export function getInvocationCwd() {
  // `INIT_CWD` points to the original shell cwd when running via npm/pnpm scripts.
  // eslint-disable-next-line no-restricted-properties
  return process.env.INIT_CWD ?? process.cwd()
}

export function resolveFromInvocationCwd(targetPath: string) {
  if (path.isAbsolute(targetPath)) {
    return targetPath
  }

  return path.resolve(getInvocationCwd(), targetPath)
}
