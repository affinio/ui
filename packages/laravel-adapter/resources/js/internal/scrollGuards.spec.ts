import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { registerScrollGuards } from "./scrollGuards"

describe("registerScrollGuards", () => {
  beforeEach(() => {
    ;(window as unknown as Record<string, unknown>).__affinoScrollGuardsRegistered = undefined
    ;(window as unknown as Record<string, unknown>).__affinoScrollGuardsDiagnostics = undefined
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

  it("keeps processing other roots when shouldClose throws", () => {
    const badRoot = document.createElement("div")
    badRoot.dataset.affinoTooltipState = "open"
    badRoot.dataset.throwShouldClose = "true"
    document.body.appendChild(badRoot)

    const goodRoot = document.createElement("div")
    goodRoot.dataset.affinoTooltipState = "open"
    document.body.appendChild(goodRoot)

    let closedCount = 0
    registerScrollGuards([
      {
        selector: "[data-affino-tooltip-state='open']",
        shouldClose: (root) => {
          if (root.dataset.throwShouldClose === "true") {
            throw new Error("bad shouldClose")
          }
          return true
        },
        close: () => {
          closedCount += 1
        },
      },
    ])

    window.dispatchEvent(new Event("scroll"))

    expect(closedCount).toBe(1)
    const diagnostics = (window as unknown as Record<string, any>).__affinoScrollGuardsDiagnostics
    expect(diagnostics?.errorCount).toBe(1)
    expect(diagnostics?.lastError?.phase).toBe("should-close")
  })

  it("keeps processing when selector is invalid and close throws", () => {
    const root = document.createElement("div")
    root.dataset.affinoTooltipState = "open"
    document.body.appendChild(root)

    let closeAttempts = 0
    registerScrollGuards([
      {
        selector: "[",
        shouldClose: () => true,
        close: () => {
          throw new Error("invalid selector target should never close")
        },
      },
      {
        selector: "[data-affino-tooltip-state='open']",
        shouldClose: () => true,
        close: () => {
          closeAttempts += 1
          throw new Error("close failure")
        },
      },
    ])

    window.dispatchEvent(new Event("scroll"))
    window.dispatchEvent(new Event("scroll"))

    expect(closeAttempts).toBe(2)
    const diagnostics = (window as unknown as Record<string, any>).__affinoScrollGuardsDiagnostics
    expect(diagnostics?.errorCount).toBeGreaterThanOrEqual(3)
    expect(diagnostics?.lastError).toBeTruthy()
  })

  it("falls back when requestAnimationFrame is unavailable", () => {
    vi.useFakeTimers()
    vi.stubGlobal("requestAnimationFrame", undefined)
    ;(window as unknown as Record<string, unknown>).__affinoScrollGuardsRegistered = undefined

    const root = document.createElement("div")
    root.dataset.affinoTooltipState = "open"
    document.body.appendChild(root)

    let closedCount = 0
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
    expect(closedCount).toBe(0)

    vi.advanceTimersByTime(20)
    expect(closedCount).toBe(1)

    vi.useRealTimers()
  })
})
