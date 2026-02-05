import { describe, expect, it, vi } from "vitest"
import { createDialogOverlayRegistrar } from "../overlayRegistrar.js"

describe("createDialogOverlayRegistrar", () => {
  it("tracks stacked overlays and resolves the top-most entry", () => {
    const registrar = createDialogOverlayRegistrar()

    const disposeBase = registrar.register({ id: "base", kind: "dialog" })
    expect(registrar.stack.value).toHaveLength(1)
    expect(registrar.isTopMost("base")).toBe(true)

    const disposeNested = registrar.register({ id: "nested", kind: "dialog" })
    expect(registrar.stack.value).toHaveLength(2)
    expect(registrar.isTopMost("base")).toBe(false)
    expect(registrar.isTopMost("nested")).toBe(true)

    disposeNested?.()
    expect(registrar.stack.value).toHaveLength(1)
    expect(registrar.isTopMost("base")).toBe(true)

    disposeBase?.()
    expect(registrar.stack.value).toHaveLength(0)
  })

  it("emits stack change notifications", () => {
    const onStackChange = vi.fn()
    const registrar = createDialogOverlayRegistrar({ onStackChange })

    const dispose = registrar.register({ id: "toast", kind: "dialog" })
    expect(onStackChange).toHaveBeenCalledTimes(1)
    expect(onStackChange).toHaveBeenLastCalledWith(expect.arrayContaining([{ id: "toast", kind: "dialog" }]))

    dispose?.()
    expect(onStackChange).toHaveBeenCalledTimes(2)
    expect(onStackChange).toHaveBeenLastCalledWith([])
  })

  it("keeps the latest registration when stale disposer runs after re-register", () => {
    const registrar = createDialogOverlayRegistrar()

    const disposeFirst = registrar.register({ id: "dialog-a", kind: "dialog" })
    const disposeSecond = registrar.register({ id: "dialog-a", kind: "dialog" })

    // Simulate stale cleanup from an older hydration cycle.
    disposeFirst?.()
    expect(registrar.stack.value).toHaveLength(1)
    expect(registrar.isTopMost("dialog-a")).toBe(true)

    disposeSecond?.()
    expect(registrar.stack.value).toHaveLength(0)
  })
})
