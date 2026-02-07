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
import { ensureDocumentObserver, getDocumentOverlayManager, type OverlayManager } from "@affino/overlay-kernel"
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
const DIALOG_ROOT_SELECTOR = "[data-affino-dialog-root]"

const registry = new WeakMap<RootEl, Cleanup>()
const structureRegistry = new WeakMap<RootEl, { overlay: OverlayEl; surface: SurfaceEl }>()
const pinnedOpenRegistry = new Map<string, boolean>()
const openStateRegistry = new Map<string, boolean>()
const focusSnapshotRegistry = new Map<string, FocusSnapshot>()
const dialogOwnerRegistry = new WeakMap<Document, Map<string, RootEl>>()
let dialogOverlayIdCounter = 0
const pendingScanScopes = new Set<ParentNode>()
const pendingRemovedRoots = new Set<RootEl>()
let scanFlushScheduled = false
let removedCleanupScheduled = false

type OverlayWindow = Window & { __affinoOverlayManager?: OverlayManager }

type FocusSnapshot = {
  key: FocusSnapshotKey | null
  selectionStart: number | null
  selectionEnd: number | null
}

type FocusSnapshotKey =
  | { type: "data"; value: string }
  | { type: "id"; value: string }
  | { type: "name"; value: string }

function resolveSharedOverlayManager(ownerDocument: Document): OverlayManager {
  const scope = ownerDocument.defaultView as OverlayWindow | null
  const existing = scope?.__affinoOverlayManager
  if (existing) {
    return existing
  }
  const manager = getDocumentOverlayManager(ownerDocument)
  if (scope) {
    scope.__affinoOverlayManager = manager
  }
  return manager
}

function hydrateDialog(root: RootEl): void {
  const resolveOverlay = () => resolveOverlayElement(root)
  const overlay = resolveOverlay()
  const surface = overlay?.querySelector<SurfaceEl>("[data-affino-dialog-surface]")
  if (!overlay || !surface) {
    return
  }

  if (root.dataset.affinoDialogTeleport && root.dataset.affinoDialogTeleport !== "inline") {
    const inlineOverlays = Array.from(root.querySelectorAll<OverlayEl>("[data-affino-dialog-overlay]"))
      .filter((node) => node !== overlay)
    inlineOverlays.forEach((node) => {
      node.dataset.state = "closed"
      node.hidden = true
    })
  }

  const previousStructure = structureRegistry.get(root)
  if (registry.has(root) && previousStructure && previousStructure.overlay === overlay && previousStructure.surface === surface) {
    return
  }

  const teardown = registry.get(root)
  teardown?.()

  const options = resolveOptions(root)
  const domStateOpen = root.dataset.affinoDialogState === "open"
  tagOverlayOwner(root, overlay)
  const teleportRestore = maybeTeleportOverlay(root, overlay, options.teleportTarget)
  const ownerDocument = root.ownerDocument ?? document
  const rootId = root.dataset.affinoDialogRoot ?? ""
  const persistedOpen = !options.stateSync && rootId ? openStateRegistry.get(rootId) : undefined
  const resolvedDefaultOpen = typeof persistedOpen === "boolean" ? persistedOpen : options.defaultOpen || domStateOpen
  const staleRoot = claimDialogOwner(ownerDocument, rootId, root)
  if (staleRoot) {
    registry.get(staleRoot)?.()
  }
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
    defaultOpen: resolvedDefaultOpen,
    overlayKind: options.overlayKind,
    closeStrategy: options.closeStrategy,
    pendingNavigationMessage: options.pendingMessage ?? undefined,
    maxPendingAttempts: options.maxPendingAttempts ?? undefined,
    focusOrchestrator: createFocusOrchestrator(surface, root, options, rootId),
    overlayManager: resolveSharedOverlayManager(ownerDocument),
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
  bindFocusSnapshotTracking(binding, rootId)

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
      captureFocusSnapshot(root, binding.surface)
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

  const syncOpenFromDomState = () => {
    const domState = root.dataset.affinoDialogState
    const snapshot = binding.controller.snapshot
    if (domState === "open") {
      if (!snapshot.isOpen && snapshot.phase !== "opening") {
        binding.controller.open("programmatic")
      }
      return
    }
    if (domState !== "closed" && domState !== "idle") {
      return
    }
    if (snapshot.isOpen || snapshot.phase === "opening" || snapshot.optimisticCloseInFlight) {
      binding.controller.close("programmatic")
    }
  }

  if (options.stateSync) {
    const stateObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.attributeName === "data-affino-dialog-state") {
          syncOpenFromDomState()
          return
        }
      }
    })
    stateObserver.observe(root, {
      attributes: true,
      attributeFilter: ["data-affino-dialog-state"],
    })
    binding.detachments.push(() => stateObserver.disconnect())
    syncOpenFromDomState()
  }

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
    releaseDialogOwner(ownerDocument, rootId, root)
    if (options.stateSync && rootId) {
      openStateRegistry.delete(rootId)
    }
    binding.teleportRestore?.()
    unregisterBinding(binding)
    registry.delete(root)
    structureRegistry.delete(root)
  })

  structureRegistry.set(root, { overlay, surface })
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
  const domState = snapshot.isOpen ? "open" : phase === "idle" ? "closed" : phase
  root.dataset.affinoDialogState = domState
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
  if (rootId) {
    if (options.stateSync) {
      openStateRegistry.delete(rootId)
    } else {
      const shouldPersistOpen = snapshot.isOpen || snapshot.phase === "opening" || snapshot.optimisticCloseInFlight
      if (shouldPersistOpen) {
        openStateRegistry.set(rootId, true)
      } else {
        openStateRegistry.delete(rootId)
      }
    }
    if (!snapshot.isOpen && snapshot.phase !== "opening" && !snapshot.optimisticCloseInFlight) {
      focusSnapshotRegistry.delete(rootId)
    }
  }

  if (snapshot.isOpen) {
    ensureGlobalGuardsActive()
  }

  const focusRootId = root.dataset.affinoDialogRoot ?? ""
  if (snapshot.isOpen && focusRootId && focusSnapshotRegistry.has(focusRootId)) {
    const active = root.ownerDocument?.activeElement
    if (!(active instanceof HTMLElement) || !surface.contains(active)) {
      requestAnimationFrame(() => {
        restoreFocusSnapshot(focusRootId, surface)
      })
    }
  }
}

function bindFocusSnapshotTracking(binding: DialogBinding, rootId: string): void {
  if (!rootId || typeof document === "undefined") {
    return
  }
  const surface = binding.surface
  const capture = () => {
    captureFocusSnapshot(binding.root, surface)
  }
  surface.addEventListener("focusin", capture)
  surface.addEventListener("input", capture)
  binding.detachments.push(() => surface.removeEventListener("focusin", capture))
  binding.detachments.push(() => surface.removeEventListener("input", capture))

  let pendingRestore = false
  const scheduleRestore = () => {
    if (pendingRestore) {
      return
    }
    pendingRestore = true
    requestAnimationFrame(() => {
      pendingRestore = false
      const snapshot = binding.controller.snapshot
      if (!snapshot.isOpen && snapshot.phase !== "opening") {
        return
      }
      const active = binding.root.ownerDocument?.activeElement
      if (active instanceof HTMLElement && surface.contains(active)) {
        return
      }
      restoreFocusSnapshot(rootId, surface)
    })
  }

  const observer = new MutationObserver(() => {
    if (!focusSnapshotRegistry.has(rootId)) {
      return
    }
    scheduleRestore()
  })
  observer.observe(surface, { childList: true, subtree: true })
  binding.detachments.push(() => observer.disconnect())
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
    stateSync: readBoolean(root.dataset.affinoDialogStateSync, false),
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

function createFocusOrchestrator(
  surface: SurfaceEl,
  root: RootEl,
  options: BindingOptions,
  rootId: string,
): DialogFocusOrchestrator {
  let previousFocus: HTMLElement | null = null
  return {
    activate: (_context: DialogOpenContext) => {
      previousFocus = options.returnFocus ? (root.ownerDocument?.activeElement as HTMLElement | null) : null
      requestAnimationFrame(() => {
        if (rootId && restoreFocusSnapshot(rootId, surface)) {
          return
        }
        const initial =
          surface.querySelector<HTMLElement>("[data-dialog-initial]") ?? getFocusableElements(surface)[0] ?? surface
        initial?.focus({ preventScroll: true })
        if (initial instanceof HTMLInputElement || initial instanceof HTMLTextAreaElement) {
          const length = initial.value.length
          if (length > 0) {
            try {
              initial.setSelectionRange(length, length)
            } catch {
              // ignore selection restore failures
            }
          }
        }
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

function captureFocusSnapshot(root: RootEl, surface: SurfaceEl): boolean {
  const rootId = root.dataset.affinoDialogRoot
  if (!rootId || typeof document === "undefined") {
    return false
  }
  const active = root.ownerDocument?.activeElement
  if (!(active instanceof HTMLElement)) {
    return false
  }
  if (!surface.contains(active)) {
    return false
  }
  const key = resolveFocusKey(active)
  if (!key) {
    return false
  }
  const selection = readSelection(active)
  focusSnapshotRegistry.set(rootId, {
    key,
    selectionStart: selection.start,
    selectionEnd: selection.end,
  })
  return true
}

function restoreFocusSnapshot(rootId: string, surface: SurfaceEl): boolean {
  const snapshot = focusSnapshotRegistry.get(rootId)
  if (!snapshot?.key) {
    return false
  }
  const target = resolveFocusTarget(surface, snapshot.key)
  if (!target) {
    return false
  }
  target.focus({ preventScroll: true })
  applySelection(target, snapshot.selectionStart, snapshot.selectionEnd)
  focusSnapshotRegistry.delete(rootId)
  return true
}

function resolveFocusTarget(surface: SurfaceEl, key: FocusSnapshotKey): HTMLElement | null {
  switch (key.type) {
    case "data":
      return surface.querySelector<HTMLElement>(
        `[data-affino-focus-key="${escapeAttributeValue(key.value)}"]`,
      )
    case "id":
      return surface.querySelector<HTMLElement>(`#${escapeAttributeValue(key.value)}`)
    case "name":
      return surface.querySelector<HTMLElement>(`[name="${escapeAttributeValue(key.value)}"]`)
    default:
      return null
  }
}

function resolveFocusKey(target: HTMLElement): FocusSnapshotKey | null {
  const focusKey = target.getAttribute("data-affino-focus-key")?.trim()
  if (focusKey) {
    return { type: "data", value: focusKey }
  }
  if (target.id) {
    return { type: "id", value: target.id }
  }
  const name = target.getAttribute("name")?.trim()
  if (name) {
    return { type: "name", value: name }
  }
  return null
}

function readSelection(target: HTMLElement): { start: number | null; end: number | null } {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return {
      start: target.selectionStart ?? null,
      end: target.selectionEnd ?? null,
    }
  }
  return { start: null, end: null }
}

function applySelection(target: HTMLElement, start: number | null, end: number | null): void {
  if (start == null || end == null) {
    return
  }
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    try {
      target.setSelectionRange(start, end)
    } catch {
      // ignore selection restore failures
    }
  }
}

function scan(root: ParentNode): void {
  if (root instanceof HTMLElement && root.matches(DIALOG_ROOT_SELECTOR)) {
    hydrateDialog(root as RootEl)
  }
  const nodes = root.querySelectorAll<RootEl>(DIALOG_ROOT_SELECTOR)
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
          if (nodeContainsDialog(node)) {
            scheduleScan(node)
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
  roots.forEach((candidate) => pendingRemovedRoots.add(candidate))
  if (removedCleanupScheduled) {
    return
  }
  removedCleanupScheduled = true
  enqueueMicrotask(flushRemovedRoots)
}

function scheduleScan(scope: ParentNode): void {
  pendingScanScopes.add(scope)
  if (scanFlushScheduled) {
    return
  }
  scanFlushScheduled = true
  enqueueMicrotask(flushPendingScans)
}

function flushPendingScans(): void {
  scanFlushScheduled = false
  const scopes = Array.from(pendingScanScopes)
  pendingScanScopes.clear()
  scopes.forEach((scope) => {
    if (scope instanceof Element && !scope.isConnected) {
      return
    }
    if (scope instanceof DocumentFragment && !scope.isConnected) {
      return
    }
    scan(scope)
  })
}

function flushRemovedRoots(): void {
  removedCleanupScheduled = false
  const roots = Array.from(pendingRemovedRoots)
  pendingRemovedRoots.clear()
  roots.forEach((candidate) => {
    if (candidate.isConnected) {
      return
    }
    registry.get(candidate)?.()
  })
}

function enqueueMicrotask(task: () => void): void {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(task)
    return
  }
  Promise.resolve().then(task)
}

function nodeContainsDialog(node: Node): node is HTMLElement | DocumentFragment {
  if (node instanceof HTMLElement) {
    if (node.matches(DIALOG_ROOT_SELECTOR)) {
      return true
    }
    return node.querySelector(DIALOG_ROOT_SELECTOR) !== null
  }
  if (node instanceof DocumentFragment) {
    return node.querySelector(DIALOG_ROOT_SELECTOR) !== null
  }
  return false
}

function collectDialogRoots(node: Node): RootEl[] {
  const results: RootEl[] = []
  if (node instanceof HTMLElement && node.matches(DIALOG_ROOT_SELECTOR)) {
    results.push(node as RootEl)
  }
  if (node instanceof HTMLElement || node instanceof DocumentFragment) {
    node.querySelectorAll<RootEl>(DIALOG_ROOT_SELECTOR).forEach((child) => results.push(child))
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
  const ownerId = root.dataset.affinoDialogRoot
  if (!ownerId) {
    return null
  }
  const teleport = root.dataset.affinoDialogTeleport
  const doc = root.ownerDocument ?? document
  const inline = root.querySelector<OverlayEl>("[data-affino-dialog-overlay]")
  if (teleport && teleport !== "inline") {
    if (inline) {
      return inline
    }
    const teleported = resolveTeleportedOverlay(root)
    if (teleported) {
      return teleported
    }
  }
  if (inline) {
    return inline
  }
  const selector = `[data-affino-dialog-overlay][data-affino-dialog-owner="${escapeAttributeValue(ownerId)}"]`
  return doc.querySelector<OverlayEl>(selector)
}

function resolveTeleportedOverlay(root: RootEl): OverlayEl | null {
  const ownerId = root.dataset.affinoDialogRoot
  if (!ownerId) {
    return null
  }
  const doc = root.ownerDocument ?? document
  const selector = `[data-affino-dialog-overlay][data-affino-dialog-owner="${escapeAttributeValue(ownerId)}"]`
  const overlays = Array.from(doc.querySelectorAll<OverlayEl>(selector))
  const outsideRoot = overlays.find((overlay) => !root.contains(overlay))
  if (outsideRoot) {
    return outsideRoot
  }
  return overlays[0] ?? null
}

function claimDialogOwner(ownerDocument: Document, rootId: string, root: RootEl): RootEl | null {
  if (!rootId) {
    return null
  }
  const owners = dialogOwnersFor(ownerDocument)
  const previous = owners.get(rootId)
  owners.set(rootId, root)
  if (previous === root) {
    return null
  }
  return previous ?? null
}

function releaseDialogOwner(ownerDocument: Document, rootId: string, root: RootEl): void {
  if (!rootId) {
    return
  }
  const owners = dialogOwnerRegistry.get(ownerDocument)
  if (!owners) {
    return
  }
  if (owners.get(rootId) !== root) {
    return
  }
  owners.delete(rootId)
  if (!owners.size) {
    dialogOwnerRegistry.delete(ownerDocument)
  }
}

function dialogOwnersFor(ownerDocument: Document): Map<string, RootEl> {
  const existing = dialogOwnerRegistry.get(ownerDocument)
  if (existing) {
    return existing
  }
  const created = new Map<string, RootEl>()
  dialogOwnerRegistry.set(ownerDocument, created)
  return created
}

function escapeAttributeValue(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value)
  }
  return value.replace(/"/g, '\\"')
}

function findDialogRoot(id: string): RootEl | null {
  const escaped = escapeAttributeValue(id)
  return document.querySelector<RootEl>(`${DIALOG_ROOT_SELECTOR}[data-affino-dialog-root="${escaped}"]`)
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
