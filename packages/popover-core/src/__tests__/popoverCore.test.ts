import { describe, expect, it, vi } from "vitest"
import { PopoverCore } from "../core/PopoverCore"

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
})
