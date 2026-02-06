import { describe, expect, it } from "vitest"
import { resolveOptions } from "./options"
import type { RootEl } from "./types"

function createRoot(dataset: Partial<RootEl["dataset"]> = {}): RootEl {
  const root = document.createElement("div") as RootEl
  const rootDataset = root.dataset as Record<string, string>
  Object.entries(dataset).forEach(([key, value]) => {
    if (typeof value === "string") {
      rootDataset[key] = value
    }
  })
  return root
}

describe("popover option resolver", () => {
  it("falls back to safe defaults for invalid enum-like values", () => {
    const root = createRoot({
      affinoPopoverPlacement: "diagonal",
      affinoPopoverAlign: "outer",
      affinoPopoverRole: "tooltip",
      affinoPopoverStrategy: "sticky",
    })

    const options = resolveOptions(root)

    expect(options.placement).toBe("bottom")
    expect(options.align).toBe("center")
    expect(options.role).toBe("dialog")
    expect(options.strategy).toBe("fixed")
  })

  it("parses known enum-like values", () => {
    const root = createRoot({
      affinoPopoverPlacement: "left",
      affinoPopoverAlign: "end",
      affinoPopoverRole: "region",
      affinoPopoverStrategy: "absolute",
    })

    const options = resolveOptions(root)

    expect(options.placement).toBe("left")
    expect(options.align).toBe("end")
    expect(options.role).toBe("region")
    expect(options.strategy).toBe("absolute")
  })

  it("clamps numeric options and normalizes arrow config", () => {
    const root = createRoot({
      affinoPopoverGutter: "-20",
      affinoPopoverViewportPadding: "-4",
      affinoPopoverArrowSize: "-2",
      affinoPopoverArrowInset: "-8",
      affinoPopoverArrowOffset: "14",
    })

    const options = resolveOptions(root)

    expect(options.gutter).toBe(0)
    expect(options.viewportPadding).toBe(0)
    expect(options.arrow).toEqual({
      size: 1,
      inset: 0,
      staticOffset: 14,
    })
  })

  it("returns null arrow options when all arrow values are missing/invalid", () => {
    const root = createRoot({
      affinoPopoverArrowSize: "nan",
      affinoPopoverArrowInset: "invalid",
      affinoPopoverArrowOffset: "none",
    })

    const options = resolveOptions(root)

    expect(options.arrow).toBeNull()
  })
})
