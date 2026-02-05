import { describe, expect, it, vi } from "vitest"

vi.mock("@affino/overlay-kernel", () => ({}), { virtual: true })

async function loadHelpers() {
  return import("../dialog/hydrate")
}

describe("reason helpers", () => {
  it("normalizes unknown open reasons", async () => {
    const { toOpenReason } = await loadHelpers()
    expect(toOpenReason("unexpected" as any)).toBe("programmatic")
  })

  it("normalizes unknown close reasons", async () => {
    const { toCloseReason } = await loadHelpers()
    expect(toCloseReason("unexpected" as any)).toBe("programmatic")
  })

  it("passes through supported reasons", async () => {
    const { toOpenReason, toCloseReason } = await loadHelpers()
    expect(toOpenReason("pointer")).toBe("pointer")
    expect(toCloseReason("backdrop")).toBe("backdrop")
  })
})
