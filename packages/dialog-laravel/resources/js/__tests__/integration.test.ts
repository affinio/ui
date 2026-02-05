/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { bootstrapAffinoDialogs, hydrateDialog } from "../index"
import { maybeTeleportOverlay } from "../dialog/teleport"
import { scan, setupMutationObserver } from "../dialog/hydrate"

type DialogTestRoot = HTMLDivElement & {
  affinoDialog?: unknown
}

let rootCounter = 0

function createDialogFixture(options?: { teleport?: string }) {
  rootCounter += 1
  const root = document.createElement("div") as DialogTestRoot
  root.dataset.affinoDialogRoot = `dialog-spec-${rootCounter}`
  if (options?.teleport) {
    root.dataset.affinoDialogTeleport = options.teleport
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

  return { root, overlay }
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
})
