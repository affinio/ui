/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getDocumentOverlayManager } from "@affino/overlay-kernel"

import { bootstrapAffinoDialogs, hydrateDialog } from "../index"
import { maybeTeleportOverlay } from "../dialog/teleport"
import { scan, setupMutationObserver } from "../dialog/hydrate"

type DialogTestRoot = HTMLDivElement & {
  affinoDialog?: {
    open: (reason?: string) => void
    close: (reason?: string) => void
    toggle: (reason?: string) => void
  }
}

let rootCounter = 0

function createDialogFixture(options?: { teleport?: string; id?: string; modal?: boolean; stateSync?: boolean }) {
  rootCounter += 1
  const root = document.createElement("div") as DialogTestRoot
  root.dataset.affinoDialogRoot = options?.id ?? `dialog-spec-${rootCounter}`
  if (options?.teleport) {
    root.dataset.affinoDialogTeleport = options.teleport
  }
  if (typeof options?.modal === "boolean") {
    root.dataset.affinoDialogModal = options.modal ? "true" : "false"
  }
  if (typeof options?.stateSync === "boolean") {
    root.dataset.affinoDialogStateSync = options.stateSync ? "true" : "false"
  }

  const trigger = document.createElement("button")
  trigger.dataset.affinoDialogTrigger = ""
  root.appendChild(trigger)

  const overlay = document.createElement("div")
  overlay.dataset.affinoDialogOverlay = ""

  const surface = document.createElement("div")
  surface.dataset.affinoDialogSurface = ""
  overlay.appendChild(surface)

  root.appendChild(overlay)
  document.body.appendChild(root)

  return { root, overlay, trigger, surface }
}

describe("dialog hydration integration", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal("cancelAnimationFrame", () => {})
  })

  afterEach(() => {
    document.body.innerHTML = ""
    vi.unstubAllGlobals()
  })

  it("cleans up hydrated handles when dialog root is removed", async () => {
    const { root } = createDialogFixture()

    scan(document)
    setupMutationObserver()
    expect(root.affinoDialog).toBeDefined()

    root.remove()
    await Promise.resolve()
    await Promise.resolve()

    expect(root.affinoDialog).toBeUndefined()
  })

  it("ignores unrelated mutation additions when scheduling rescans", async () => {
    const { root } = createDialogFixture()
    scan(document)
    setupMutationObserver()
    const handleBefore = root.affinoDialog

    const unrelated = document.createElement("div")
    const queryAllSpy = vi.spyOn(unrelated, "querySelectorAll")
    document.body.appendChild(unrelated)

    await Promise.resolve()
    await Promise.resolve()

    expect(root.affinoDialog).toBe(handleBefore)
    expect(queryAllSpy).not.toHaveBeenCalled()
  })

  it("bootstraps without Livewire and supports idempotent hydrate", () => {
    delete (window as any).Livewire
    const { root, overlay } = createDialogFixture()
    bootstrapAffinoDialogs()
    const handleBefore = root.affinoDialog
    expect(handleBefore).toBeDefined()

    hydrateDialog(root as any)
    const handleAfter = root.affinoDialog
    expect(handleAfter).toBeDefined()

    const trigger = root.querySelector("[data-affino-dialog-trigger]") as HTMLButtonElement
    trigger.click()
    expect(overlay.hidden).toBe(false)
  })

  it("rehydrates when overlay structure changes", () => {
    const { root } = createDialogFixture()
    hydrateDialog(root as any)
    const handleBefore = root.affinoDialog

    const nextOverlay = document.createElement("div")
    nextOverlay.dataset.affinoDialogOverlay = ""
    const nextSurface = document.createElement("div")
    nextSurface.dataset.affinoDialogSurface = ""
    nextOverlay.appendChild(nextSurface)
    const currentOverlay = root.querySelector("[data-affino-dialog-overlay]")
    currentOverlay?.replaceWith(nextOverlay)

    scan(document)
    expect(root.affinoDialog).not.toBe(handleBefore)
  })

  it("syncs dialog state from data-affino-dialog-state updates when state sync is enabled", async () => {
    const { root, overlay } = createDialogFixture({ stateSync: true })
    hydrateDialog(root as any)
    expect(overlay.hidden).toBe(true)

    root.dataset.affinoDialogState = "open"
    await Promise.resolve()
    expect(overlay.hidden).toBe(false)
    expect(root.dataset.affinoDialogState).toBe("open")

    root.dataset.affinoDialogState = "closed"
    await Promise.resolve()
    expect(overlay.hidden).toBe(true)
    expect(root.dataset.affinoDialogState).toBe("closed")
  })

  it("ignores dom state mutations when state sync is disabled", async () => {
    const { root, overlay } = createDialogFixture({ stateSync: false })
    hydrateDialog(root as any)
    root.affinoDialog?.open("programmatic")
    expect(overlay.hidden).toBe(false)

    root.dataset.affinoDialogState = "closed"
    await Promise.resolve()

    expect(overlay.hidden).toBe(false)
  })

  it("teleports overlay into document body when target is body", () => {
    const { root, overlay } = createDialogFixture({ teleport: "body" })
    hydrateDialog(root as any)

    expect(overlay.parentElement).toBe(document.body)
    expect(root.contains(overlay)).toBe(false)
  })

  it("teleports latest inline overlay after morph and keeps dismiss working", () => {
    const { root, overlay, surface } = createDialogFixture({ teleport: "body", id: "dialog-teleport-stable" })
    surface.innerHTML = `<p data-marker="old">old</p>`

    hydrateDialog(root as any)
    root.affinoDialog?.open("programmatic")
    expect(overlay.parentElement).toBe(document.body)
    expect(overlay.hidden).toBe(false)

    const inlineClone = document.createElement("div")
    inlineClone.dataset.affinoDialogOverlay = ""
    const inlineCloneSurface = document.createElement("div")
    inlineCloneSurface.dataset.affinoDialogSurface = ""
    inlineCloneSurface.innerHTML = `
      <p data-marker="new">new</p>
      <button data-affino-dialog-dismiss="programmatic">Close</button>
    `
    inlineClone.appendChild(inlineCloneSurface)
    root.appendChild(inlineClone)

    hydrateDialog(root as any)
    const activeOverlay = Array.from(
      document.querySelectorAll<HTMLElement>('[data-affino-dialog-overlay][data-affino-dialog-owner="dialog-teleport-stable"]'),
    ).find((candidate) => !root.contains(candidate)) ?? null
    expect(activeOverlay?.querySelector('[data-marker="new"]')).not.toBeNull()
    const dismiss = activeOverlay?.querySelector("[data-affino-dialog-dismiss]") as HTMLButtonElement | null
    dismiss?.dispatchEvent(new MouseEvent("click", { bubbles: true }))

    expect(activeOverlay?.hidden).toBe(true)
    expect(overlay.isConnected).toBe(false)
    expect(root.dataset.affinoDialogState).toBe("closed")
  })

  it("closes on Escape when top-most dialog is managed by overlay kernel", async () => {
    const { root, surface, overlay } = createDialogFixture({ modal: true })
    hydrateDialog(root as any)
    root.affinoDialog?.open("programmatic")
    expect(overlay.hidden).toBe(false)

    const escapeEvent = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
    surface.dispatchEvent(escapeEvent)
    await Promise.resolve()

    expect(escapeEvent.defaultPrevented).toBe(true)
    expect(overlay.hidden).toBe(true)
  })

  it("loops focus with Tab inside modal dialog", async () => {
    const { root, surface } = createDialogFixture({ modal: true })
    const first = document.createElement("button")
    first.textContent = "first"
    const second = document.createElement("button")
    second.textContent = "second"
    surface.append(first, second)

    hydrateDialog(root as any)
    root.affinoDialog?.open("programmatic")
    await Promise.resolve()

    second.focus()
    expect(document.activeElement).toBe(second)

    const tabEvent = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })
    second.dispatchEvent(tabEvent)

    expect(tabEvent.defaultPrevented).toBe(true)
    const active = document.activeElement
    expect(active && surface.contains(active)).toBe(true)
  })

  it("handles teleport restore edge case when placeholder is gone and parent is detached", () => {
    const root = document.createElement("div") as any
    const parent = document.createElement("div")
    const overlay = document.createElement("div") as any
    overlay.dataset.affinoDialogOverlay = ""
    parent.appendChild(overlay)
    document.body.appendChild(parent)

    const host = document.createElement("div")
    host.id = "dialog-host"
    document.body.appendChild(host)

    const restore = maybeTeleportOverlay(root, overlay, "#dialog-host")
    expect(overlay.parentElement).toBe(host)

    const placeholder = Array.from(parent.childNodes).find((node) => node.nodeType === Node.COMMENT_NODE)
    placeholder?.parentNode?.removeChild(placeholder)
    parent.remove()

    restore?.()

    expect(overlay.isConnected).toBe(false)
  })

  it("registers dialog in document overlay manager while open", () => {
    const { root } = createDialogFixture()
    const manager = getDocumentOverlayManager(document)
    hydrateDialog(root as any)

    const trigger = root.querySelector("[data-affino-dialog-trigger]") as HTMLButtonElement
    trigger.click()

    const openEntry = manager.getStack().find((entry) => entry.id === root.dataset.affinoDialogRoot)
    expect(openEntry?.kind).toBe("dialog")
    expect(openEntry?.state).toBe("open")

    root.affinoDialog?.close("programmatic")
    const closedEntry = manager.getStack().find((entry) => entry.id === root.dataset.affinoDialogRoot)
    expect(closedEntry).toBeUndefined()
  })

  it("reclaims stale owner root before hydrating replacement with same id", () => {
    const sharedId = "dialog-owner-shared"
    const manager = getDocumentOverlayManager(document)
    const { root: originalRoot } = createDialogFixture({ id: sharedId })
    hydrateDialog(originalRoot as any)
    originalRoot.affinoDialog?.open("programmatic")
    expect(manager.getStack().filter((entry) => entry.id === sharedId)).toHaveLength(1)

    const { root: replacementRoot } = createDialogFixture({ id: sharedId })
    expect(() => hydrateDialog(replacementRoot as any)).not.toThrow()
    replacementRoot.affinoDialog?.open("programmatic")

    expect(manager.getStack().filter((entry) => entry.id === sharedId)).toHaveLength(1)
    expect(originalRoot.affinoDialog).toBeUndefined()
    expect(replacementRoot.affinoDialog).toBeDefined()
  })

  it("preserves open state across replacement when state sync is disabled", () => {
    const sharedId = "dialog-state-persist-shared"
    const { root: originalRoot, overlay: originalOverlay } = createDialogFixture({ id: sharedId, stateSync: false })
    hydrateDialog(originalRoot as any)
    originalRoot.affinoDialog?.open("programmatic")
    expect(originalOverlay.hidden).toBe(false)

    originalRoot.remove()
    const { root: replacementRoot, overlay: replacementOverlay } = createDialogFixture({ id: sharedId, stateSync: false })
    hydrateDialog(replacementRoot as any)

    expect(replacementOverlay.hidden).toBe(false)
    expect(replacementRoot.dataset.affinoDialogState).toBe("open")
  })
})
