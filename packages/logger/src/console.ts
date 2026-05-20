import { SYMBOLS } from "./constants"

export const success = (message: string) => `${SYMBOLS.Tick} ${message}`

export const error = (message: string) => `${SYMBOLS.Cross} ${message}`
