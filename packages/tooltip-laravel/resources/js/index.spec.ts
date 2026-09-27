import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { hydrateTooltip, setupPointerGuards } from "./tooltip/hydrate"
import { focusedTooltipIds, registry } from "./tooltip/registry"
import type { RootEl } from "./tooltip/types"

const resizeObserverCallbacks: ResizeObserverCallback[] = []
const resizeObservedElements: Element[] = []
let resizeObserverDisconnects = 0
let fixtureCounter = 0
const hydratedRoots = new Set<RootEl>()

class ResizeObserverMock {
  constructor(private readonly callback: ResizeObserverCallback) { resizeObserverCallbacks.push(callback) }
  observe(target: Element) { resizeObservedElements.push(target) }
  disconnect() { resizeObserverDisconnects += 1 }
  trigger() { this.callback([], this as unknown as ResizeObserver) }
}

type RectInit = {
  x?: number
  y?: number
  width?: number
  height?: number
}

beforeEach(() => {
  resizeObserverCallbacks.length = 0
  resizeObservedElements.length = 0
  resizeObserverDisconnects = 0
  vi.useFakeTimers()
  vi.stubGlobal("ResizeObserver", ResizeObserverMock)
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
  vi.stubGlobal("cancelAnimationFrame", () => {})
})

afterEach(() => {
  hydratedRoots.forEach((root) => registry.get(root)?.())
  hydratedRoots.clear()
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
  root.dataset.affinoTooltipRoot = `spec-tooltip-${++fixtureCounter}`
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
  hydratedRoots.add(root as RootEl)

  return { root, trigger, surface }
}

describe("hydrateTooltip", () => {
  it("wires ARIA and keyboard focus to the actual focusable control", () => {
    const { root, trigger, surface } = setupTooltipFixture()
    const button = document.createElement("button")
    button.setAttribute("aria-describedby", "field-help")
    trigger.appendChild(button)
    document.body.appendChild(root)

    hydrateTooltip(root as HTMLElement & { dataset: DOMStringMap })

    expect(button.getAttribute("aria-describedby")).toBe(`field-help ${surface.id}`)
    expect(trigger.hasAttribute("aria-describedby")).toBe(false)
    expect(trigger.hasAttribute("tabindex")).toBe(false)
    button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }))
    expect(root.dataset.affinoTooltipState).toBe("open")
    expect(surface.getAttribute("aria-hidden")).toBe("false")
    button.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: document.body }))
    expect(root.dataset.affinoTooltipState).toBe("closed")
  })

  it("bounds zero-size measurement retries and cancels them on close", () => {
    const { root, surface } = setupTooltipFixture()
    document.body.appendChild(root)
    mockRect(surface, { x: 0, y: 0, width: 0, height: 0 })
    const frames: FrameRequestCallback[] = []
    const requestFrame = vi.fn((callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
    const cancelFrame = vi.fn()
    vi.stubGlobal("requestAnimationFrame", requestFrame)
    vi.stubGlobal("cancelAnimationFrame", cancelFrame)
    const typedRoot = root as HTMLElement & { affinoTooltip?: { open(): void; close(): void } }

    hydrateTooltip(typedRoot)
    typedRoot.affinoTooltip?.open()
    for (let index = 0; index < frames.length; index += 1) frames[index]?.(0)
    expect(requestFrame).toHaveBeenCalledTimes(3)

    typedRoot.affinoTooltip?.close()
    typedRoot.affinoTooltip?.open()
    typedRoot.affinoTooltip?.close()
    expect(cancelFrame).toHaveBeenCalled()
    expect(surface.hidden).toBe(true)
  })

  it("uses safe geometry defaults for invalid dataset options", () => {
    const { root, surface } = setupTooltipFixture()
    root.dataset.affinoTooltipPlacement = "diagonal"
    root.dataset.affinoTooltipAlign = "spread"
    root.dataset.affinoTooltipStrategy = "sticky"
    root.dataset.affinoTooltipGutter = "-10"
    document.body.appendChild(root)
    const typedRoot = root as HTMLElement & { affinoTooltip?: { open(): void } }

    hydrateTooltip(typedRoot)
    typedRoot.affinoTooltip?.open()

    expect(surface.style.position).toBe("fixed")
    expect(surface.dataset.placement).toBe("top")
    expect(surface.dataset.align).toBe("center")
    expect(surface.style.top).toBe("202px")
  })

  it("coalesces scroll and viewport relayout while open", () => {
    const { root, trigger, surface } = setupTooltipFixture()
    document.body.appendChild(root)
    const frames: FrameRequestCallback[] = []
    const requestFrame = vi.fn((callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
    const cancelFrame = vi.fn()
    vi.stubGlobal("requestAnimationFrame", requestFrame)
    vi.stubGlobal("cancelAnimationFrame", cancelFrame)
    const typedRoot = root as HTMLElement & { affinoTooltip?: { open(): void; close(): void } }

    hydrateTooltip(typedRoot)
    typedRoot.affinoTooltip?.open()
    frames.shift()?.(0)
    const measuredBeforeRelayout = vi.mocked(trigger.getBoundingClientRect).mock.calls.length
    const scroller = document.createElement("div")
    document.body.appendChild(scroller)
    scroller.dispatchEvent(new Event("scroll", { bubbles: true }))
    window.dispatchEvent(new Event("resize"))
    scroller.dispatchEvent(new Event("scroll", { bubbles: true }))
    resizeObserverCallbacks[0]?.([], {} as ResizeObserver)
    expect(resizeObservedElements).toContain(trigger)
    expect(resizeObservedElements).toContain(surface)
    expect(requestFrame).toHaveBeenCalledTimes(2)
    frames.shift()?.(0)
    expect(vi.mocked(trigger.getBoundingClientRect).mock.calls.length).toBe(measuredBeforeRelayout + 1)

    scroller.dispatchEvent(new Event("scroll", { bubbles: true }))
    const queuedRelayout = frames.shift()
    const measuredBeforeClose = vi.mocked(trigger.getBoundingClientRect).mock.calls.length
    typedRoot.affinoTooltip?.close()
    expect(cancelFrame).toHaveBeenCalled()
    queuedRelayout?.(0)
    expect(vi.mocked(trigger.getBoundingClientRect).mock.calls.length).toBe(measuredBeforeClose)
    scroller.remove()
    expect(surface.hidden).toBe(true)
  })

  it("observes element sizes only while open", () => {
    const { root } = setupTooltipFixture()
    document.body.appendChild(root)
    const handle = root as HTMLElement & { affinoTooltip?: { open(): void; close(): void } }
    hydrateTooltip(handle)
    expect(resizeObserverCallbacks).toHaveLength(0)
    handle.affinoTooltip?.open()
    expect(resizeObserverCallbacks).toHaveLength(1)
    handle.affinoTooltip?.close()
    expect(resizeObserverDisconnects).toBe(1)
  })

  it("positions the surface using the declarative placement", () => {
    const { root, trigger, surface } = setupTooltipFixture()
    document.body.appendChild(root)
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

  it("keeps the surface hovered and cancels pending close", () => {
    const { root, trigger, surface } = setupTooltipFixture()
    document.body.appendChild(root)
    const handle = root as HTMLElement & { affinoTooltip?: { open(): void; getSnapshot(): { open: boolean } } }
    hydrateTooltip(handle)
    handle.affinoTooltip?.open()
    trigger.dispatchEvent(new Event("pointerleave"))
    surface.dispatchEvent(new Event("pointerenter"))
    vi.runAllTimers()
    expect(handle.affinoTooltip?.getSnapshot().open).toBe(true)
    expect(surface.hasAttribute("on-pointer-enter")).toBe(false)
  })

  it("destroys pending core work during teardown", () => {
    const { root, trigger } = setupTooltipFixture()
    document.body.appendChild(root)
    const handle = root as HTMLElement & { affinoTooltip?: { getSnapshot(): { open: boolean } } }
    hydrateTooltip(handle)
    const oldHandle = handle.affinoTooltip
    trigger.dispatchEvent(new Event("pointerenter"))
    registry.get(handle as never)?.()
    vi.runAllTimers()
    expect(oldHandle?.getSnapshot().open).toBe(false)
  })

  it("dismisses the active tooltip on Escape", () => {
    const { root } = setupTooltipFixture()
    document.body.appendChild(root)
    const handle = root as HTMLElement & { affinoTooltip?: { open(): void; getSnapshot(): { open: boolean } } }
    hydrateTooltip(handle)
    setupPointerGuards()
    handle.affinoTooltip?.open()
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))
    expect(handle.affinoTooltip?.getSnapshot().open).toBe(false)
  })

  it("clamps placement against the owning window viewport", () => {
    const { root, trigger, surface } = setupTooltipFixture()
    root.dataset.affinoTooltipPlacement = "bottom"
    root.dataset.affinoTooltipAlign = "start"
    vi.mocked(trigger.getBoundingClientRect).mockReturnValue({ x: 900, y: 740, width: 60, height: 20 } as DOMRect)
    vi.mocked(surface.getBoundingClientRect).mockReturnValue({ x: 0, y: 0, width: 200, height: 80 } as DOMRect)
    document.body.appendChild(root)
    const handle = root as HTMLElement & { affinoTooltip?: { open(): void } }
    hydrateTooltip(handle)
    handle.affinoTooltip?.open()
    expect(parseFloat(surface.style.left) + 200).toBeLessThanOrEqual(window.innerWidth)
    expect(parseFloat(surface.style.top) + 80).toBeLessThanOrEqual(window.innerHeight)
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

  it("does not restore tracked focus when user already focused outside tooltip root", () => {
    const { root, trigger, surface } = setupTooltipFixture()
    root.dataset.affinoTooltipRoot = "tooltip-no-steal"
    trigger.tabIndex = 0
    document.body.appendChild(root)

    hydrateTooltip(root as HTMLElement & { dataset: DOMStringMap })
    focusedTooltipIds.add("tooltip-no-steal")

    const outside = document.createElement("button")
    outside.type = "button"
    document.body.appendChild(outside)
    outside.focus()

    const nextTrigger = document.createElement("div")
    nextTrigger.dataset.affinoTooltipTrigger = ""
    nextTrigger.tabIndex = 0
    mockRect(nextTrigger, { x: 500, y: 330, width: 120, height: 40 })
    trigger.replaceWith(nextTrigger)
    mockRect(surface, { x: 0, y: 0, width: 220, height: 110 })

    hydrateTooltip(root as HTMLElement & { dataset: DOMStringMap })
    vi.runAllTimers()

    expect(document.activeElement).toBe(outside)
    expect(focusedTooltipIds.has("tooltip-no-steal")).toBe(false)
  })

  it("cleans up stale handle when required tooltip structure is missing", () => {
    const { root, surface } = setupTooltipFixture()
    const typedRoot = root as HTMLElement & { affinoTooltip?: unknown }

    hydrateTooltip(typedRoot)
    expect(typedRoot.affinoTooltip).toBeDefined()

    surface.remove()
    hydrateTooltip(typedRoot)

    expect(typedRoot.affinoTooltip).toBeUndefined()
    expect(root.dataset.affinoTooltipState).toBe("closed")
  })

  it("keeps aria wiring synced across open/close and surface id changes", async () => {
    const { root, trigger, surface } = setupTooltipFixture()
    hydrateTooltip(root as HTMLElement & { dataset: DOMStringMap })

    expect(trigger.getAttribute("aria-describedby")).toBe(surface.id)
    expect(surface.getAttribute("aria-hidden")).toBe("true")

    trigger.dispatchEvent(new Event("pointerenter"))
    vi.runAllTimers()
    expect(surface.getAttribute("aria-hidden")).toBe("false")

    surface.id = "tooltip-surface-renamed"
    await Promise.resolve()
    expect(trigger.getAttribute("aria-describedby")).toBe("tooltip-surface-renamed")

    root.dataset.affinoTooltipState = "closed"
    await Promise.resolve()
    vi.runAllTimers()
    expect(surface.getAttribute("aria-hidden")).toBe("true")
  })
})
