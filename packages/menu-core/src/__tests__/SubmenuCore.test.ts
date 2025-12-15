import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MenuCore } from "../core/MenuCore"
import { SubmenuCore, type SubmenuOptions } from "../core/SubmenuCore"
import type { MenuOptions } from "../types"

const setupMenus = (overrides?: { parent?: Partial<MenuOptions>; submenu?: Partial<SubmenuOptions> }) => {
  const parent = new MenuCore({ id: "parent", openDelay: 0, closeDelay: 0, ...overrides?.parent })
  parent.registerItem("parent-item")
  const submenu = new SubmenuCore(parent, {
    id: "child",
    parentItemId: "parent-item",
    openDelay: 0,
    closeDelay: 0,
    ...overrides?.submenu,
  })
  submenu.registerItem("child-item")
  return { parent, submenu }
}

describe("SubmenuCore", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("closes when the tree no longer includes it in the open path", () => {
    const { parent, submenu } = setupMenus()
    parent.open("programmatic")
    parent.highlight("parent-item")
    submenu.open("programmatic")
    expect(submenu.getSnapshot().open).toBe(true)

    parent.getTree().updateOpenState(parent.id, false)
    vi.runAllTimers()
    expect(submenu.getSnapshot().open).toBe(false)
  })

  it("releases parent highlight when pointer moves to a sibling", () => {
    const { parent, submenu } = setupMenus()
    const releaseSpy = vi.spyOn(parent as unknown as { releasePointerHighlightHold: (id?: string) => void }, "releasePointerHighlightHold")

    const trigger = submenu.getTriggerProps()
    trigger.onPointerLeave?.({ meta: { isWithinTree: true, relatedMenuId: parent.id } })

    expect(releaseSpy).toHaveBeenCalledWith("parent-item")
  })

  it("holds highlight when entering a child panel", () => {
    const { parent, submenu } = setupMenus()
    const holdSpy = vi.spyOn(parent as unknown as { holdPointerHighlight: (id: string, duration?: number) => void }, "holdPointerHighlight")
    const releaseSpy = vi.spyOn(parent as unknown as { releasePointerHighlightHold: (id?: string) => void }, "releasePointerHighlightHold")

    const panel = submenu.getPanelProps()
    panel.onPointerLeave?.({
      meta: {
        isWithinTree: true,
        enteredChildPanel: true,
        relatedMenuId: submenu.id,
      },
    })

    expect(holdSpy).toHaveBeenCalledWith("parent-item")
    expect(releaseSpy).not.toHaveBeenCalled()
  })

  it("closes ancestor menus when selecting an item", () => {
    const { parent, submenu } = setupMenus()
    parent.open("programmatic")
    parent.highlight("parent-item")
    submenu.open("programmatic")

    submenu.select("child-item")

    expect(submenu.getSnapshot().open).toBe(false)
    expect(parent.getSnapshot().open).toBe(false)
  })

  it("respects closeOnSelect = false in the hierarchy", () => {
    const { parent, submenu } = setupMenus({ parent: { closeOnSelect: false } })
    parent.open("programmatic")
    parent.highlight("parent-item")
    submenu.open("programmatic")

    submenu.select("child-item")

    expect(submenu.getSnapshot().open).toBe(true)
    expect(parent.getSnapshot().open).toBe(true)
  })
})
