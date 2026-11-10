/**
 * Builds the sentence announced to assistive technology for the current
 * validity state (Req 12.5). Kept framework-free so the wording can be
 * unit-tested without rendering and lives in one place.
 *
 * @param valid - Whether the definition is currently valid for export.
 * @param issueCount - The number of blocking diagnostics.
 * @returns A human-readable status sentence, or `""` to announce nothing.
 */
export function announcementFor(valid: boolean, issueCount: number): string {
  if (valid) {
    return "Definition is valid and ready to export."
  }
  if (issueCount === 0) {
    return ""
  }
  return `Definition has ${issueCount} validation ${
    issueCount === 1 ? "issue" : "issues"
  } blocking export.`
}
