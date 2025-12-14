import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MenuCore } from "../core/MenuCore"

const noopCallbacks = {
  onOpen: vi.fn(),
  onClose: vi.fn(),
  onSelect: vi.fn(),
  onHighlight: vi.fn(),
}

describe("MenuCore", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.values(noopCallbacks).forEach((fn) => fn.mockClear())
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  const createMenu = (options = {}) => new MenuCore({ id: "root", ...options }, { ...noopCallbacks })

  it("emits lifecycle callbacks and selection events", () => {
    const menu = createMenu()
    menu.registerItem("alpha")

    menu.open("programmatic")
    expect(noopCallbacks.onOpen).toHaveBeenCalledWith("root")

    menu.highlight("alpha")
    expect(noopCallbacks.onHighlight).toHaveBeenCalledWith("alpha", "root")

    menu.select("alpha")
    expect(noopCallbacks.onSelect).toHaveBeenCalledWith("alpha", "root")
    expect(noopCallbacks.onClose).toHaveBeenCalledWith("root")
  })

  it("registers items and cleans up highlight when they are removed", () => {
    const menu = createMenu()
    const unregister = menu.registerItem("alpha")

    menu.open("programmatic")
    menu.highlight("alpha")
    expect(menu.getSnapshot().activeItemId).toBe("alpha")

    unregister()
    expect(menu.getSnapshot().activeItemId).toBeNull()
  })

  it("delays pointer-driven open and close actions", () => {
    const menu = createMenu({ openDelay: 20, closeDelay: 20 })
    menu.registerItem("alpha")
    const trigger = menu.getTriggerProps()

    trigger.onPointerEnter?.({})
    expect(menu.getSnapshot().open).toBe(false)
    vi.advanceTimersByTime(20)
    expect(menu.getSnapshot().open).toBe(true)

    trigger.onPointerLeave?.({})
    vi.advanceTimersByTime(20)
    expect(menu.getSnapshot().open).toBe(false)
  })

  it("blocks pointer highlight while a hold is active", () => {
    const menu = createMenu({ closeDelay: 10 })
    menu.registerItem("alpha")
    menu.registerItem("bravo")

    menu.open("programmatic")
    menu.highlight("alpha")
    menu.holdPointerHighlight("alpha", 10)

    const internals = menu as unknown as { shouldBlockPointerHighlight: (id: string) => boolean }
    expect(internals.shouldBlockPointerHighlight("bravo")).toBe(true)

    vi.advanceTimersByTime(10)
    expect(internals.shouldBlockPointerHighlight("bravo")).toBe(false)
  })
})
