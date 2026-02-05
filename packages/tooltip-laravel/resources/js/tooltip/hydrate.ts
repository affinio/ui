import { TooltipCore } from "@affino/tooltip-core"
import type { TooltipTriggerProps, TooltipState, TooltipReason } from "@affino/tooltip-core"
import { ensureDocumentObserver } from "@affino/overlay-kernel"

import type {
  Cleanup,
  CSSPosition,
  RootEl,
  TooltipHandle,
  TriggerEventHandlers,
  TriggerListenerEvent,
  TriggerMode,
} from "./types"

const DEFAULT_TRIGGER_MODE: TriggerMode = "hover-focus"

const ALLOWED_TRIGGER_MODES = new Set<TriggerMode>(["hover", "focus", "hover-focus", "click", "manual"])

const activeByDocument = new WeakMap<Document, RootEl | null>()
let pointerGuardsBound = false
let pointerGuardTicking = false
const focusedTooltipIds = new Set<string>()
;(window as any).__affinoTooltipFocused = focusedTooltipIds
const focusRestorers = new Map<string, () => void>()
;(window as any).__affinoFocusRestorers = focusRestorers
let pendingFocusSync = false
let pointerIntentBound = false
let lastExternalPointerDown = 0
const POINTER_INTENT_WINDOW_MS = 300
const FOCUSABLE_WITHIN_SELECTOR = [
  '[data-affino-tooltip-focus-target]',
  "input:not([disabled])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  "button:not([disabled])",
  "a[href]",
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
  '[contenteditable=""]',
].join(",")

const registry = new WeakMap<RootEl, Cleanup>()

export function hydrateTooltip(root: RootEl): void {
  const resolveTriggerElement = () => root.querySelector<HTMLElement>("[data-affino-tooltip-trigger]")
  const resolveSurfaceElement = () => root.querySelector<HTMLElement>("[data-affino-tooltip-surface]")
  const trigger = resolveTriggerElement()
  const surface = resolveSurfaceElement()

  if (!trigger || !surface) {
    return
  }

  const teardown = registry.get(root)
  if (teardown) {
    teardown({ releaseFocus: false })
  }

  const rootId = root.dataset.affinoTooltipRoot ?? null
  const triggerMode = resolveTriggerMode(root.dataset.affinoTooltipTriggerMode)
  const shouldSyncFocus = isFocusMode(triggerMode)

  const tooltip = new TooltipCore({
    id: root.dataset.affinoTooltipRoot,
    openDelay: readNumber(root.dataset.affinoTooltipOpenDelay, 80),
    closeDelay: readNumber(root.dataset.affinoTooltipCloseDelay, 150),
  })

  const detachments: Cleanup[] = []
  let pendingMeasureFrame: number | null = null

  const triggerProps = tooltip.getTriggerProps({
    tabIndex: trigger.hasAttribute("tabindex") ? trigger.tabIndex : undefined,
  }) as TooltipTriggerProps
  const triggerAttributes = stripTriggerEventHandlers(triggerProps)
  detachments.push(bindProps(trigger, triggerAttributes))
  const triggerEvents: TriggerEventHandlers = {
    onPointerEnter: triggerProps.onPointerEnter,
    onPointerLeave: triggerProps.onPointerLeave,
    onFocus: (event) => {
      if (shouldSyncFocus && rootId) {
        focusedTooltipIds.add(rootId)
      }
      triggerProps.onFocus?.(event)
    },
    onBlur: (event) => {
      if (rootId) {
        const hasExplicitTarget = event.relatedTarget instanceof HTMLElement
        const pointerInitiated = performance.now() - lastExternalPointerDown < POINTER_INTENT_WINDOW_MS
        requestAnimationFrame(() => {
          const shouldRelease = hasExplicitTarget || pointerInitiated
          if (shouldRelease && trigger.isConnected) {
            focusedTooltipIds.delete(rootId)
          }
        })
      }
      triggerProps.onBlur?.(event)
    },
  }
  detachments.push(bindTriggerModeListeners(trigger, triggerMode, triggerEvents, tooltip))
  detachments.push(attachTooltipHandle(root, tooltip))
  const tooltipProps = tooltip.getTooltipProps() as unknown as Record<string, unknown>
  bindTooltipProps(surface, tooltipProps)

  const updatePosition = () => {
    const anchorRect = trigger.getBoundingClientRect()
    const tooltipRect = surface.getBoundingClientRect()
    if (tooltipRect.width === 0 || tooltipRect.height === 0) {
      if (pendingMeasureFrame === null) {
        pendingMeasureFrame = requestAnimationFrame(() => {
          pendingMeasureFrame = null
          if (!surface.hidden) {
            updatePosition()
          }
        })
      }
      return
    }
    const position = tooltip.computePosition(anchorRect, tooltipRect, {
      placement: (root.dataset.affinoTooltipPlacement as any) ?? "top",
      align: (root.dataset.affinoTooltipAlign as any) ?? "center",
      gutter: readNumber(root.dataset.affinoTooltipGutter, 8),
    })

    surface.style.position = (root.dataset.affinoTooltipStrategy as CSSPosition) ?? "fixed"
    surface.style.left = `${position.left}px`
    surface.style.top = `${position.top}px`
    surface.style.transform = ""
    surface.dataset.placement = position.placement
    surface.dataset.align = position.align
  }

  const unsubscribe = tooltip.subscribe((snapshot: TooltipState) => {
    const state = snapshot.open ? "open" : "closed"
    root.dataset.affinoTooltipState = state
    surface.dataset.state = state
    surface.hidden = !snapshot.open

    if (snapshot.open) {
      ensureSingleActiveTooltip(root)
      requestAnimationFrame(updatePosition)
    } else {
      const ownerDocument = root.ownerDocument ?? document
      if (getActiveTooltipRoot(ownerDocument) === root) {
        setActiveTooltipRoot(ownerDocument, null)
      }
    }
  })

  detachments.push(() => unsubscribe.unsubscribe())

  const resizeObserver = new ResizeObserver(() => {
    if (!surface.hidden) {
      updatePosition()
    }
  })

  resizeObserver.observe(trigger)
  detachments.push(() => {
    resizeObserver.disconnect()
    if (pendingMeasureFrame !== null) {
      cancelAnimationFrame(pendingMeasureFrame)
      pendingMeasureFrame = null
    }
  })

  let pendingStructureRehydrate = false
  const scheduleStructureRehydrate = () => {
    if (pendingStructureRehydrate) {
      return
    }
    pendingStructureRehydrate = true
    Promise.resolve().then(() => {
      pendingStructureRehydrate = false
      hydrateTooltip(root)
    })
  }

  const structureObserver = new MutationObserver(() => {
    const nextTrigger = resolveTriggerElement()
    const nextSurface = resolveSurfaceElement()
    if (nextTrigger !== trigger || nextSurface !== surface) {
      scheduleStructureRehydrate()
    }
  })

  structureObserver.observe(root, { childList: true, subtree: true })
  detachments.push(() => structureObserver.disconnect())

  const restoreTrackedFocus = () => {
    if (!shouldSyncFocus || !rootId) {
      return
    }

    if (!root.isConnected) {
      focusRestorers.delete(rootId)
      focusedTooltipIds.delete(rootId)
      return
    }

    const currentTrigger = resolveTriggerElement()
    if (!currentTrigger || document.activeElement === currentTrigger) {
      return
    }

    const focusTarget = resolveFocusableTarget(currentTrigger)
    if (!focusTarget) {
      return
    }

    focusTarget.focus({ preventScroll: true })
    triggerProps.onFocus?.(new FocusEvent("focus"))
  }

  const hasTrackedFocus = shouldSyncFocus && rootId != null && focusedTooltipIds.has(rootId)
  const alreadyFocused = shouldSyncFocus && document.activeElement === trigger
  if (shouldSyncFocus && (hasTrackedFocus || alreadyFocused)) {
    requestAnimationFrame(() => {
      if (hasTrackedFocus && document.activeElement !== trigger) {
        restoreTrackedFocus()
        return
      }
      triggerProps.onFocus?.(new FocusEvent("focus"))
    })
  }

  if (rootId && shouldSyncFocus) {
    focusRestorers.set(rootId, restoreTrackedFocus)
  }

  if (isPinnedTooltip(root)) {
    requestAnimationFrame(() => {
      if (root.isConnected && isPinnedTooltip(root)) {
        tooltip.open("programmatic")
      }
    })
  }

  registry.set(root, (options = {}) => {
    const releaseFocus = options.releaseFocus !== false
    const ownerDocument = root.ownerDocument ?? document
    if (getActiveTooltipRoot(ownerDocument) === root) {
      closeTooltipRoot(root, "programmatic")
    }
    detachments.forEach((cleanup) => cleanup())
    if (rootId) {
      if (releaseFocus) {
        focusedTooltipIds.delete(rootId)
      }
      focusRestorers.delete(rootId)
    }
    registry.delete(root)
  })
}

function isDisableableElement(element: HTMLElement): element is HTMLElement & { disabled: boolean } {
  return "disabled" in element
}

function isFocusableElement(element: HTMLElement | null): boolean {
  if (!element) {
    return false
  }

  if (isDisableableElement(element) && element.disabled) {
    return false
  }

  if (element.tabIndex >= 0) {
    return true
  }

  return element.isContentEditable
}

function resolveFocusableTarget(trigger: HTMLElement | null): HTMLElement | null {
  if (!trigger) {
    return null
  }

  const descendant = trigger.querySelector<HTMLElement>(FOCUSABLE_WITHIN_SELECTOR)
  if (descendant && isFocusableElement(descendant)) {
    return descendant
  }

  return isFocusableElement(trigger) ? trigger : null
}

function isPinnedTooltip(root: RootEl): boolean {
  return root.dataset.affinoTooltipPinned === "true"
}

function isManualTooltip(root: RootEl): boolean {
  return resolveTriggerMode(root.dataset.affinoTooltipTriggerMode) === "manual"
}

function isPersistentTooltip(root: RootEl): boolean {
  return isPinnedTooltip(root) || isManualTooltip(root)
}

function bindProps(element: HTMLElement, props: Record<string, unknown>): Cleanup {
  const disposers: Cleanup[] = []

  for (const [key, value] of Object.entries(props)) {
    if (key === "tabIndex") {
      if (value == null) {
        element.removeAttribute("tabindex")
      } else {
        element.setAttribute("tabindex", String(value))
      }
      continue
    }

    if (key.startsWith("on") && typeof value === "function") {
      const eventName = key.slice(2).toLowerCase()
      const handler = value as EventListener
      element.addEventListener(eventName, handler as EventListener)
      disposers.push(() => element.removeEventListener(eventName, handler as EventListener))
      continue
    }

    if (value == null) {
      continue
    }

    if (typeof value === "boolean") {
      if (value) {
        element.setAttribute(toKebabCase(key), "")
      } else {
        element.removeAttribute(toKebabCase(key))
      }
      continue
    }

    element.setAttribute(toKebabCase(key), String(value))
  }

  return () => disposers.forEach((dispose) => dispose())
}

function bindTooltipProps(element: HTMLElement, props: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(props)) {
    if (value == null) {
      continue
    }

    if (typeof value === "boolean") {
      if (value) {
        element.setAttribute(toKebabCase(key), "")
      } else {
        element.removeAttribute(toKebabCase(key))
      }
      continue
    }

    element.setAttribute(toKebabCase(key), String(value))
  }
}

function stripTriggerEventHandlers(props: TooltipTriggerProps): Record<string, unknown> {
  const attributes: Record<string, unknown> = { ...props }
  delete attributes.onPointerEnter
  delete attributes.onPointerLeave
  delete attributes.onFocus
  delete attributes.onBlur
  return attributes
}

function resolveTriggerMode(value?: string): TriggerMode {
  if (!value) {
    return DEFAULT_TRIGGER_MODE
  }

  const normalized = value.toLowerCase() as TriggerMode
  return ALLOWED_TRIGGER_MODES.has(normalized) ? normalized : DEFAULT_TRIGGER_MODE
}

function bindTriggerModeListeners(
  trigger: HTMLElement,
  mode: TriggerMode,
  events: TriggerEventHandlers,
  tooltip: TooltipCore,
): Cleanup {
  const disposers: Cleanup[] = []

  const add = (eventName: TriggerListenerEvent, listener: EventListener) => {
    trigger.addEventListener(eventName, listener)
    disposers.push(() => trigger.removeEventListener(eventName, listener))
  }

  if (mode === "hover" || mode === "hover-focus") {
    if (events.onPointerEnter) {
      const hoverEnter: EventListener = (event) => events.onPointerEnter?.(event as unknown as PointerEvent)
      add("pointerenter", hoverEnter)
    }

    if (events.onPointerLeave) {
      const hoverLeave: EventListener = (event) => events.onPointerLeave?.(event as unknown as PointerEvent)
      add("pointerleave", hoverLeave)
    }
  }

  if (mode === "focus" || mode === "hover-focus") {
    if (events.onFocus) {
      const focusHandler: EventListener = (event) => events.onFocus?.(event as FocusEvent)
      add("focusin", focusHandler)
    }

    if (events.onBlur) {
      const blurHandler: EventListener = (event) => events.onBlur?.(event as FocusEvent)
      add("focusout", blurHandler)
    }
  }

  if (mode === "click") {
    const handleClick = () => {
      if (tooltip.getSnapshot().open) {
        tooltip.close("pointer")
      } else {
        tooltip.open("pointer")
      }
    }
    add("click", handleClick)
  }

  return () => {
    disposers.forEach((dispose) => dispose())
  }
}

function attachTooltipHandle(root: RootEl, tooltip: TooltipCore): Cleanup {
  const handle: TooltipHandle = {
    open: (reason = "programmatic") => tooltip.open(reason),
    close: (reason = "programmatic") => tooltip.close(reason),
    toggle: () => tooltip.toggle(),
    getSnapshot: () => tooltip.getSnapshot(),
  }

  root.affinoTooltip = handle

  return () => {
    if (root.affinoTooltip === handle) {
      delete root.affinoTooltip
    }
  }
}

function ensureSingleActiveTooltip(nextRoot: RootEl) {
  const ownerDocument = nextRoot.ownerDocument ?? document
  const activeTooltipRoot = getActiveTooltipRoot(ownerDocument)
  if (activeTooltipRoot && activeTooltipRoot !== nextRoot && !isPersistentTooltip(activeTooltipRoot)) {
    closeTooltipRoot(activeTooltipRoot, "programmatic")
  }
  if (!isPersistentTooltip(nextRoot)) {
    setActiveTooltipRoot(ownerDocument, nextRoot)
  }
}

function closeTooltipRoot(root: RootEl, reason: TooltipReason = "programmatic") {
  const handle = root.affinoTooltip
  if (handle) {
    handle.close(reason)
  }
  const ownerDocument = root.ownerDocument ?? document
  if (getActiveTooltipRoot(ownerDocument) === root) {
    setActiveTooltipRoot(ownerDocument, null)
  }
}

function getActiveTooltipRoot(ownerDocument: Document): RootEl | null {
  return activeByDocument.get(ownerDocument) ?? null
}

function setActiveTooltipRoot(ownerDocument: Document, root: RootEl | null): void {
  activeByDocument.set(ownerDocument, root)
}

export function scan(root: ParentNode): void {
  const nodes = root.querySelectorAll<RootEl>("[data-affino-tooltip-root]")
  nodes.forEach((node) => hydrateTooltip(node))
}

export function setupMutationObserver(): void {
  if (typeof document === "undefined") {
    return
  }
  ensureDocumentObserver({
    globalKey: "__affinoTooltipObserver",
    target: document.documentElement,
    callback: (mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement || node instanceof DocumentFragment) {
            scan(node)
          }
        })
      })

      if (focusedTooltipIds.size > 0) {
        scheduleFocusSync()
      }
    },
  })
}

export function setupPointerGuards(): void {
  if (pointerGuardsBound) {
    return
  }

  const evaluatePointerMove = (target: EventTarget | null) => {
    const ownerDocument = target instanceof Node ? target.ownerDocument ?? document : document
    const activeTooltipRoot = getActiveTooltipRoot(ownerDocument)
    if (!activeTooltipRoot) {
      return
    }
    if (target instanceof Element) {
      const owningRoot = target.closest<RootEl>("[data-affino-tooltip-root]")
      if (owningRoot && owningRoot === activeTooltipRoot) {
        return
      }
    }
    maybeCloseActiveTooltip(ownerDocument, "pointer")
  }

  const handlePointerMove = (event: PointerEvent) => {
    if (pointerGuardTicking) {
      return
    }
    pointerGuardTicking = true
    const target = event.target
    requestAnimationFrame(() => {
      pointerGuardTicking = false
      evaluatePointerMove(target)
    })
  }

  const handleDocumentLeave = () => {
    maybeCloseActiveTooltip(document, "pointer")
  }

  document.addEventListener("pointermove", handlePointerMove, { passive: true })
  document.addEventListener("mouseleave", handleDocumentLeave)
  window.addEventListener("blur", handleDocumentLeave)

  pointerGuardsBound = true
}

function maybeCloseActiveTooltip(ownerDocument: Document, reason: TooltipReason) {
  const activeTooltipRoot = getActiveTooltipRoot(ownerDocument)
  if (!activeTooltipRoot) {
    return
  }

  if (shouldSkipPointerGuard(activeTooltipRoot)) {
    return
  }

  const activeElement = ownerDocument.activeElement
  if (activeElement instanceof Element && activeTooltipRoot.contains(activeElement)) {
    return
  }

  closeTooltipRoot(activeTooltipRoot, reason)
}

function shouldSkipPointerGuard(root: RootEl): boolean {
  const mode = resolveTriggerMode(root.dataset.affinoTooltipTriggerMode)
  return mode === "manual" || mode === "click" || mode === "focus" || isPinnedTooltip(root)
}

export function setupPointerIntentTracker(): void {
  if (pointerIntentBound) {
    return
  }

  const recordPointerDown = (event: PointerEvent) => {
    const target = event.target
    if (target instanceof Element) {
      const owningRoot = target.closest<RootEl>("[data-affino-tooltip-root]")
      if (owningRoot) {
        const id = owningRoot.dataset.affinoTooltipRoot
        if (id && focusedTooltipIds.has(id)) {
          return
        }
      }
    }

    lastExternalPointerDown = performance.now()
  }

  document.addEventListener("pointerdown", recordPointerDown, true)
  pointerIntentBound = true
}

function isFocusMode(mode: TriggerMode): boolean {
  return mode === "focus" || mode === "hover-focus"
}

function scheduleFocusSync(): void {
  if (pendingFocusSync) {
    return
  }

  pendingFocusSync = true
  requestAnimationFrame(() => {
    pendingFocusSync = false
    syncTrackedFocus()
  })
}

function syncTrackedFocus(): void {
  const staleIds: string[] = []
  focusedTooltipIds.forEach((id) => {
    const restore = focusRestorers.get(id)
    if (!restore) {
      staleIds.push(id)
      return
    }
    restore()
  })
  staleIds.forEach((id) => focusedTooltipIds.delete(id))
}

export function clearTrackedFocus(): void {
  focusedTooltipIds.clear()
  focusRestorers.clear()
}

function readNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toKebabCase(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase()
}
