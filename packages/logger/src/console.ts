import { SYMBOLS } from "./constants"

export const success = (message: string) => `${SYMBOLS.Tick} ${message}`

export const error = (message: string) => `${SYMBOLS.Cross} ${message}`

export const info = (message: string) => `${SYMBOLS.Pointer} ${message}`

export const warning = (message: string) => `${SYMBOLS.Active} ${message}`
