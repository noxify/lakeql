export const defaultReplaceList = [
  { replaceWith: "AE", searchFor: /[\u00C4\u00C6\u01FC\u01E2]/gu },
  { replaceWith: "OE", searchFor: /[\u00D6\u0152]/gu },
  { replaceWith: "UE", searchFor: /[\u00DC]/gu },
  { replaceWith: "ae", searchFor: /[\u00E4\u00E6\u01FD\u01E3]/gu },
  { replaceWith: "oe", searchFor: /[\u00F6\u0153]/gu },
  { replaceWith: "ue", searchFor: /[\u00FC]/gu },
  { replaceWith: "ss", searchFor: /[\u00DF]/gu },
]

export default function replaceSpecialCharacters(
  string: string,
  replaceList: typeof defaultReplaceList = defaultReplaceList
) {
  let value = string

  for (const replaceElement of replaceList) {
    value = value.replace(replaceElement.searchFor, replaceElement.replaceWith)
  }

  return value
}
