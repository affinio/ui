import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { registerScrollGuards } from "./scrollGuards"

describe("registerScrollGuards", () => {
  beforeEach(() => {
    ;(window as unknown as Record<string, unknown>).__affinoScrollGuardsRegistered = undefined
    document.body.innerHTML = ""
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.innerHTML = ""
  })

  it("avoids global rescans on every scroll tick", async () => {
    const root = document.createElement("div")
    root.dataset.affinoTooltipState = "open"
    document.body.appendChild(root)

    let closedCount = 0
    const querySpy = vi.spyOn(document, "querySelectorAll")

    registerScrollGuards([
      {
        selector: "[data-affino-tooltip-state='open']",
        shouldClose: () => true,
        close: () => {
          closedCount += 1
        },
      },
    ])

    window.dispatchEvent(new Event("scroll"))
    window.dispatchEvent(new Event("scroll"))
    window.dispatchEvent(new Event("scroll"))

    expect(querySpy).toHaveBeenCalledTimes(1)
    expect(closedCount).toBe(3)

    root.dataset.affinoTooltipState = "closed"
    await Promise.resolve()

    window.dispatchEvent(new Event("scroll"))

    expect(querySpy).toHaveBeenCalledTimes(2)
    expect(closedCount).toBe(3)
  })
})
