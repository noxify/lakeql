// https://tsplay.dev/wE2AVN
export const swap = <T extends Record<string, S>, S extends string>(obj: T) => {
  const res = {} as Record<string, string>
  for (const [key, value] of Object.entries(obj)) {
    res[value] = key
  }
  return res as { [K in keyof T as T[K]]: K }
}

export const isObject = (obj: unknown) =>
  (obj ?? false).constructor.name === "Object"
