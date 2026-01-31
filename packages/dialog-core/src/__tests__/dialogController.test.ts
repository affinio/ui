import { describe, expect, it, vi } from "vitest"
import { DialogController } from "../dialogController.js"
import { CloseGuardDecision } from "../types.js"

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe("DialogController", () => {
  it("opens and closes without guard", async () => {
    const controller = new DialogController()
    controller.open()
    expect(controller.snapshot.isOpen).toBe(true)

    const didClose = await controller.close("programmatic")
    expect(didClose).toBe(true)
    expect(controller.snapshot.phase).toBe("closed")
    expect(controller.snapshot.isOpen).toBe(false)
  })

  it("waits for blocking guard before closing", async () => {
    const controller = new DialogController()
    controller.open()

    const closeGate = deferred<CloseGuardDecision>()
    controller.setCloseGuard(() => closeGate.promise)

    const closePromise = controller.close("escape-key")
    expect(controller.snapshot.isGuardPending).toBe(true)
    expect(controller.snapshot.phase).toBe("open")

    closeGate.resolve({ outcome: "allow" })
    const didClose = await closePromise
    expect(didClose).toBe(true)
    expect(controller.snapshot.phase).toBe("closed")
  })

  it("surfaces guard denial message", async () => {
    const controller = new DialogController({ defaultOpen: true })
    controller.setCloseGuard(async () => ({ outcome: "deny", message: "Unsaved edits" }))

    const didClose = await controller.close("programmatic")
    expect(didClose).toBe(false)
    expect(controller.snapshot.isOpen).toBe(true)
    expect(controller.snapshot.guardMessage).toBe("Unsaved edits")
  })

  it("optimistically closes and reopens when guard rejects", async () => {
    const controller = new DialogController({ defaultOpen: true })
    const closeGate = deferred<CloseGuardDecision>()
    controller.setCloseGuard(() => closeGate.promise)

    const closePromise = controller.close("programmatic", { strategy: "optimistic" })
    expect(controller.snapshot.phase).toBe("closing")
    expect(controller.snapshot.optimisticCloseInFlight).toBe(true)
    expect(controller.snapshot.optimisticCloseReason).toBe("programmatic")

    closeGate.resolve({ outcome: "deny", message: "Server rejected" })
    const didClose = await closePromise
    expect(didClose).toBe(false)
    expect(controller.snapshot.isOpen).toBe(true)
    expect(controller.snapshot.guardMessage).toBe("Server rejected")
    expect(controller.snapshot.optimisticCloseReason).toBeUndefined()
  })

  it("counts pending close attempts and notifies", async () => {
    const onPending = vi.fn()
    const controller = new DialogController({ defaultOpen: true, onPendingCloseAttempt: onPending })
    const closeGate = deferred<CloseGuardDecision>()
    controller.setCloseGuard(() => closeGate.promise)

    const closePromise = controller.close("escape-key")
    expect(controller.snapshot.pendingCloseAttempts).toBe(0)

    controller.close("escape-key")
    controller.close("escape-key")
    expect(onPending).toHaveBeenCalledTimes(2)
    expect(controller.snapshot.pendingCloseAttempts).toBe(2)

    closeGate.resolve({ outcome: "allow" })
    await closePromise
  })

  it("exposes pending navigation message while guard is active", async () => {
    const controller = new DialogController({ defaultOpen: true, pendingNavigationMessage: "Saving changes" })
    const closeGate = deferred<CloseGuardDecision>()
    controller.setCloseGuard(() => closeGate.promise)

    const closePromise = controller.close("programmatic")
    expect(controller.snapshot.pendingNavigationMessage).toBe("Saving changes")

    closeGate.resolve({ outcome: "allow" })
    await closePromise
    expect(controller.snapshot.pendingNavigationMessage).toBeUndefined()
  })

  it("evaluates overlay interaction matrix", () => {
    const controller = new DialogController({ overlayKind: "dialog" })
    expect(controller.canStackOver("dialog")).toBe(true)
    expect(controller.canStackOver("sheet")).toBe(true)
    expect(controller.closeStrategyFor("sheet")).toBe("single")

    const sheetController = new DialogController({ overlayKind: "sheet" })
    expect(sheetController.canStackOver("dialog")).toBe(false)
    expect(sheetController.closeStrategyFor("dialog")).toBe("cascade")
  })

  it("runs lifecycle hooks, focus orchestration, and emits events", async () => {
    const lifecycleOrder: string[] = []
    const focusEvents: string[] = []
    const phaseEvents: string[] = []

    const controller = new DialogController({
      lifecycle: {
        beforeOpen: ({ reason }) => lifecycleOrder.push(`before-open:${reason}`),
        afterOpen: ({ reason }) => lifecycleOrder.push(`after-open:${reason}`),
        beforeClose: ({ reason }) => lifecycleOrder.push(`before-close:${reason}`),
        afterClose: ({ reason }) => lifecycleOrder.push(`after-close:${reason}`),
      },
      focusOrchestrator: {
        activate: ({ reason }) => focusEvents.push(`activate:${reason}`),
        deactivate: ({ reason }) => focusEvents.push(`deactivate:${reason}`),
      },
    })

    controller.on("phase-change", (snapshot) => phaseEvents.push(`phase:${snapshot.phase}`))
    controller.on("open", ({ reason }) => phaseEvents.push(`open:${reason}`))
    controller.on("close", ({ reason }) => phaseEvents.push(`close:${reason}`))

    controller.open("keyboard")
    expect(lifecycleOrder).toEqual(["before-open:keyboard", "after-open:keyboard"])
    expect(focusEvents).toEqual(["activate:keyboard"])
    expect(phaseEvents).toEqual(["phase:opening", "phase:open", "open:keyboard"])

    await controller.close("programmatic")
    expect(lifecycleOrder).toEqual([
      "before-open:keyboard",
      "after-open:keyboard",
      "before-close:programmatic",
      "after-close:programmatic",
    ])
    expect(focusEvents).toEqual(["activate:keyboard", "deactivate:programmatic"])
    expect(phaseEvents).toEqual([
      "phase:opening",
      "phase:open",
      "open:keyboard",
      "phase:closing",
      "phase:closed",
      "close:programmatic",
    ])
  })

  it("registers overlays and relays registrar hooks", () => {
    const unregister = vi.fn()
    const register = vi.fn().mockReturnValue(unregister)
    const controller = new DialogController({
      overlayRegistrar: {
        register,
      },
    })

    const events: string[] = []
    controller.on("overlay-registered", (overlay) => events.push(`registered:${overlay.id}`))
    controller.on("overlay-unregistered", (overlay) => events.push(`unregistered:${overlay.id}`))

    const dispose = controller.registerOverlay({ id: "primary", kind: "dialog" })
    expect(register).toHaveBeenCalledWith({ id: "primary", kind: "dialog" })
    expect(events).toEqual(["registered:primary"])

    dispose()
    expect(unregister).toHaveBeenCalledTimes(1)
    expect(events).toEqual(["registered:primary", "unregistered:primary"])
  })

  it("notifies when pending close attempts reach the configured limit", async () => {
    const onLimit = vi.fn()
    const controller = new DialogController({
      defaultOpen: true,
      maxPendingAttempts: 2,
      onPendingCloseLimitReached: onLimit,
    })
    const closeGate = deferred<CloseGuardDecision>()
    controller.setCloseGuard(() => closeGate.promise)

    const closePromise = controller.close("escape-key")
    controller.close("escape-key")
    controller.close("escape-key")

    expect(onLimit).toHaveBeenCalledTimes(1)
    expect(onLimit).toHaveBeenCalledWith({ reason: "escape-key", attempt: 2, limit: 2 })

    closeGate.resolve({ outcome: "allow" })
    await closePromise
  })

  it("destroys controller, releasing listeners, guard state, and focus orchestration", async () => {
    const focusLog: string[] = []
    const controller = new DialogController({
      focusOrchestrator: {
        activate: ({ reason }) => focusLog.push(`activate:${reason}`),
        deactivate: ({ reason }) => focusLog.push(`deactivate:${reason}`),
      },
    })

    const snapshots: string[] = []
    controller.subscribe((snapshot) => snapshots.push(snapshot.phase))

    controller.open("keyboard")
    expect(focusLog).toEqual(["activate:keyboard"])

    const closeGate = deferred<CloseGuardDecision>()
    controller.setCloseGuard(() => closeGate.promise)
    const closePromise = controller.close("programmatic")
    expect(controller.snapshot.isGuardPending).toBe(true)

    controller.destroy("escape-key")
    closeGate.resolve({ outcome: "allow" })
    await closePromise

    const snapshotCountAfterDestroy = snapshots.length
    controller.open()
    expect(snapshots.length).toBe(snapshotCountAfterDestroy)
    expect(focusLog).toEqual(["activate:keyboard", "deactivate:escape-key"])
    expect(controller.snapshot.isGuardPending).toBe(false)
    expect(controller.getPendingCloseAttempts()).toBe(0)
  })
})
