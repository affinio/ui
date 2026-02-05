/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { bootstrapAffinoTooltips, hydrateTooltip } from "./index"

class ResizeObserverMock {
  constructor(_callback: unknown) {}
  observe() {}
  disconnect() {}
}

type TooltipHandle = {
  open(reason?: string): void
  close(reason?: string): void
}

type TooltipTestRoot = HTMLDivElement & {
  affinoTooltip?: TooltipHandle
}

type RectInit = {
  x?: number
  y?: number
  width?: number
  height?: number
}

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

function createTooltipFixture(id = "tooltip-spec") {
  const root = document.createElement("div") as TooltipTestRoot
  root.dataset.affinoTooltipRoot = id
  root.dataset.affinoTooltipTriggerMode = "click"
  root.dataset.affinoTooltipOpenDelay = "0"
  root.dataset.affinoTooltipCloseDelay = "0"

  const trigger = document.createElement("button")
  trigger.dataset.affinoTooltipTrigger = ""
  root.appendChild(trigger)

  const surface = document.createElement("div")
  surface.dataset.affinoTooltipSurface = ""
  surface.hidden = true
  root.appendChild(surface)

  mockRect(trigger, { x: 10, y: 10, width: 80, height: 32 })
  mockRect(surface, { x: 0, y: 0, width: 120, height: 64 })

  document.body.appendChild(root)
  return { root, trigger, surface }
}

describe("tooltip bootstrap integration", () => {
  beforeEach(() => {
    delete (window as any).Livewire
    delete (window as any).__affinoTooltipObserver
    delete (window as any).__affinoTooltipLivewireHooked
    vi.stubGlobal("ResizeObserver", ResizeObserverMock)
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal("cancelAnimationFrame", () => {})
  })

  afterEach(() => {
    document.body.innerHTML = ""
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("exposes bootstrap/hydrate API", () => {
    expect(typeof bootstrapAffinoTooltips).toBe("function")
    expect(typeof hydrateTooltip).toBe("function")
  })

  it("bootstraps without Livewire present", () => {
    const { root } = createTooltipFixture()
    expect(() => bootstrapAffinoTooltips()).not.toThrow()
    expect(root.affinoTooltip).toBeDefined()
  })

  it("hydrates idempotently and handles click trigger once", () => {
    const { root, trigger, surface } = createTooltipFixture()
    hydrateTooltip(root as any)
    hydrateTooltip(root as any)

    trigger.click()

    expect(surface.hidden).toBe(false)
    expect(root.dataset.affinoTooltipState).toBe("open")
  })

  it("binds livewire hooks after late livewire:load", () => {
    createTooltipFixture()
    bootstrapAffinoTooltips()

    const hooks: Record<string, (...args: any[]) => void> = {}
    ;(window as any).Livewire = {
      hook: vi.fn((name: string, handler: (...args: any[]) => void) => {
        hooks[name] = handler
      }),
    }

    document.dispatchEvent(new Event("livewire:load"))

    const lateRoot = createTooltipFixture("tooltip-late").root
    hooks["morph.added"]?.({ el: lateRoot })

    expect((lateRoot as any).affinoTooltip).toBeDefined()
  })

  it("rescans on livewire:navigated", () => {
    ;(window as any).Livewire = { hook: vi.fn() }
    const root = document.createElement("div") as TooltipTestRoot
    root.dataset.affinoTooltipRoot = "tooltip-nav"
    root.dataset.affinoTooltipTriggerMode = "click"
    document.body.appendChild(root)
    bootstrapAffinoTooltips()

    expect(root.affinoTooltip).toBeUndefined()
    const trigger = document.createElement("button")
    trigger.dataset.affinoTooltipTrigger = ""
    const surface = document.createElement("div")
    surface.dataset.affinoTooltipSurface = ""
    surface.hidden = true
    root.appendChild(trigger)
    root.appendChild(surface)
    mockRect(trigger, { x: 10, y: 10, width: 80, height: 32 })
    mockRect(surface, { x: 0, y: 0, width: 120, height: 64 })

    document.dispatchEvent(new Event("livewire:navigated"))

    expect(root.affinoTooltip).toBeDefined()
  })

  it("cleans up handle after root disconnect", async () => {
    const { root } = createTooltipFixture()
    bootstrapAffinoTooltips()
    expect(root.affinoTooltip).toBeDefined()

    root.remove()
    await Promise.resolve()
    await Promise.resolve()

    expect(root.affinoTooltip).toBeUndefined()
  })
})
