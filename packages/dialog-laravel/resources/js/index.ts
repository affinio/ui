import { DialogController } from "@affino/dialog-core"
import type {
  CloseRequestOptions,
  CloseStrategy,
  DialogCloseContext,
  DialogCloseReason,
  DialogFocusOrchestrator,
  DialogOpenContext,
  DialogOpenReason,
  DialogSnapshot,
  OverlayKind,
  OverlayRegistration,
  OverlayRegistrar,
} from "@affino/dialog-core"
import { createGlobalKeydownManager, createScrollLockController, ensureOverlayHost } from "@affino/overlay-host"
import { focusEdge, getFocusableElements, trapFocus } from "@affino/focus-utils"

type RootEl = HTMLElement & {
  dataset: DOMStringMap & {
    affinoDialogRoot?: string
    affinoDialogModal?: string
    affinoDialogCloseBackdrop?: string
    affinoDialogCloseEscape?: string
    affinoDialogLockScroll?: string
    affinoDialogReturnFocus?: string
    affinoDialogPinned?: string
    affinoDialogDefaultOpen?: string
    affinoDialogOverlayKind?: OverlayKind
    affinoDialogCloseStrategy?: string
    affinoDialogTeleport?: string
    affinoDialogPendingMessage?: string
    affinoDialogMaxPending?: string
    affinoDialogState?: string
  }
  affinoDialog?: DialogHandle
}

type OverlayEl = HTMLElement & {
  dataset: DOMStringMap & {
    state?: string
    affinoDialogOwner?: string
  }
}

type SurfaceEl = HTMLElement & {
  dataset: DOMStringMap & {
    state?: string
  }
}

type DialogHandle = {
  open: (reason?: DialogOpenReason) => void
  close: (reason?: DialogCloseReason, options?: CloseRequestOptions) => void
  toggle: (reason?: DialogOpenReason | DialogCloseReason) => void
  getSnapshot: () => DialogSnapshot
}

type BindingOptions = {
  modal: boolean
  closeOnBackdrop: boolean
  closeOnEscape: boolean
  lockScroll: boolean
  returnFocus: boolean
  pinned: boolean
  defaultOpen: boolean
  overlayKind: OverlayKind
  closeStrategy: CloseStrategy
  teleportTarget: string | null
  pendingMessage: string | null
  maxPendingAttempts: number | null
}

type DialogBinding = {
  root: RootEl
  overlay: OverlayEl
  surface: SurfaceEl
  controller: DialogController
  options: BindingOptions
  detachments: Array<() => void>
  lockHeld: boolean
  teleportRestore: (() => void) | null
  sentinelCleanup: (() => void) | null
}

type Cleanup = () => void

type FocusSentinel = HTMLElement & {
  dataset: DOMStringMap & { affinoDialogSentinel?: string }
}

type ManualDetail = {
  id?: string
  action?: "open" | "close" | "toggle"
  reason?: DialogOpenReason | DialogCloseReason
  options?: CloseRequestOptions
}

const OPEN_REASONS = new Set<DialogOpenReason>(["programmatic", "pointer", "keyboard", "trigger"])
const CLOSE_REASONS = new Set<DialogCloseReason>(["escape-key", "backdrop", "programmatic", "pointer", "nested-dialog-request"])

const registry = new WeakMap<RootEl, Cleanup>()
const overlayBindings = new Map<string, DialogBinding>()
const pinnedOpenRegistry = new Map<string, boolean>()
const scrollLocker = createScrollLockController()
const keydownManager = createGlobalKeydownManager(handleGlobalKeydown)
const globalOverlayRegistrar = createGlobalOverlayRegistrar()
let scrollLockRefs = 0
let mutationObserver: MutationObserver | null = null
let livewireHooked = false
let manualBridgeBound = false

export function bootstrapAffinoDialogs(): void {
  if (typeof document === "undefined") {
    return
  }
  scan(document)
  setupMutationObserver()
  setupLivewireHooks()
  setupManualBridge()
}

export function hydrateDialog(root: RootEl): void {
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
  }

  binding.controller = new DialogController({
    defaultOpen: options.defaultOpen,
    overlayKind: options.overlayKind,
    closeStrategy: options.closeStrategy,
    pendingNavigationMessage: options.pendingMessage ?? undefined,
    maxPendingAttempts: options.maxPendingAttempts ?? undefined,
    focusOrchestrator: createFocusOrchestrator(surface, root, options),
    overlayRegistrar: wrapOverlayRegistrar(
      globalOverlayRegistrar,
      (id) => overlayBindings.set(id, binding),
      (id) => overlayBindings.delete(id),
    ),
  })

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
      releaseScrollLock()
      binding.lockHeld = false
    }
    binding.teleportRestore?.()
    registry.delete(root)
  })
}

function bindTriggers(binding: DialogBinding) {
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

function bindDismissListeners(binding: DialogBinding) {
  const handler = (event: Event) => {
    const target = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[data-affino-dialog-dismiss]") : null
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

function bindBackdrop(binding: DialogBinding) {
  const pointerHandler = (event: PointerEvent) => {
    if (event.target !== binding.overlay) {
      return
    }
    if (!binding.options.closeOnBackdrop) {
      return
    }
    binding.controller.close("backdrop")
  }
  binding.overlay.addEventListener("pointerdown", pointerHandler)
  binding.detachments.push(() => binding.overlay.removeEventListener("pointerdown", pointerHandler))
}

function bindSentinels(binding: DialogBinding) {
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

function applySnapshot(binding: DialogBinding, snapshot: DialogSnapshot) {
  const { root, overlay, surface, options } = binding
  const phase = snapshot.phase
  const visible =
    snapshot.isOpen || snapshot.phase === "opening" || snapshot.phase === "closing" || snapshot.optimisticCloseInFlight
  root.dataset.affinoDialogState = snapshot.isOpen ? "open" : phase
  overlay.dataset.state = phase
  overlay.hidden = !visible
  surface.dataset.state = phase

  if (visible && !binding.lockHeld && options.lockScroll) {
    acquireScrollLock()
    binding.lockHeld = true
  }
  if (!visible && binding.lockHeld) {
    releaseScrollLock()
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

function tagOverlayOwner(root: RootEl, overlay: OverlayEl) {
  const ownerId = root.dataset.affinoDialogRoot
  if (ownerId) {
    overlay.dataset.affinoDialogOwner = ownerId
  }
}

function maybeTeleportOverlay(root: RootEl, overlay: OverlayEl, target: string | null): (() => void) | null {
  if (!target) {
    return null
  }
  const doc = root.ownerDocument ?? document
  let host: HTMLElement | null = null
  if (target === "auto" || target === "#affino-dialog-host") {
    host = ensureOverlayHost({ id: "affino-dialog-host", attribute: "data-affino-dialog-host", document: doc })
  } else {
    host = doc.querySelector<HTMLElement>(target)
  }
  if (!host || overlay.parentElement === host) {
    return null
  }
  const parent = overlay.parentElement
  const nextSibling = overlay.nextSibling
  const placeholder = doc.createComment("affino-dialog-portal")
  parent?.replaceChild(placeholder, overlay)
  host.appendChild(overlay)
  return () => {
    if (placeholder.parentNode) {
      placeholder.parentNode.replaceChild(overlay, placeholder)
      return
    }
    if (parent?.isConnected) {
      if (nextSibling && nextSibling.parentNode === parent) {
        parent.insertBefore(overlay, nextSibling)
      } else {
        parent.appendChild(overlay)
      }
      return
    }
    overlay.remove()
  }
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

function createGlobalOverlayRegistrar(): OverlayRegistrar {
  let stack: OverlayRegistration[] = []
  return {
    register(registration: OverlayRegistration) {
      stack = [...stack.filter((entry) => entry.id !== registration.id), registration]
      ensureGlobalGuardsActive()
      return () => {
        stack = stack.filter((entry) => entry.id !== registration.id)
        ensureGlobalGuardsState(stack)
      }
    },
    isTopMost(id: string) {
      if (!stack.length) {
        return false
      }
      return stack[stack.length - 1]?.id === id
    },
  }
}

function wrapOverlayRegistrar(
  registrar: OverlayRegistrar,
  onRegister: (id: string) => void,
  onDispose: (id: string) => void,
): OverlayRegistrar {
  return {
    register(registration) {
      onRegister(registration.id)
      const dispose = registrar.register(registration)
      return () => {
        onDispose(registration.id)
        if (typeof dispose === "function") {
          dispose()
        }
      }
    },
    isTopMost(id) {
      return registrar.isTopMost(id)
    },
  }
}

function handleGlobalKeydown(event: KeyboardEvent) {
  const topEntry = getTopMostBinding()
  if (!topEntry) {
    return
  }
  if (event.key === "Escape") {
    if (!topEntry.options.closeOnEscape) {
      return
    }
    event.preventDefault()
    topEntry.controller.close("escape-key")
    return
  }
  if (event.key === "Tab") {
    if (!topEntry.surface.contains(event.target as Node)) {
      return
    }
    trapFocus(event, topEntry.surface)
  }
}

function getTopMostBinding(): DialogBinding | null {
  const entries = Array.from(overlayBindings.values())
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const candidate = entries[index]
    if (!candidate) {
      continue
    }
    const snapshot = candidate.controller.snapshot
    const visible =
      snapshot.isOpen || snapshot.phase === "opening" || snapshot.phase === "closing" || snapshot.optimisticCloseInFlight
    if (visible) {
      return candidate
    }
  }
  return null
}

function ensureGlobalGuardsActive() {
  if (!keydownManager.isActive()) {
    keydownManager.activate()
  }
}

function ensureGlobalGuardsState(stack: OverlayRegistration[]) {
  if (!stack.length) {
    keydownManager.deactivate()
  }
}

function acquireScrollLock() {
  if (scrollLockRefs === 0) {
    scrollLocker.lock()
  }
  scrollLockRefs += 1
}

function releaseScrollLock() {
  if (scrollLockRefs === 0) {
    return
  }
  scrollLockRefs -= 1
  if (scrollLockRefs === 0) {
    scrollLocker.unlock()
  }
}

function scan(root: ParentNode): void {
  if (root instanceof HTMLElement && root.matches("[data-affino-dialog-root]")) {
    hydrateDialog(root as RootEl)
  }
  const nodes = root.querySelectorAll<RootEl>("[data-affino-dialog-root]")
  nodes.forEach((node) => hydrateDialog(node))
}

function setupMutationObserver() {
  if (mutationObserver || typeof document === "undefined") {
    return
  }
  mutationObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement || node instanceof DocumentFragment) {
          scan(node)
        }
      })
      mutation.removedNodes.forEach((node) => scheduleRemovedCleanup(node))
    })
  })
  mutationObserver.observe(document.documentElement, { childList: true, subtree: true })
}

function scheduleRemovedCleanup(node: Node) {
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

function setupLivewireHooks() {
  if (typeof window === "undefined" || livewireHooked) {
    return
  }
  const livewire = (window as any).Livewire
  if (!livewire) {
    return
  }
  if (typeof livewire.hook === "function") {
    livewire.hook("morph.added", ({ el }: { el: Element }) => {
      if (el instanceof HTMLElement || el instanceof DocumentFragment) {
        scan(el)
      }
    })
    livewire.hook("message.processed", (_message: unknown, component: { el?: Element }) => {
      const scope = component?.el
      if (scope instanceof HTMLElement || scope instanceof DocumentFragment) {
        scan(scope)
        return
      }
      scan(document)
    })
  }
  document.addEventListener("livewire:navigated", () => {
    scan(document)
  })
  livewireHooked = true
}

function setupManualBridge() {
  if (manualBridgeBound || typeof document === "undefined") {
    return
  }
  const handledFlag = "__affinoDialogManualHandled"
  document.addEventListener("affino-dialog:manual", (nativeEvent) => {
    const event = nativeEvent as CustomEvent<ManualDetail>
    if ((event as any)[handledFlag]) {
      return
    }
    ;(event as any)[handledFlag] = true
    const detail = event.detail
    if (!detail?.id || !detail.action) {
      return
    }
    const root = findDialogRoot(detail.id)
    if (!root?.affinoDialog) {
      return
    }
    if (detail.action === "open") {
      root.affinoDialog.open(toOpenReason(detail.reason))
      return
    }
    if (detail.action === "close") {
      root.affinoDialog.close(toCloseReason(detail.reason), detail.options)
      return
    }
    root.affinoDialog.toggle(detail.reason)
  })
  manualBridgeBound = true
}

function findDialogRoot(id: string): RootEl | null {
  const escaped = escapeAttributeValue(id)
  return document.querySelector<RootEl>(`[data-affino-dialog-root="${escaped}"]`)
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
