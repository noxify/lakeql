import { describe, expect, it } from "vitest"

import { announcementFor } from "@/ui/announcement"

describe("validation live-region wording (task 17, Req 12.5)", () => {
  it("announces the valid, ready-to-export state", () => {
    expect(announcementFor(true, 0)).toBe(
      "Definition is valid and ready to export."
    )
  })

  it("announces a single blocking issue in the singular", () => {
    expect(announcementFor(false, 1)).toBe(
      "Definition has 1 validation issue blocking export."
    )
  })

  it("announces multiple blocking issues in the plural", () => {
    expect(announcementFor(false, 3)).toBe(
      "Definition has 3 validation issues blocking export."
    )
  })

  it("stays silent when invalid but no diagnostics are surfaced yet", () => {
    // A transient state the gate rejects without a surfaced message should not
    // produce a confusing empty announcement.
    expect(announcementFor(false, 0)).toBe("")
  })
})
