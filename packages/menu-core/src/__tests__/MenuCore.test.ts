import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MenuCore } from "../core/MenuCore"
import { createOverlayManager } from "@affino/overlay-kernel"

const noopCallbacks = {
  onOpen: vi.fn(),
  onClose: vi.fn(),
  onSelect: vi.fn(),
  onHighlight: vi.fn(),
  onDebug: vi.fn(),
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

  it("registers with the overlay manager and mirrors lifecycle state", () => {
    const manager = createOverlayManager()
    const menu = new MenuCore({ id: "menu-overlay", overlayManager: manager })
    menu.registerItem("alpha")

    menu.open("programmatic")
    expect(manager.getEntry("menu-overlay")?.state).toBe("open")

    menu.requestClose("programmatic")
    expect(manager.getEntry("menu-overlay")?.state).toBe("closed")

    menu.destroy()
    expect(manager.getEntry("menu-overlay")).toBeNull()
  })

  it("routes kernel-managed close reasons through the overlay manager before performing close", () => {
    const manager = createOverlayManager()
    const requestSpy = vi.spyOn(manager, "requestClose")
    const menu = new MenuCore({ id: "kernel-menu", defaultOpen: true, overlayManager: manager })

    menu.requestClose("pointer")
    expect(requestSpy).toHaveBeenCalledWith("kernel-menu", "pointer-outside")
    expect(menu.getSnapshot().open).toBe(false)

    menu.open("programmatic")
    menu.requestClose("keyboard")
    expect(requestSpy).toHaveBeenLastCalledWith("kernel-menu", "escape-key")
  })

  it("falls back to local close and emits diagnostics when overlay close mediation throws", () => {
    const manager = createOverlayManager()
    const menu = new MenuCore({ id: "menu-overlay-failure", defaultOpen: true, overlayManager: manager }, { ...noopCallbacks })
    vi.spyOn(manager, "requestClose").mockImplementation(() => {
      throw new Error("overlay-close-failure")
    })

    expect(() => menu.requestClose("pointer")).not.toThrow()
    expect(menu.getSnapshot().open).toBe(false)
    expect(noopCallbacks.onDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "overlay-error",
        menuId: "menu-overlay-failure",
        operation: "request-close",
      }),
    )
  })

  it("returns null and emits diagnostics when dynamic overlay manager resolution throws", () => {
    const menu = new MenuCore(
      {
        id: "menu-manager-failure",
        getOverlayManager: () => {
          throw new Error("manager-resolution-failure")
        },
      },
      { ...noopCallbacks },
    )

    expect(menu.getOverlayManager()).toBeNull()
    expect(noopCallbacks.onDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "overlay-error",
        menuId: "menu-manager-failure",
        operation: "get-manager",
      }),
    )
  })

  it("swallows overlay destroy failures and emits diagnostics", () => {
    const manager = createOverlayManager()
    const menu = new MenuCore({ id: "menu-destroy-failure", overlayManager: manager }, { ...noopCallbacks })
    vi.spyOn(manager, "unregister").mockImplementation(() => {
      throw new Error("overlay-destroy-failure")
    })

    expect(() => menu.destroy()).not.toThrow()
    expect(noopCallbacks.onDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "overlay-error",
        menuId: "menu-destroy-failure",
        operation: "destroy",
      }),
    )
  })
})
