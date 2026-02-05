import { DialogController } from "@affino/dialog-core"
import type {
  DialogCloseContext,
  DialogCloseReason,
  DialogFocusOrchestrator,
  DialogOpenContext,
  DialogOpenReason,
  DialogSnapshot,
  OverlayKind,
} from "@affino/dialog-core"
import { focusEdge, getFocusableElements } from "@affino/focus-utils"
import { ensureDocumentObserver } from "@affino/overlay-kernel"
import type {
  BindingOptions,
  Cleanup,
  DialogBinding,
  DialogHandle,
  FocusSentinel,
  OverlayEl,
  RootEl,
  SurfaceEl,
} from "./types"
import {
  acquireScrollLock,
  ensureGlobalGuardsActive,
  globalOverlayRegistrar,
  registerBinding,
  releaseScrollLock,
  unregisterBinding,
} from "./globalGuards"
import { maybeTeleportOverlay } from "./teleport"

const OPEN_REASONS = new Set<DialogOpenReason>(["programmatic", "pointer", "keyboard", "trigger"])
const CLOSE_REASONS = new Set<DialogCloseReason>([
  "escape-key",
  "backdrop",
  "programmatic",
  "pointer",
  "nested-dialog-request",
])

const registry = new WeakMap<RootEl, Cleanup>()
const pinnedOpenRegistry = new Map<string, boolean>()
let dialogOverlayIdCounter = 0

function hydrateDialog(root: RootEl): void {
  const resolveOverlay = () => resolveOverlayElement(root)
  const overlay = resolveOverlay()
  const surface = overlay?.querySelector<SurfaceEl>("[data-affino-dialog-surface]")
  if (!overlay || !surface) {
    return
  }

  const teardown = registry.get(root)
  teardown?.()

  const options = resolveOptions(root)
  tagOverlayOwner(root, overlay)
  const teleportRestore = maybeTeleportOverlay(root, overlay, options.teleportTarget)
  const overlayId = resolveOverlayId(root)

  const binding: DialogBinding = {
    root,
    overlay,
    surface,
    options,
    controller: null as unknown as DialogController,
    detachments: [],
    lockHeld: false,
    teleportRestore,
    sentinelCleanup: null,
    overlayId,
  }

  binding.controller = new DialogController({
    id: overlayId,
    defaultOpen: options.defaultOpen,
    overlayKind: options.overlayKind,
    closeStrategy: options.closeStrategy,
    pendingNavigationMessage: options.pendingMessage ?? undefined,
    maxPendingAttempts: options.maxPendingAttempts ?? undefined,
    focusOrchestrator: createFocusOrchestrator(surface, root, options),
    overlayRegistrar: globalOverlayRegistrar,
  })
  registerBinding(binding)

  const unsubscribe = binding.controller.subscribe((snapshot) => applySnapshot(binding, snapshot))
  binding.detachments.push(unsubscribe)
  binding.detachments.push(() => binding.controller.destroy())

  bindTriggers(binding)
  bindDismissListeners(binding)
  bindBackdrop(binding)
  bindSentinels(binding)

  let pendingStructureRehydrate = false
  const scheduleStructureRehydrate = () => {
    if (pendingStructureRehydrate) {
      return
    }
    pendingStructureRehydrate = true
    Promise.resolve().then(() => {
      pendingStructureRehydrate = false
      if (!root.isConnected) {
        const cleanup = registry.get(root)
        cleanup?.()
        return
      }
      hydrateDialog(root)
    })
  }

  const structureObserver = new MutationObserver(() => {
    const nextOverlay = resolveOverlay()
    const nextSurface = nextOverlay?.querySelector<SurfaceEl>("[data-affino-dialog-surface]")
    if (nextOverlay !== binding.overlay || nextSurface !== binding.surface) {
      scheduleStructureRehydrate()
    }
  })
  structureObserver.observe(root, { childList: true, subtree: true })
  binding.detachments.push(() => structureObserver.disconnect())

  const rootId = root.dataset.affinoDialogRoot
  if (options.pinned && rootId && pinnedOpenRegistry.get(rootId)) {
    binding.controller.open("programmatic")
  }

  const handle: DialogHandle = {
    open: (reason = "programmatic") => binding.controller.open(reason),
    close: (reason: DialogCloseReason = "programmatic", request) => binding.controller.close(reason, request),
    toggle: (reason) => {
      const snapshot = binding.controller.snapshot
      if (snapshot.isOpen || snapshot.phase === "opening" || snapshot.optimisticCloseInFlight) {
        binding.controller.close(toCloseReason(reason))
        return
      }
      binding.controller.open(toOpenReason(reason))
    },
    getSnapshot: () => binding.controller.snapshot,
  }

  root.affinoDialog = handle

  registry.set(root, () => {
    if (root.affinoDialog === handle) {
      delete root.affinoDialog
    }
    binding.sentinelCleanup?.()
    binding.detachments.forEach((cleanup) => cleanup())
    if (binding.lockHeld) {
      releaseScrollLock(binding.root.ownerDocument)
      binding.lockHeld = false
    }
    binding.teleportRestore?.()
    unregisterBinding(binding)
    registry.delete(root)
  })
}

function bindTriggers(binding: DialogBinding): void {
  const triggers = Array.from(binding.root.querySelectorAll<HTMLElement>("[data-affino-dialog-trigger]"))
  triggers.forEach((trigger) => {
    const handler = (event: Event) => {
      event.preventDefault()
      binding.controller.open("trigger")
    }
    trigger.addEventListener("click", handler)
    binding.detachments.push(() => trigger.removeEventListener("click", handler))
  })
}

function bindDismissListeners(binding: DialogBinding): void {
  const handler = (event: Event) => {
    const target =
      event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[data-affino-dialog-dismiss]") : null
    if (!target) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const reason = target.dataset.affinoDialogDismiss as DialogCloseReason | undefined
    binding.controller.close(reason ?? "programmatic")
  }
  binding.root.addEventListener("click", handler)
  binding.overlay.addEventListener("click", handler)
  binding.detachments.push(() => binding.root.removeEventListener("click", handler))
  binding.detachments.push(() => binding.overlay.removeEventListener("click", handler))
}

function bindBackdrop(binding: DialogBinding): void {
  const pointerHandler = (event: PointerEvent) => {
    if (!binding.options.closeOnBackdrop) {
      return
    }
    const target = event.target instanceof Node ? event.target : null
    if (target && binding.surface.contains(target)) {
      return
    }
    binding.controller.close("backdrop")
  }
  binding.overlay.addEventListener("pointerdown", pointerHandler)
  binding.detachments.push(() => binding.overlay.removeEventListener("pointerdown", pointerHandler))
}

function bindSentinels(binding: DialogBinding): void {
  const sentinels = binding.overlay.querySelectorAll<FocusSentinel>("[data-affino-dialog-sentinel]")
  if (!sentinels.length) {
    binding.sentinelCleanup = null
    return
  }
  const disposers: Array<() => void> = []
  sentinels.forEach((sentinel) => {
    const direction = sentinel.dataset.affinoDialogSentinel === "end" ? "end" : "start"
    const handler = (event: FocusEvent) => {
      event.preventDefault()
      focusEdge(binding.surface, direction)
    }
    sentinel.addEventListener("focus", handler)
    disposers.push(() => sentinel.removeEventListener("focus", handler))
  })
  binding.sentinelCleanup = () => disposers.forEach((dispose) => dispose())
}

function applySnapshot(binding: DialogBinding, snapshot: DialogSnapshot): void {
  const { root, overlay, surface, options } = binding
  const phase = snapshot.phase
  const visible =
    snapshot.isOpen || snapshot.phase === "opening" || snapshot.phase === "closing" || snapshot.optimisticCloseInFlight
  root.dataset.affinoDialogState = snapshot.isOpen ? "open" : phase
  overlay.dataset.state = phase
  overlay.hidden = !visible
  surface.dataset.state = phase

  if (visible && !binding.lockHeld && options.lockScroll) {
    acquireScrollLock(binding.root.ownerDocument)
    binding.lockHeld = true
  }
  if (!visible && binding.lockHeld) {
    releaseScrollLock(binding.root.ownerDocument)
    binding.lockHeld = false
  }

  const rootId = root.dataset.affinoDialogRoot
  if (options.pinned && rootId) {
    pinnedOpenRegistry.set(rootId, snapshot.isOpen || snapshot.optimisticCloseInFlight)
  } else if (rootId) {
    pinnedOpenRegistry.delete(rootId)
  }

  if (snapshot.isOpen) {
    ensureGlobalGuardsActive()
  }
}

function resolveOptions(root: RootEl): BindingOptions {
  return {
    modal: readBoolean(root.dataset.affinoDialogModal, true),
    closeOnBackdrop: readBoolean(root.dataset.affinoDialogCloseBackdrop, true),
    closeOnEscape: readBoolean(root.dataset.affinoDialogCloseEscape, true),
    lockScroll: readBoolean(root.dataset.affinoDialogLockScroll, true),
    returnFocus: readBoolean(root.dataset.affinoDialogReturnFocus, true),
    pinned: readBoolean(root.dataset.affinoDialogPinned, false),
    defaultOpen: readBoolean(root.dataset.affinoDialogDefaultOpen, false),
    overlayKind: (root.dataset.affinoDialogOverlayKind as OverlayKind) ?? "dialog",
    closeStrategy: root.dataset.affinoDialogCloseStrategy === "optimistic" ? "optimistic" : "blocking",
    teleportTarget: resolveTeleportTarget(root.dataset.affinoDialogTeleport),
    pendingMessage: root.dataset.affinoDialogPendingMessage ?? null,
    maxPendingAttempts: readNumber(root.dataset.affinoDialogMaxPending),
  }
}

function resolveTeleportTarget(value?: string): string | null {
  if (!value || value.trim() === "" || value === "inline") {
    return null
  }
  return value
}

function tagOverlayOwner(root: RootEl, overlay: OverlayEl): void {
  const ownerId = root.dataset.affinoDialogRoot
  if (!ownerId) {
    return
  }
  if (overlay.dataset.affinoDialogOwner) {
    return
  }
  overlay.dataset.affinoDialogOwner = ownerId
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback
  }
  if (value === "true") {
    return true
  }
  if (value === "false") {
    return false
  }
  return fallback
}

function readNumber(value?: string): number | null {
  if (!value) {
    return null
  }
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function createFocusOrchestrator(surface: SurfaceEl, root: RootEl, options: BindingOptions): DialogFocusOrchestrator {
  let previousFocus: HTMLElement | null = null
  return {
    activate: (_context: DialogOpenContext) => {
      previousFocus = options.returnFocus ? (root.ownerDocument?.activeElement as HTMLElement | null) : null
      requestAnimationFrame(() => {
        const initial =
          surface.querySelector<HTMLElement>("[data-dialog-initial]") ?? getFocusableElements(surface)[0] ?? surface
        initial?.focus({ preventScroll: true })
      })
    },
    deactivate: (_context: DialogCloseContext) => {
      if (!options.returnFocus || !previousFocus) {
        return
      }
      const target = previousFocus
      previousFocus = null
      if (target.isConnected) {
        requestAnimationFrame(() => target.focus({ preventScroll: true }))
      }
    },
  }
}

function scan(root: ParentNode): void {
  if (root instanceof HTMLElement && root.matches("[data-affino-dialog-root]")) {
    hydrateDialog(root as RootEl)
  }
  const nodes = root.querySelectorAll<RootEl>("[data-affino-dialog-root]")
  nodes.forEach((node) => hydrateDialog(node))
}

function setupMutationObserver(): void {
  if (typeof document === "undefined") {
    return
  }
  ensureDocumentObserver({
    globalKey: "__affinoDialogObserver",
    target: document.documentElement,
    callback: (mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement || node instanceof DocumentFragment) {
            scan(node)
          }
        })
        mutation.removedNodes.forEach((node) => scheduleRemovedCleanup(node))
      })
    },
  })
}

function scheduleRemovedCleanup(node: Node): void {
  const roots = collectDialogRoots(node)
  if (!roots.length) {
    return
  }
  queueMicrotask(() => {
    roots.forEach((candidate) => {
      if (candidate.isConnected) {
        return
      }
      registry.get(candidate)?.()
    })
  })
}

function collectDialogRoots(node: Node): RootEl[] {
  const results: RootEl[] = []
  if (node instanceof HTMLElement && node.matches("[data-affino-dialog-root]")) {
    results.push(node as RootEl)
  }
  if (node instanceof HTMLElement || node instanceof DocumentFragment) {
    node.querySelectorAll<RootEl>("[data-affino-dialog-root]").forEach((child) => results.push(child))
  }
  return results
}

function resolveOverlayId(root: RootEl): string {
  if (root.dataset.affinoDialogRoot) {
    return root.dataset.affinoDialogRoot
  }
  dialogOverlayIdCounter += 1
  return `affino-dialog-overlay-${dialogOverlayIdCounter}`
}

function resolveOverlayElement(root: RootEl): OverlayEl | null {
  const inline = root.querySelector<OverlayEl>("[data-affino-dialog-overlay]")
  if (inline) {
    return inline
  }
  const ownerId = root.dataset.affinoDialogRoot
  if (!ownerId) {
    return null
  }
  const selector = `[data-affino-dialog-overlay][data-affino-dialog-owner="${escapeAttributeValue(ownerId)}"]`
  const doc = root.ownerDocument ?? document
  return doc.querySelector<OverlayEl>(selector)
}

function escapeAttributeValue(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value)
  }
  return value.replace(/"/g, '\\"')
}

function findDialogRoot(id: string): RootEl | null {
  const escaped = escapeAttributeValue(id)
  return document.querySelector<RootEl>(`[data-affino-dialog-root="${escaped}"]`)
}

function toOpenReason(reason?: DialogOpenReason | DialogCloseReason): DialogOpenReason {
  if (reason && OPEN_REASONS.has(reason as DialogOpenReason)) {
    return reason as DialogOpenReason
  }
  return "programmatic"
}

function toCloseReason(reason?: DialogOpenReason | DialogCloseReason): DialogCloseReason {
  if (reason && CLOSE_REASONS.has(reason as DialogCloseReason)) {
    return reason as DialogCloseReason
  }
  return "programmatic"
}

export {
  hydrateDialog,
  scan,
  setupMutationObserver,
  findDialogRoot,
  toOpenReason,
  toCloseReason,
}
export type { RootEl }
