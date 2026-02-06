import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { acquireDocumentScrollLock, releaseDocumentScrollLock } from "@affino/overlay-kernel"
import { bootstrapAffinoPopovers, hydratePopover } from "./index"
import { scan } from "./popover/hydrate"

type PopoverTestRoot = HTMLDivElement & {
  affinoPopover?: {
    open(reason?: string): void
    close(reason?: string): void
  }
}

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
  vi.stubGlobal("ResizeObserver", ResizeObserverMock)
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
  vi.stubGlobal("cancelAnimationFrame", () => {})
})

afterEach(() => {
  document.body.innerHTML = ""
  delete (window as any).__affinoPopoverObserver
  delete (window as any).__affinoPopoverLivewireHooked
  releaseDocumentScrollLock(document, "popover")
  releaseDocumentScrollLock(document, "menu")
  document.documentElement.style.overflow = ""
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

function setupPopoverFixture(options?: { lockScroll?: boolean }) {
  const root = document.createElement("div") as PopoverTestRoot
  root.dataset.affinoPopoverRoot = "popover-spec"
  root.dataset.affinoPopoverLockScroll = options?.lockScroll ? "true" : "false"

  const trigger = document.createElement("button")
  trigger.type = "button"
  trigger.dataset.affinoPopoverTrigger = ""
  root.appendChild(trigger)

  const content = document.createElement("div")
  content.dataset.affinoPopoverContent = ""
  content.hidden = true
  root.appendChild(content)

  mockRect(trigger, { x: 120, y: 100, width: 80, height: 40 })
  mockRect(content, { x: 0, y: 0, width: 160, height: 90 })

  document.body.appendChild(root)
  return { root, trigger, content }
}

describe("@affino/popover-laravel public API", () => {
  it("exposes bootstrapAffinoPopovers", () => {
    expect(typeof bootstrapAffinoPopovers).toBe("function")
  })

  it("exposes hydratePopover", () => {
    expect(typeof hydratePopover).toBe("function")
  })

  it("bootstraps without Livewire present", () => {
    delete (window as any).Livewire
    setupPopoverFixture()
    expect(() => bootstrapAffinoPopovers()).not.toThrow()
  })
})

describe("hydratePopover", () => {
  it("is idempotent and does not duplicate trigger handlers", () => {
    const { root, trigger, content } = setupPopoverFixture()
    hydratePopover(root as any)
    hydratePopover(root as any)

    trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }))

    expect(content.hidden).toBe(false)
    expect(root.dataset.affinoPopoverState).toBe("open")
  })

  it("rehydrates only on structural changes", () => {
    const { root, trigger } = setupPopoverFixture()
    hydratePopover(root as any)
    const handleBefore = root.affinoPopover

    root.appendChild(document.createTextNode(" text mutation "))
    scan(root)
    expect(root.affinoPopover).toBe(handleBefore)

    const nextTrigger = document.createElement("button")
    nextTrigger.type = "button"
    nextTrigger.dataset.affinoPopoverTrigger = ""
    mockRect(nextTrigger, { x: 120, y: 100, width: 80, height: 40 })
    trigger.replaceWith(nextTrigger)
    scan(root)
    expect(root.affinoPopover).not.toBe(handleBefore)
  })

  it("respects initial open state from data-affino-popover-state", () => {
    const { root, content } = setupPopoverFixture()
    root.dataset.affinoPopoverState = "open"
    content.hidden = false
    content.dataset.state = "open"

    hydratePopover(root as any)

    expect(content.hidden).toBe(false)
    expect(root.dataset.affinoPopoverState).toBe("open")
    expect(content.dataset.state).toBe("open")
  })

  it("syncs open state from data-affino-popover-state updates", async () => {
    const { root, content } = setupPopoverFixture()
    hydratePopover(root as any)
    expect(content.hidden).toBe(true)

    root.dataset.affinoPopoverState = "open"
    await Promise.resolve()
    expect(content.hidden).toBe(false)

    root.dataset.affinoPopoverState = "closed"
    await Promise.resolve()
    expect(content.hidden).toBe(true)
  })

  it("keeps document scroll locked when another overlay source still holds lock", () => {
    const { root } = setupPopoverFixture({ lockScroll: true })
    acquireDocumentScrollLock(document, "menu")
    hydratePopover(root as any)

    root.affinoPopover?.open("programmatic")
    expect(document.documentElement.style.overflow).toBe("hidden")

    root.affinoPopover?.close("programmatic")
    expect(document.documentElement.style.overflow).toBe("hidden")

    releaseDocumentScrollLock(document, "menu")
    expect(document.documentElement.style.overflow).toBe("")
  })

  it("cleans up handle when root is removed from document", async () => {
    const { root } = setupPopoverFixture()
    bootstrapAffinoPopovers()
    expect(root.affinoPopover).toBeDefined()

    root.remove()
    await Promise.resolve()
    await Promise.resolve()

    expect(root.affinoPopover).toBeUndefined()
  })

  it("closes on click for data-affino-popover-dismiss", () => {
    const { root, trigger, content } = setupPopoverFixture()
    const dismiss = document.createElement("button")
    dismiss.type = "button"
    dismiss.dataset.affinoPopoverDismiss = "programmatic"
    content.appendChild(dismiss)

    hydratePopover(root as any)
    trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    expect(content.hidden).toBe(false)

    dismiss.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    expect(content.hidden).toBe(true)
    expect(root.dataset.affinoPopoverState).toBe("closed")
  })

  it("binds livewire hooks after late livewire:load", () => {
    setupPopoverFixture()
    delete (window as any).Livewire
    bootstrapAffinoPopovers()

    const hooks: Record<string, (...args: any[]) => void> = {}
    ;(window as any).Livewire = {
      hook: vi.fn((name: string, handler: (...args: any[]) => void) => {
        hooks[name] = handler
      }),
    }
    document.dispatchEvent(new Event("livewire:load"))

    const lateRoot = document.createElement("div") as PopoverTestRoot
    lateRoot.dataset.affinoPopoverRoot = "popover-late"
    lateRoot.innerHTML = `
      <button data-affino-popover-trigger></button>
      <div data-affino-popover-content></div>
    `
    mockRect(lateRoot.querySelector("[data-affino-popover-trigger]") as HTMLElement, { x: 50, y: 50, width: 40, height: 20 })
    mockRect(lateRoot.querySelector("[data-affino-popover-content]") as HTMLElement, { x: 0, y: 0, width: 120, height: 60 })

    hooks["morph.added"]?.({ el: lateRoot })
    expect((lateRoot as any).affinoPopover).toBeDefined()
  })

  it("rescans on livewire:navigated", () => {
    ;(window as any).Livewire = { hook: vi.fn() }
    const root = document.createElement("div") as PopoverTestRoot
    root.dataset.affinoPopoverRoot = "popover-nav"
    document.body.appendChild(root)
    bootstrapAffinoPopovers()

    expect(root.affinoPopover).toBeUndefined()
    const trigger = document.createElement("button")
    trigger.type = "button"
    trigger.dataset.affinoPopoverTrigger = ""
    const content = document.createElement("div")
    content.dataset.affinoPopoverContent = ""
    content.hidden = true
    root.appendChild(trigger)
    root.appendChild(content)
    mockRect(trigger, { x: 120, y: 100, width: 80, height: 40 })
    mockRect(content, { x: 0, y: 0, width: 160, height: 90 })

    document.dispatchEvent(new Event("livewire:navigated"))

    expect(root.affinoPopover).toBeDefined()
  })
})
