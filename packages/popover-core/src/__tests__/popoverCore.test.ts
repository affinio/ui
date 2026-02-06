import { describe, expect, it, vi } from "vitest"
import { PopoverCore } from "../core/PopoverCore"
import { createOverlayManager } from "@affino/overlay-kernel"

const createPointerEvent = () => ({ preventDefault: vi.fn() }) as unknown as MouseEvent

describe("PopoverCore", () => {
  it("toggles open state via trigger click", () => {
    const core = new PopoverCore({ id: "filters" })
    const trigger = core.getTriggerProps()

    expect(core.getSnapshot().open).toBe(false)
    trigger.onClick?.(createPointerEvent())
    expect(core.getSnapshot().open).toBe(true)
    trigger.onClick?.(createPointerEvent())
    expect(core.getSnapshot().open).toBe(false)
  })

  it("closes when escape fires from the panel", () => {
    const core = new PopoverCore({ id: "filters", closeOnEscape: true })
    core.open()
    const panel = core.getContentProps()

    panel.onKeyDown?.({ key: "Escape", stopPropagation: vi.fn() } as unknown as KeyboardEvent)
    expect(core.getSnapshot().open).toBe(false)
  })

  it("respects closeOnInteractOutside option", () => {
    const onInteractOutside = vi.fn()
    const closable = new PopoverCore({ id: "closable" }, { onInteractOutside })
    closable.open()
    closable.interactOutside({ event: new Event("pointerdown"), target: null })
    expect(onInteractOutside).toHaveBeenCalled()
    expect(closable.getSnapshot().open).toBe(false)

    const sticky = new PopoverCore({ id: "sticky", closeOnInteractOutside: false })
    sticky.open()
    sticky.interactOutside({ event: new Event("pointerdown"), target: null })
    expect(sticky.getSnapshot().open).toBe(true)
  })

  it("exposes modal metadata through content props", () => {
    const core = new PopoverCore({ id: "modal", modal: true })
    const props = core.getContentProps()

    expect(props["aria-modal"]).toBe("true")
    expect(props.role).toBe("dialog")
    expect(props["data-state"]).toBe("closed")
  })

  it("registers with the overlay manager and mirrors lifecycle state", () => {
    const manager = createOverlayManager()
    const core = new PopoverCore({ id: "popover-overlay", overlayManager: manager })

    core.open()
    expect(manager.getEntry("popover-overlay")?.state).toBe("open")

    core.requestClose("programmatic")
    expect(manager.getEntry("popover-overlay")?.state).toBe("closed")

    core.destroy()
    expect(manager.getEntry("popover-overlay")).toBeNull()
  })

  it("routes kernel-managed close reasons through the overlay manager before performing close", () => {
    const manager = createOverlayManager()
    const requestSpy = vi.spyOn(manager, "requestClose")
    const core = new PopoverCore({ id: "kernel-popover", defaultOpen: true, overlayManager: manager })

    core.requestClose("pointer")
    expect(requestSpy).toHaveBeenCalledWith("kernel-popover", "pointer-outside")
    expect(core.getSnapshot().open).toBe(false)

    core.open()
    core.requestClose("keyboard")
    expect(requestSpy).toHaveBeenLastCalledWith("kernel-popover", "escape-key")
  })

  it("skips overlay close mediation when already closed", () => {
    const manager = createOverlayManager()
    const requestSpy = vi.spyOn(manager, "requestClose")
    const core = new PopoverCore({ id: "already-closed", overlayManager: manager })

    core.requestClose("pointer")
    expect(requestSpy).not.toHaveBeenCalled()
    expect(core.getSnapshot().open).toBe(false)
  })

  it("falls back to local close when overlay manager throws during close mediation", () => {
    const manager = createOverlayManager()
    const onOverlayError = vi.fn()
    const core = new PopoverCore({ id: "fallback-close", defaultOpen: true, overlayManager: manager }, { onOverlayError })

    vi.spyOn(manager, "requestClose").mockImplementation(() => {
      throw new Error("request-close-failure")
    })

    expect(() => core.requestClose("pointer")).not.toThrow()
    expect(core.getSnapshot().open).toBe(false)
    expect(onOverlayError).toHaveBeenCalledTimes(1)
    expect(onOverlayError).toHaveBeenCalledWith(
      expect.objectContaining({
        popoverId: "fallback-close",
        operation: "request-close",
      }),
    )
  })

  it("keeps local lifecycle stable when overlay sync fails", () => {
    const manager = createOverlayManager()
    const onOverlayError = vi.fn()
    const core = new PopoverCore({ id: "sync-failure", overlayManager: manager }, { onOverlayError })

    vi.spyOn(manager, "update").mockImplementation(() => {
      throw new Error("sync-failure")
    })

    expect(() => core.open()).not.toThrow()
    expect(core.getSnapshot().open).toBe(true)
    expect(() => core.close("programmatic")).not.toThrow()
    expect(core.getSnapshot().open).toBe(false)
    expect(onOverlayError).toHaveBeenCalledTimes(2)
    expect(onOverlayError).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        popoverId: "sync-failure",
        operation: "sync-state",
      }),
    )
  })

  it("swallows overlay destroy failures and remains idempotent", () => {
    const manager = createOverlayManager()
    const onOverlayError = vi.fn()
    const core = new PopoverCore({ id: "destroy-failure", overlayManager: manager }, { onOverlayError })

    vi.spyOn(manager, "unregister").mockImplementation(() => {
      throw new Error("destroy-failure")
    })

    expect(() => core.destroy()).not.toThrow()
    expect(() => core.destroy()).not.toThrow()
    expect(onOverlayError).toHaveBeenCalledTimes(1)
    expect(onOverlayError).toHaveBeenCalledWith(
      expect.objectContaining({
        popoverId: "destroy-failure",
        operation: "destroy",
      }),
    )
  })

  it("returns null and reports diagnostics when dynamic overlay manager resolution throws", () => {
    const onOverlayError = vi.fn()
    const core = new PopoverCore(
      {
        id: "manager-failure",
        getOverlayManager: () => {
          throw new Error("manager-resolution-failure")
        },
      },
      { onOverlayError },
    )

    expect(core.getOverlayManager()).toBeNull()
    expect(onOverlayError).toHaveBeenCalled()
    expect(onOverlayError).toHaveBeenCalledWith(
      expect.objectContaining({
        popoverId: "manager-failure",
        operation: "get-manager",
      }),
    )
  })

  it("computes arrow props with defaults", () => {
    const core = new PopoverCore({ id: "arrow" })
    const arrow = core.getArrowProps({
      anchorRect: { x: 100, y: 20, width: 40, height: 20 },
      popoverRect: { x: 80, y: 50, width: 100, height: 60 },
      position: { left: 80, top: 50, placement: "top", align: "center" },
    })

    expect(arrow["data-placement"]).toBe("top")
    expect(arrow["data-align"]).toBe("center")
    expect(arrow.style.left).toBe("35px")
    expect(arrow.style.bottom).toBe("-5px")
  })
})
