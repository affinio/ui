import { PopoverCore } from "@affino/popover-core"
import {
  acquireDocumentScrollLock,
  didStructureChange,
  ensureDocumentObserver,
  getDocumentOverlayManager,
  releaseDocumentScrollLock,
  type OverlayManager,
} from "@affino/overlay-kernel"
import type { SurfaceReason } from "@affino/popover-core"
import { attachHandle, bindArrowProps, bindProps, resetArrow } from "./dom"
import { resolveOptions } from "./options"
import {
  claimPopoverOwner,
  getActivePopoverRoot,
  registry,
  releasePopoverOwner,
  setActivePopoverRoot,
  structureRegistry,
} from "./registry"
import type { Detachment, RootEl } from "./types"

type OverlayWindow = Window & { __affinoOverlayManager?: OverlayManager }
const openStateRegistry = new Map<string, boolean>()
const focusSnapshotRegistry = new Map<string, FocusSnapshot>()
const FOCUSABLE_WITHIN_SELECTOR = [
  '[data-affino-focus-key]',
  "input:not([disabled])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  "button:not([disabled])",
  "a[href]",
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
  '[contenteditable=""]',
].join(",")
const NON_TEXT_INPUT_TYPES = new Set(["button", "submit", "reset", "checkbox", "radio", "file", "range", "color", "image", "hidden"])

type FocusSnapshot = {
  key: FocusSnapshotKey | null
  fallbackIndex: number
  selectionStart: number | null
  selectionEnd: number | null
  priority: number
}

type FocusSnapshotKey =
  | { type: "data"; value: string }
  | { type: "id"; value: string }
  | { type: "name"; value: string }
  | { type: "wire"; value: string }

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

export function hydratePopover(root: RootEl): void {
  const resolveTrigger = () => root.querySelector<HTMLElement>("[data-affino-popover-trigger]")
  const resolveContent = () => root.querySelector<HTMLElement>("[data-affino-popover-content]")
  const trigger = resolveTrigger()
  const content = resolveContent()
  if (!trigger || !content) {
    return
  }

  const nestedInPopover = Boolean(root.closest("[data-affino-popover-content]"))
  const containsNestedPopover = Boolean(content.querySelector("[data-affino-popover-root]"))
  const shouldUseTransform = !nestedInPopover && !containsNestedPopover

  const options = resolveOptions(root)
  const initialStateOpen = root.dataset.affinoPopoverState === "open"
  const ownerDocument = root.ownerDocument ?? document
  const popoverId = root.dataset.affinoPopoverRoot ?? ""
  const teardown = registry.get(root)
  const hasStoredFocusSnapshot = (id: string) => Boolean(id && focusSnapshotRegistry.has(id))
  let pendingFocusRestore = captureFocusSnapshot(root, popoverId) || hasStoredFocusSnapshot(popoverId)
  teardown?.()
  const stateSyncEnabled = root.dataset.affinoPopoverStateSync === "true"
  const persistedOpen = popoverId ? openStateRegistry.get(popoverId) : undefined
  const resolvedDefaultOpen = stateSyncEnabled
    ? options.defaultOpen || initialStateOpen
    : (typeof persistedOpen === "boolean" ? persistedOpen : options.defaultOpen || initialStateOpen)
  const staleRoot = claimPopoverOwner(ownerDocument, popoverId, root)
  if (staleRoot) {
    pendingFocusRestore = captureFocusSnapshot(staleRoot, popoverId) || pendingFocusRestore || hasStoredFocusSnapshot(popoverId)
    registry.get(staleRoot)?.()
  }
  const popover = new PopoverCore({
    id: popoverId,
    closeOnEscape: options.closeOnEscape,
    closeOnInteractOutside: options.closeOnInteractOutside,
    modal: options.modal,
    defaultOpen: resolvedDefaultOpen,
    overlayManager: resolveSharedOverlayManager(ownerDocument),
    overlayEntryTraits: {
      root: content,
      returnFocus: options.returnFocus,
    },
  })

  const detachments: Detachment[] = []
  const triggerProps = popover.getTriggerProps()
  const contentProps = popover.getContentProps({
    role: options.role,
    modal: options.modal,
  })
  detachments.push(bindProps(trigger, triggerProps))
  detachments.push(bindProps(content, contentProps))
  detachments.push(attachHandle(root, popover))
  bindDismissListeners(root, popover, detachments)

  const arrow = content.querySelector<HTMLElement>("[data-affino-popover-arrow]")
  let pendingMeasureFrame: number | null = null
  let pendingPositionSync: number | null = null
  let outsideCleanup: (() => void) | null = null
  let relayoutCleanup: (() => void) | null = null
  let resizeObserver: ResizeObserver | null = null
  let scrollLocked = false

  const updatePosition = () => {
    if (!root.isConnected || content.hidden) {
      return
    }

    const anchorRect = trigger.getBoundingClientRect()
    const surfaceRect = content.getBoundingClientRect()
    if (surfaceRect.width === 0 && surfaceRect.height === 0) {
      if (pendingMeasureFrame === null) {
        pendingMeasureFrame = requestAnimationFrame(() => {
          pendingMeasureFrame = null
          updatePosition()
        })
      }
      return
    }

    const position = popover.computePosition(anchorRect, surfaceRect, {
      placement: options.placement,
      align: options.align,
      gutter: options.gutter,
      viewportPadding: options.viewportPadding,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    })

    content.style.position = options.strategy
    content.style.left = `${Math.round(position.left)}px`
    content.style.top = `${Math.round(position.top)}px`
    content.style.transform = shouldUseTransform ? "translate3d(0, 0, 0)" : ""
    content.dataset.placement = position.placement
    content.dataset.align = position.align

    if (arrow && options.arrow) {
      const arrowProps = popover.getArrowProps({
        anchorRect,
        popoverRect: surfaceRect,
        position,
        options: options.arrow,
      })
      bindArrowProps(arrow, arrowProps)
    }
  }

  const resetPosition = () => {
    if (pendingMeasureFrame !== null) {
      cancelAnimationFrame(pendingMeasureFrame)
      pendingMeasureFrame = null
    }
    if (pendingPositionSync !== null) {
      cancelAnimationFrame(pendingPositionSync)
      pendingPositionSync = null
    }
    content.style.position = options.strategy
    content.style.left = "-9999px"
    content.style.top = "-9999px"
    content.style.transform = shouldUseTransform ? "translate3d(0, 0, 0)" : ""
    content.style.visibility = ""
    delete content.dataset.placement
    delete content.dataset.align
    if (arrow) {
      resetArrow(arrow)
    }
  }

  const syncPosition = () => {
    content.style.visibility = "hidden"
    updatePosition()
    if (pendingPositionSync !== null) {
      cancelAnimationFrame(pendingPositionSync)
    }
    pendingPositionSync = requestAnimationFrame(() => {
      pendingPositionSync = null
      if (!content.hidden) {
        updatePosition()
        content.style.visibility = ""
      }
    })
  }

  const attachOutsideGuards = () => {
    if (outsideCleanup || (!options.closeOnInteractOutside && !options.modal)) {
      return
    }
    const doc = document
    const pointerHandler = (event: Event) => {
      if (isWithinSurface(event.target, trigger, content)) {
        return
      }
      if (options.closeOnInteractOutside) {
        popover.interactOutside({ event, target: event.target ?? null })
        return
      }
      if (options.modal) {
        event.preventDefault()
        event.stopPropagation()
        content.focus({ preventScroll: true })
      }
    }
    const focusHandler = (event: FocusEvent) => {
      if (isWithinSurface(event.target, trigger, content)) {
        return
      }
      if (options.closeOnInteractOutside) {
        popover.interactOutside({ event, target: event.target ?? null })
        return
      }
      if (options.modal) {
        event.preventDefault()
        content.focus({ preventScroll: true })
      }
    }
    doc.addEventListener("pointerdown", pointerHandler, true)
    doc.addEventListener("focusin", focusHandler, true)
    outsideCleanup = () => {
      doc.removeEventListener("pointerdown", pointerHandler, true)
      doc.removeEventListener("focusin", focusHandler, true)
      outsideCleanup = null
    }
  }

  const detachOutsideGuards = () => {
    outsideCleanup?.()
  }

  const attachRelayoutHandlers = () => {
    if (relayoutCleanup) {
      return
    }
    const handleRelayout = () => {
      if (content.hidden) {
        return
      }
      requestAnimationFrame(updatePosition)
    }
    window.addEventListener("resize", handleRelayout)
    window.addEventListener("scroll", handleRelayout, true)
    relayoutCleanup = () => {
      window.removeEventListener("resize", handleRelayout)
      window.removeEventListener("scroll", handleRelayout, true)
      relayoutCleanup = null
    }
  }

  const detachRelayoutHandlers = () => {
    relayoutCleanup?.()
  }

  const syncOpenFromDomState = () => {
    if (!stateSyncEnabled) {
      return
    }
    const domOpen = root.dataset.affinoPopoverState === "open"
    const snapshotOpen = popover.getSnapshot().open
    if (domOpen && !snapshotOpen) {
      popover.open("programmatic")
      return
    }
    if (!domOpen && snapshotOpen) {
      popover.close("programmatic")
    }
  }

  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => {
      if (!content.hidden) {
        updatePosition()
      }
    })
    resizeObserver.observe(trigger)
  }

  let pendingStructureRehydrate = false
  const scheduleStructureRehydrate = () => {
    if (pendingStructureRehydrate) {
      return
    }
    pendingStructureRehydrate = true
    Promise.resolve().then(() => {
      pendingStructureRehydrate = false
      if (!root.isConnected) {
        return
      }
      hydratePopover(root)
    })
  }

  const structureObserver = new MutationObserver(() => {
    const nextTrigger = resolveTrigger()
    const nextContent = resolveContent()
    if (nextTrigger !== trigger || nextContent !== content) {
      scheduleStructureRehydrate()
    }
  })
  structureObserver.observe(root, { childList: true, subtree: true })
  detachments.push(() => structureObserver.disconnect())

  const applyState = (open: boolean) => {
    const state = open ? "open" : "closed"
    root.dataset.affinoPopoverState = state
    content.dataset.state = state
    content.hidden = !open
    rememberOpenState(popoverId, open)

    if (open) {
      content.style.position = options.strategy
      content.style.left = "0px"
      content.style.top = "0px"
      content.style.visibility = "hidden"
      ensureSingleActivePopover(root)
      attachOutsideGuards()
      attachRelayoutHandlers()
      if ((options.lockScroll || options.modal) && !scrollLocked) {
        acquireDocumentScrollLock(root.ownerDocument, "popover")
        scrollLocked = true
      }
      syncPosition()
      if (pendingFocusRestore) {
        requestAnimationFrame(() => {
          pendingFocusRestore = false
          restoreFocusSnapshot(popoverId, content)
        })
      }
    } else {
      detachOutsideGuards()
      detachRelayoutHandlers()
      if ((options.lockScroll || options.modal) && scrollLocked) {
        releaseDocumentScrollLock(root.ownerDocument, "popover")
        scrollLocked = false
      }
      resetPosition()
      if (options.returnFocus && document.activeElement !== trigger) {
        const parentRoot = resolveParentPopoverRoot(root)
        requestAnimationFrame(() => {
          if (parentRoot) {
            const parentContent = parentRoot.querySelector<HTMLElement>("[data-affino-popover-content]")
            if (parentContent) {
              parentContent.focus({ preventScroll: true })
              return
            }
          }
          if (!trigger.isConnected) {
            return
          }
          trigger.focus({ preventScroll: true })
        })
      }
      if (getActivePopoverRoot(root.ownerDocument) === root) {
        setActivePopoverRoot(root.ownerDocument, resolveParentPopoverRoot(root))
      }
    }
  }

  const unsubscribe = popover.subscribe((snapshot) => {
    applyState(snapshot.open)
  })

  const stateObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes" && mutation.attributeName === "data-affino-popover-state") {
        syncOpenFromDomState()
        return
      }
    }
  })
  if (stateSyncEnabled) {
    stateObserver.observe(root, {
      attributes: true,
      attributeFilter: ["data-affino-popover-state"],
    })
    detachments.push(() => stateObserver.disconnect())
    syncOpenFromDomState()
  }

  detachments.push(() => {
    unsubscribe.unsubscribe()
    resizeObserver?.disconnect()
    detachOutsideGuards()
    detachRelayoutHandlers()
    resetPosition()
  })

  if (options.pinned || resolvedDefaultOpen || initialStateOpen) {
    requestAnimationFrame(() => {
      if (root.isConnected && (options.pinned || resolvedDefaultOpen || root.dataset.affinoPopoverState === "open")) {
        popover.open("programmatic")
      }
    })
  }

  detachments.push(() => popover.destroy())

  registry.set(root, () => {
    releasePopoverOwner(ownerDocument, popoverId, root)
    if (getActivePopoverRoot(root.ownerDocument) === root) {
      setActivePopoverRoot(root.ownerDocument, null)
    }
    if (scrollLocked) {
      releaseDocumentScrollLock(root.ownerDocument, "popover")
      scrollLocked = false
    }
    detachments.forEach((cleanup) => cleanup())
    registry.delete(root)
  })
  structureRegistry.set(root, { trigger, content })
}

export function scan(node: ParentNode): void {
  if (node instanceof HTMLElement && node.matches("[data-affino-popover-root]")) {
    maybeHydratePopover(node as RootEl)
  }
  const roots = node.querySelectorAll<RootEl>("[data-affino-popover-root]")
  roots.forEach((root) => maybeHydratePopover(root))
}

export function captureFocusSnapshotForNode(node: Node): void {
  collectRelatedPopoverRoots(node).forEach((root) => {
    const popoverId = root.dataset.affinoPopoverRoot ?? ""
    captureFocusSnapshot(root, popoverId)
  })
}

export function restoreFocusSnapshotForNode(node: Node): void {
  collectRelatedPopoverRoots(node).forEach((root) => {
    const popoverId = root.dataset.affinoPopoverRoot ?? ""
    const content = root.querySelector<HTMLElement>("[data-affino-popover-content]")
    if (!content) {
      return
    }
    requestAnimationFrame(() => {
      restoreFocusSnapshot(popoverId, content)
    })
  })
}

export function setupMutationObserver(): void {
  if (typeof document === "undefined") {
    return
  }
  ensureDocumentObserver({
    globalKey: "__affinoPopoverObserver",
    target: document.documentElement,
    callback: (mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement || node instanceof DocumentFragment) {
            scan(node)
          }
        })
        mutation.removedNodes.forEach((node) => {
          cleanupRemovedNode(node)
        })
      })
    },
  })
}

function cleanupRemovedNode(node: Node): void {
  const roots = collectPopoverRoots(node)
  if (!roots.length) {
    return
  }
  queueMicrotask(() => {
    roots.forEach((root) => {
      if (!root.isConnected) {
        registry.get(root)?.()
      }
    })
  })
}

function collectPopoverRoots(node: Node): RootEl[] {
  const roots: RootEl[] = []
  if (node instanceof HTMLElement && node.matches("[data-affino-popover-root]")) {
    roots.push(node as RootEl)
  }
  if (node instanceof HTMLElement || node instanceof DocumentFragment) {
    node.querySelectorAll<RootEl>("[data-affino-popover-root]").forEach((root) => roots.push(root))
  }
  return roots
}

function collectRelatedPopoverRoots(node: Node): RootEl[] {
  const seen = new Set<RootEl>()
  if (node instanceof HTMLElement) {
    const nearest = node.closest<RootEl>("[data-affino-popover-root]")
    if (nearest) {
      seen.add(nearest)
    }
  }
  collectPopoverRoots(node).forEach((root) => seen.add(root))
  return Array.from(seen)
}

function maybeHydratePopover(root: RootEl): void {
  const nextTrigger = root.querySelector<HTMLElement>("[data-affino-popover-trigger]")
  const nextContent = root.querySelector<HTMLElement>("[data-affino-popover-content]")
  if (!nextTrigger || !nextContent) {
    return
  }
  const previous = structureRegistry.get(root)
  const next = { trigger: nextTrigger, content: nextContent }
  const hasBinding = registry.has(root)
  if (hasBinding && !didStructureChange(previous, next)) {
    return
  }
  hydratePopover(root)
}

function ensureSingleActivePopover(nextRoot: RootEl): void {
  const ownerDocument = nextRoot.ownerDocument
  const activePopoverRoot = getActivePopoverRoot(ownerDocument)
  const isNested = Boolean(
    activePopoverRoot && (activePopoverRoot.contains(nextRoot) || nextRoot.contains(activePopoverRoot)),
  )
  if (activePopoverRoot && activePopoverRoot !== nextRoot && !isPersistentPopover(activePopoverRoot) && !isNested) {
    closePopoverRoot(activePopoverRoot, "programmatic")
  }
  if (!isPersistentPopover(nextRoot)) {
    setActivePopoverRoot(ownerDocument, nextRoot)
  }
}

function resolveParentPopoverRoot(root: RootEl): RootEl | null {
  const parent = root.parentElement?.closest<RootEl>("[data-affino-popover-root]") ?? null
  if (!parent) {
    return null
  }
  return parent.dataset.affinoPopoverState === "open" ? parent : null
}

function closePopoverRoot(root: RootEl, reason: SurfaceReason): void {
  root.affinoPopover?.close(reason)
  const ownerDocument = root.ownerDocument
  if (getActivePopoverRoot(ownerDocument) === root) {
    setActivePopoverRoot(ownerDocument, null)
  }
}

function isWithinSurface(target: EventTarget | null, trigger: HTMLElement, content: HTMLElement): boolean {
  if (!(target instanceof Node)) {
    return false
  }
  return trigger.contains(target) || content.contains(target)
}

function isPinnedPopover(root: RootEl): boolean {
  return root.dataset.affinoPopoverPinned === "true"
}

function isModalPopover(root: RootEl): boolean {
  return root.dataset.affinoPopoverModal === "true"
}

function isManualPopover(root: RootEl): boolean {
  return root.dataset.affinoPopoverManual === "true"
}

function isPersistentPopover(root: RootEl): boolean {
  return isPinnedPopover(root) || isModalPopover(root) || isManualPopover(root)
}

function rememberOpenState(popoverId: string, open: boolean): void {
  if (!popoverId) {
    return
  }
  openStateRegistry.set(popoverId, open)
}

function captureFocusSnapshot(root: RootEl, popoverId: string): boolean {
  if (!popoverId) {
    return false
  }
  const content = root.querySelector<HTMLElement>("[data-affino-popover-content]")
  if (!content) {
    return false
  }
  const ownerDocument = root.ownerDocument ?? document
  const active = ownerDocument.activeElement
  if (!(active instanceof HTMLElement) || !content.contains(active)) {
    return false
  }
  if (active === content) {
    return false
  }

  const focusables = collectFocusableNodes(content)
  const fallbackIndex = focusables.indexOf(active)
  const selection = readSelection(active)
  const key = resolveFocusKey(active)
  const priority = resolveFocusPriority(active, key)
  if (priority <= 0) {
    return false
  }

  const existing = focusSnapshotRegistry.get(popoverId)
  if (existing) {
    if (existing.priority > priority) {
      return false
    }
    if (existing.priority === priority && existing.key && !key) {
      return false
    }
  }

  focusSnapshotRegistry.set(popoverId, {
    key,
    fallbackIndex,
    selectionStart: selection.start,
    selectionEnd: selection.end,
    priority,
  })

  return true
}

function restoreFocusSnapshot(popoverId: string, content: HTMLElement): void {
  if (!popoverId || content.hidden) {
    return
  }
  const snapshot = focusSnapshotRegistry.get(popoverId)
  if (!snapshot) {
    return
  }

  const ownerDocument = content.ownerDocument
  const active = ownerDocument.activeElement
  if (active instanceof HTMLElement && content.contains(active) && active !== content) {
    return
  }

  const target = resolveFocusTarget(content, snapshot)
  if (!target) {
    return
  }

  target.focus({ preventScroll: true })
  applySelection(target, snapshot.selectionStart, snapshot.selectionEnd)
}

function resolveFocusTarget(content: HTMLElement, snapshot: FocusSnapshot): HTMLElement | null {
  const byKey = resolveByKey(content, snapshot.key)
  if (byKey) {
    return byKey
  }
  if (snapshot.fallbackIndex < 0) {
    return null
  }
  const focusables = collectFocusableNodes(content)
  return focusables[snapshot.fallbackIndex] ?? null
}

function resolveByKey(content: HTMLElement, key: FocusSnapshotKey | null): HTMLElement | null {
  if (!key) {
    return null
  }
  switch (key.type) {
    case "data":
      return content.querySelector<HTMLElement>(`[data-affino-focus-key="${escapeSelectorValue(key.value)}"]`)
    case "id":
      return content.querySelector<HTMLElement>(`#${escapeSelectorValue(key.value)}`)
    case "name":
      return content.querySelector<HTMLElement>(`[name="${escapeSelectorValue(key.value)}"]`)
    case "wire":
      return (
        content.querySelector<HTMLElement>(`[wire\\:model\\.live="${escapeSelectorValue(key.value)}"]`) ??
        content.querySelector<HTMLElement>(`[wire\\:model="${escapeSelectorValue(key.value)}"]`) ??
        content.querySelector<HTMLElement>(`[wire\\:model\\.blur="${escapeSelectorValue(key.value)}"]`) ??
        content.querySelector<HTMLElement>(`[wire\\:model\\.defer="${escapeSelectorValue(key.value)}"]`)
      )
    default:
      return null
  }
}

function resolveFocusKey(target: HTMLElement): FocusSnapshotKey | null {
  const dataKey = target.dataset.affinoFocusKey
  if (dataKey) {
    return { type: "data", value: dataKey }
  }
  const wireModel = target.getAttribute("wire:model.live")
    ?? target.getAttribute("wire:model")
    ?? target.getAttribute("wire:model.blur")
    ?? target.getAttribute("wire:model.defer")
  if (wireModel) {
    return { type: "wire", value: wireModel }
  }
  const name = target.getAttribute("name")
  if (name && isFormFieldElement(target)) {
    return { type: "name", value: name }
  }
  if (target.id && isFormFieldElement(target)) {
    return { type: "id", value: target.id }
  }
  return null
}

function resolveFocusPriority(target: HTMLElement, key: FocusSnapshotKey | null): number {
  if (isTextEntryElement(target)) {
    return 3
  }
  if (isFormFieldElement(target)) {
    return 2
  }
  return key ? 1 : 0
}

function collectFocusableNodes(content: HTMLElement): HTMLElement[] {
  return Array.from(content.querySelectorAll<HTMLElement>(FOCUSABLE_WITHIN_SELECTOR))
}

function readSelection(target: HTMLElement): { start: number | null; end: number | null } {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return {
      start: target.selectionStart,
      end: target.selectionEnd,
    }
  }
  return { start: null, end: null }
}

function applySelection(target: HTMLElement, start: number | null, end: number | null): void {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
    return
  }
  if (start === null || end === null) {
    return
  }
  try {
    target.setSelectionRange(start, end)
  } catch {
    // ignore for unsupported input types
  }
}

function escapeSelectorValue(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value)
  }
  return value.replace(/["\\]/g, "\\$&")
}

function isFormFieldElement(target: HTMLElement): boolean {
  return (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || target instanceof HTMLButtonElement
  )
}

function isTextEntryElement(target: HTMLElement): boolean {
  if (target instanceof HTMLTextAreaElement) {
    return true
  }
  if (target instanceof HTMLInputElement) {
    return !NON_TEXT_INPUT_TYPES.has(target.type)
  }
  return target.isContentEditable
}

function bindDismissListeners(root: RootEl, popover: PopoverCore, detachments: Detachment[]): void {
  const onClick = (event: Event) => {
    const target = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("[data-affino-popover-dismiss]") : null
    if (!target) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const reason = normalizeDismissReason(target.dataset.affinoPopoverDismiss)
    popover.close(reason)
  }
  root.addEventListener("click", onClick)
  detachments.push(() => root.removeEventListener("click", onClick))
}

function normalizeDismissReason(value: string | undefined): SurfaceReason {
  if (value === "pointer" || value === "keyboard" || value === "programmatic") {
    return value
  }
  return "programmatic"
}
