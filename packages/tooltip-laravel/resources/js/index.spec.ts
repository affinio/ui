import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { hydrateTooltip } from "./index"

class ResizeObserverMock {
  constructor(_callback: unknown) {}
  observe() {}
  disconnect() {}
}

type RectInit = {
  x?: number
  y?: number
  width?: number
  height?: number
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal("ResizeObserver", ResizeObserverMock)
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
  vi.stubGlobal("cancelAnimationFrame", () => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function createRect(init: RectInit): DOMRect {
  const { x = 0, y = 0, width = 0, height = 0 } = init
  return {
    x,
    y,
    width,
    height,
    top: y,
    left: x,
    right: x + width,
    bottom: y + height,
    toJSON: () => ({ x, y, width, height, top: y, left: x, right: x + width, bottom: y + height }),
  } as DOMRect
}

function mockRect(element: HTMLElement, rectInit: RectInit) {
  const rect = createRect(rectInit)
  Object.defineProperty(element, "getBoundingClientRect", {
    value: vi.fn(() => rect),
    configurable: true,
  })
}

function setupTooltipFixture() {
  const root = document.createElement("div")
  root.dataset.affinoTooltipRoot = "spec-tooltip"
  root.dataset.affinoTooltipPlacement = "top"
  root.dataset.affinoTooltipAlign = "center"
  root.dataset.affinoTooltipGutter = "12"
  root.dataset.affinoTooltipOpenDelay = "0"
  root.dataset.affinoTooltipCloseDelay = "0"

  const trigger = document.createElement("div")
  trigger.dataset.affinoTooltipTrigger = ""
  root.appendChild(trigger)

  const surface = document.createElement("div")
  surface.dataset.affinoTooltipSurface = ""
  surface.dataset.state = "closed"
  surface.hidden = true
  root.appendChild(surface)

  mockRect(trigger, { x: 480, y: 320, width: 160, height: 48 })
  mockRect(surface, { x: 0, y: 0, width: 220, height: 110 })

  return { root, trigger, surface }
}

describe("hydrateTooltip", () => {
  it("positions the surface using the declarative placement", () => {
    const { root, trigger, surface } = setupTooltipFixture()
    hydrateTooltip(root as HTMLElement & { dataset: DOMStringMap })

    trigger.dispatchEvent(new Event("pointerenter"))
    vi.runAllTimers()

    expect(surface.hidden).toBe(false)
    expect(surface.dataset.state).toBe("open")
    expect(surface.dataset.placement).toBe("top")
    expect(surface.dataset.align).toBe("center")
    expect(surface.style.left).toBe("450px")
    expect(surface.style.top).toBe("198px")
  })

  it("respects initial open state from data-affino-tooltip-state", () => {
    const { root, surface } = setupTooltipFixture()
    root.dataset.affinoTooltipState = "open"
    surface.hidden = false
    surface.dataset.state = "open"

    hydrateTooltip(root as HTMLElement & { dataset: DOMStringMap })
    vi.runAllTimers()

    expect(surface.hidden).toBe(false)
    expect(root.dataset.affinoTooltipState).toBe("open")
    expect(surface.dataset.state).toBe("open")
  })

  it("syncs tooltip open state from dom state attribute updates", async () => {
    const { root, surface } = setupTooltipFixture()
    hydrateTooltip(root as HTMLElement & { dataset: DOMStringMap })
    expect(surface.hidden).toBe(true)

    root.dataset.affinoTooltipState = "open"
    await Promise.resolve()
    vi.runAllTimers()
    expect(surface.hidden).toBe(false)

    root.dataset.affinoTooltipState = "closed"
    await Promise.resolve()
    vi.runAllTimers()
    expect(surface.hidden).toBe(true)
  })

  it("keeps tooltip open on pointer leave when pinned", () => {
    const { root, trigger, surface } = setupTooltipFixture()
    root.dataset.affinoTooltipPinned = "true"

    hydrateTooltip(root as HTMLElement & { dataset: DOMStringMap })
    trigger.dispatchEvent(new Event("pointerenter"))
    vi.runAllTimers()
    expect(surface.hidden).toBe(false)

    trigger.dispatchEvent(new Event("pointerleave"))
    vi.runAllTimers()

    expect(surface.hidden).toBe(false)
    expect(root.dataset.affinoTooltipState).toBe("open")
    expect(surface.dataset.state).toBe("open")
  })

  it("restores focus to the new trigger after structure rehydrate", () => {
    const { root, trigger, surface } = setupTooltipFixture()
    trigger.tabIndex = 0
    document.body.appendChild(root)

    hydrateTooltip(root as HTMLElement & { dataset: DOMStringMap })

    trigger.focus()
    trigger.dispatchEvent(new FocusEvent("focusin", { bubbles: true }))

    const nextTrigger = document.createElement("div")
    nextTrigger.dataset.affinoTooltipTrigger = ""
    nextTrigger.tabIndex = 0
    mockRect(nextTrigger, { x: 500, y: 330, width: 120, height: 40 })
    trigger.replaceWith(nextTrigger)
    mockRect(surface, { x: 0, y: 0, width: 220, height: 110 })

    hydrateTooltip(root as HTMLElement & { dataset: DOMStringMap })
    vi.runAllTimers()

    expect(document.activeElement).toBe(nextTrigger)
  })
})
