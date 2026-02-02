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
})
