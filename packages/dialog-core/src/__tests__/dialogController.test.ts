import { describe, expect, it, vi } from "vitest"
import {
  createStandardModalDialogController,
  createStandardModalDialogOptions,
  DialogController,
} from "../dialogController.js"
import { CloseGuardDecision } from "../types.js"
import { createOverlayManager } from "@affino/overlay-kernel"

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
  it("provides standard modal options helper", () => {
    const options = createStandardModalDialogOptions()
    expect(options.overlayKind).toBe("dialog")
    expect(options.closeStrategy).toBe("blocking")
    expect(options.overlayEntryTraits).toEqual(
      expect.objectContaining({
        modal: true,
        trapsFocus: true,
        blocksPointerOutside: true,
        inertSiblings: true,
        returnFocus: true,
      }),
    )
  })

  it("creates controller with standard modal profile", () => {
    const controller = createStandardModalDialogController()
    controller.open("keyboard")
    expect(controller.snapshot.isOpen).toBe(true)
  })

  it("opens and closes without guard", async () => {
    const controller = new DialogController()
    controller.open()
    expect(controller.snapshot.isOpen).toBe(true)

    const didClose = await controller.requestClose("programmatic")
    expect(didClose).toBe(true)
    expect(controller.snapshot.phase).toBe("closed")
    expect(controller.snapshot.isOpen).toBe(false)
  })

  it("keeps close() as an alias for requestClose()", async () => {
    const controller = new DialogController({ defaultOpen: true })
    const spy = vi.spyOn(controller, "requestClose")

    const didClose = await controller.close("programmatic")
    expect(didClose).toBe(true)
    expect(spy).toHaveBeenCalledWith("programmatic", {})
  })

  it("exposes canHandleClose preflight checks", async () => {
    const controller = new DialogController()

    expect(controller.canHandleClose("programmatic")).toBe(false)
    expect(controller.canHandleClose("escape-key")).toBe(false)

    controller.open("keyboard")
    expect(controller.canHandleClose("programmatic")).toBe(true)
    expect(controller.canHandleClose("escape-key")).toBe(true)

    await controller.requestClose("programmatic")
    expect(controller.canHandleClose("programmatic")).toBe(false)
  })

  it("uses top-most checks in canHandleClose when only legacy registrar is present", () => {
    const controller = new DialogController({
      defaultOpen: true,
      overlayRegistrar: {
        register: () => () => {},
        isTopMost: () => false,
      },
    })

    expect(controller.canHandleClose("escape-key")).toBe(false)
    expect(controller.canHandleClose("backdrop")).toBe(false)
    expect(controller.canHandleClose("programmatic")).toBe(true)
  })

  it("waits for blocking guard before closing", async () => {
    const controller = new DialogController()
    controller.open()

    const closeGate = deferred<CloseGuardDecision>()
    controller.setCloseGuard(() => closeGate.promise)

    const closePromise = controller.requestClose("escape-key")
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

    const didClose = await controller.requestClose("programmatic")
    expect(didClose).toBe(false)
    expect(controller.snapshot.isOpen).toBe(true)
    expect(controller.snapshot.guardMessage).toBe("Unsaved edits")
  })

  it("converts throwing close guards into denied close with diagnostics", async () => {
    const onError = vi.fn()
    const controller = new DialogController({ defaultOpen: true, onError })
    const errorListener = vi.fn()
    controller.on("error", errorListener)
    controller.setCloseGuard(() => {
      throw new Error("Guard crashed")
    })

    const didClose = await controller.requestClose("programmatic")
    expect(didClose).toBe(false)
    expect(controller.snapshot.isOpen).toBe(true)
    expect(controller.snapshot.guardMessage).toBe("Guard crashed")
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "close-guard-error",
        reason: "programmatic",
        message: "Guard crashed",
      }),
    )
    expect(errorListener).toHaveBeenCalledTimes(1)
  })

  it("handles rejected close guards without rejecting callers", async () => {
    const controller = new DialogController({ defaultOpen: true })
    controller.setCloseGuard(async () => {
      throw new Error("Async guard rejected")
    })

    const first = controller.requestClose("escape-key")
    const second = controller.requestClose("escape-key")

    await expect(first).resolves.toBe(false)
    await expect(second).resolves.toBe(false)
    expect(controller.snapshot.isOpen).toBe(true)
    expect(controller.snapshot.guardMessage).toBe("Async guard rejected")
  })

  it("optimistically closes and reopens when guard rejects", async () => {
    const controller = new DialogController({ defaultOpen: true })
    const closeGate = deferred<CloseGuardDecision>()
    controller.setCloseGuard(() => closeGate.promise)

    const closePromise = controller.requestClose("programmatic", { strategy: "optimistic" })
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

    const closePromise = controller.requestClose("escape-key")
    expect(controller.snapshot.pendingCloseAttempts).toBe(0)

    controller.requestClose("escape-key")
    controller.requestClose("escape-key")
    expect(onPending).toHaveBeenCalledTimes(2)
    expect(controller.snapshot.pendingCloseAttempts).toBe(2)

    closeGate.resolve({ outcome: "allow" })
    await closePromise
  })

  it("exposes pending navigation message while guard is active", async () => {
    const controller = new DialogController({ defaultOpen: true, pendingNavigationMessage: "Saving changes" })
    const closeGate = deferred<CloseGuardDecision>()
    controller.setCloseGuard(() => closeGate.promise)

    const closePromise = controller.requestClose("programmatic")
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

    await controller.requestClose("programmatic")
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
        isTopMost: () => true,
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

  it("registers itself with the registrar on open and unregisters on close", async () => {
    const unregister = vi.fn()
    const register = vi.fn().mockReturnValue(unregister)
    const controller = new DialogController({
      overlayRegistrar: {
        register,
        isTopMost: () => true,
      },
    })

    controller.open()
    expect(register).toHaveBeenCalledTimes(1)
    const registration = register.mock.calls[0][0]
    expect(registration).toMatchObject({ kind: "dialog" })

    await controller.requestClose("programmatic")
    expect(unregister).toHaveBeenCalledTimes(1)
  })

  it("registers with overlay manager and mirrors lifecycle state", async () => {
    const manager = createOverlayManager()
    const controller = new DialogController({ overlayManager: manager, overlayEntryTraits: { modal: false }, id: "dialog-under-test" })

    controller.open("keyboard")
    const entry = manager.getEntry("dialog-under-test")
    expect(entry?.state).toBe("open")
    expect(entry?.modal).toBe(false)

    await controller.requestClose("programmatic")
    expect(manager.getEntry("dialog-under-test")?.state).toBe("closed")

    controller.destroy()
    expect(manager.getEntry("dialog-under-test")).toBeNull()
  })

  it("keeps overlay registered until after close lifecycle completes", async () => {
    const manager = createOverlayManager()
    const afterCloseStates: Array<{ stillRegistered: boolean }> = []
    const controller = new DialogController({
      defaultOpen: true,
      overlayManager: manager,
      id: "dialog-after-close",
      lifecycle: {
        afterClose: () => {
          afterCloseStates.push({ stillRegistered: Boolean(manager.getEntry("dialog-after-close")) })
        },
      },
    })

    await controller.requestClose("programmatic")
    expect(afterCloseStates).toEqual([{ stillRegistered: true }])
    expect(manager.getEntry("dialog-after-close")?.state).toBe("closed")

    controller.destroy()
    expect(manager.getEntry("dialog-after-close")).toBeNull()
  })

  it("routes kernel-managed close reasons through the overlay manager before performing close", async () => {
    const manager = createOverlayManager()
    const requestSpy = vi.spyOn(manager, "requestClose")
    const controller = new DialogController({ defaultOpen: true, overlayManager: manager, id: "primary-dialog" })

    const backdropPromise = controller.requestClose("backdrop")
    expect(requestSpy).toHaveBeenCalledWith("primary-dialog", "pointer-outside")
    await backdropPromise
    expect(controller.snapshot.isOpen).toBe(false)

    controller.open()
    const escapePromise = controller.requestClose("escape-key")
    expect(requestSpy).toHaveBeenLastCalledWith("primary-dialog", "escape-key")
    await escapePromise
    expect(controller.snapshot.phase).toBe("closed")
  })

  it("cascades kernel-mediated closes to owner-bound overlays", async () => {
    const manager = createOverlayManager()
    const dialog = new DialogController({ defaultOpen: true, overlayManager: manager, overlayKind: "dialog", id: "parent-dialog" })
    const sheet = new DialogController({
      defaultOpen: true,
      overlayManager: manager,
      overlayKind: "sheet",
      id: "child-sheet",
      overlayEntryTraits: { ownerId: "parent-dialog" },
    })

    await dialog.requestClose("backdrop")

    expect(dialog.snapshot.phase).toBe("closed")
    expect(sheet.snapshot.phase).toBe("closed")
  })

  it("resolves pending requests when the kernel declines to close", async () => {
    const manager = createOverlayManager()
    const controller = new DialogController({ defaultOpen: true, overlayManager: manager, id: "stale-dialog" })

    manager.update("stale-dialog", { state: "closed" })

    const didClose = await controller.requestClose("escape-key")
    expect(didClose).toBe(false)
    expect(controller.snapshot.phase).toBe("open")
  })

  it("does not hang when the kernel never emits close-requested", async () => {
    const manager = createOverlayManager()
    const controller = new DialogController({ defaultOpen: true, overlayManager: manager, id: "silent-kernel-dialog" })

    manager.unregister("silent-kernel-dialog")

    const didClose = await controller.requestClose("escape-key")
    expect(didClose).toBe(false)
    expect(controller.snapshot.isOpen).toBe(true)
    expect(controller.snapshot.phase).toBe("open")
  })

  it("ignores kernel focus-loss close requests", () => {
    const manager = createOverlayManager()
    const controller = new DialogController({ defaultOpen: true, overlayManager: manager, id: "focus-loss-dialog" })

    manager.requestClose("focus-loss-dialog", "focus-loss")
    expect(controller.snapshot.isOpen).toBe(true)
    expect(controller.snapshot.phase).toBe("open")
  })

  it("responds to kernel close requests", async () => {
    const manager = createOverlayManager()
    const controller = new DialogController({ defaultOpen: true, overlayManager: manager, id: "kernel-close-dialog" })

    manager.requestClose("kernel-close-dialog", "pointer-outside")
    await vi.waitFor(() => {
      expect(controller.snapshot.isOpen).toBe(false)
      expect(controller.snapshot.phase).toBe("closed")
    })
  })

  it("rejects backdrop closes when the registrar reports a lower stacking depth", async () => {
    const register = vi.fn()
    const isTopMost = vi.fn().mockReturnValue(false)
    const controller = new DialogController({
      defaultOpen: true,
      overlayRegistrar: {
        register,
        isTopMost,
      },
    })

    const registration = register.mock.calls[0][0]
    const didClose = await controller.requestClose("backdrop")
    expect(didClose).toBe(false)
    expect(isTopMost).toHaveBeenCalledWith(registration.id)
    expect(controller.snapshot.isOpen).toBe(true)
  })

  it("always accepts programmatic closes regardless of registrar state", async () => {
    const register = vi.fn()
    const isTopMost = vi.fn().mockReturnValue(false)
    const controller = new DialogController({
      defaultOpen: true,
      overlayRegistrar: {
        register,
        isTopMost,
      },
    })

    const didClose = await controller.requestClose("programmatic")
    expect(didClose).toBe(true)
    expect(isTopMost).not.toHaveBeenCalled()
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

    const closePromise = controller.requestClose("escape-key")
    controller.requestClose("escape-key")
    controller.requestClose("escape-key")

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
    const closePromise = controller.requestClose("programmatic")
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
