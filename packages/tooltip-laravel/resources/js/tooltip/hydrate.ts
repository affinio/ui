import { TooltipCore } from "@affino/tooltip-core"
import type { TooltipTriggerProps, TooltipState, TooltipReason } from "@affino/tooltip-core"
import { didStructureChange, ensureDocumentObserver } from "@affino/overlay-kernel"
import {
  scheduleFocusSync,
  setupPointerGuards as setupGlobalPointerGuards,
  setupPointerIntentTracker as setupGlobalPointerIntentTracker,
  wasRecentExternalPointerDown,
} from "./guards"
import {
  closeTooltipRoot,
  focusRestorers,
  focusedTooltipIds,
  getActiveTooltipRoot,
  registry,
  setActiveTooltipRoot,
  structureRegistry,
} from "./registry"
import { isFocusMode, isPersistentTooltip, isPinnedTooltip, readNumber, resolveTriggerMode } from "./options"
import type {
  Cleanup,
  CSSPosition,
  RootEl,
  TooltipHandle,
  TriggerEventHandlers,
  TriggerListenerEvent,
  TriggerMode,
} from "./types"

const POINTER_INTENT_WINDOW_MS = 300
const TOOLTIP_ROOT_SELECTOR = "[data-affino-tooltip-root]"
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
const pendingScanScopes = new Set<ParentNode>()
const pendingRemovedRoots = new Set<RootEl>()
let scanFlushScheduled = false
let removedCleanupScheduled = false

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
  const defaultOpen = root.dataset.affinoTooltipState === "open"

  const tooltip = new TooltipCore({
    id: root.dataset.affinoTooltipRoot,
    openDelay: readNumber(root.dataset.affinoTooltipOpenDelay, 80),
    closeDelay: readNumber(root.dataset.affinoTooltipCloseDelay, 150),
    defaultOpen,
  })

  const detachments: Cleanup[] = []
  let pendingMeasureFrame: number | null = null
  let pendingPositionSync: number | null = null

  const updatePosition = () => {
    const anchorRect = trigger.getBoundingClientRect()
    const strategy = (root.dataset.affinoTooltipStrategy as CSSPosition) ?? "fixed"

    if (surface.style.position !== strategy) {
      surface.style.position = strategy
    }

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

    surface.style.position = strategy
    surface.style.left = `${position.left}px`
    surface.style.top = `${position.top}px`
    surface.style.transform = ""
    surface.dataset.placement = position.placement
    surface.dataset.align = position.align
  }

  const triggerProps = tooltip.getTriggerProps({
    tabIndex: trigger.hasAttribute("tabindex") ? trigger.tabIndex : undefined,
  }) as TooltipTriggerProps
  const triggerAttributes = stripTriggerEventHandlers(triggerProps)
  detachments.push(bindProps(trigger, triggerAttributes))
  const primePosition = () => {
    if (!surface.hidden) {
      return
    }

    surface.style.position = (root.dataset.affinoTooltipStrategy as CSSPosition) ?? "fixed"
    surface.style.left = "0px"
    surface.style.top = "0px"
    surface.style.visibility = "hidden"
    surface.hidden = false
    updatePosition()
  }

  const triggerEvents: TriggerEventHandlers = {
    onPointerEnter: (event) => {
      primePosition()
      triggerProps.onPointerEnter?.(event)
    },
    onPointerLeave: (event) => {
      if (isPinnedTooltip(root)) {
        return
      }
      if (!tooltip.getSnapshot().open) {
        surface.hidden = true
        surface.style.visibility = ""
      }
      triggerProps.onPointerLeave?.(event)
    },
    onFocus: (event) => {
      primePosition()
      if (shouldSyncFocus && rootId) {
        focusedTooltipIds.add(rootId)
      }
      triggerProps.onFocus?.(event)
    },
    onBlur: (event) => {
      if (isPinnedTooltip(root)) {
        return
      }
      if (rootId) {
        const hasExplicitTarget = event.relatedTarget instanceof HTMLElement
        const pointerInitiated = wasRecentExternalPointerDown(POINTER_INTENT_WINDOW_MS)
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

  const syncPosition = () => {
    surface.style.visibility = "hidden"
    updatePosition()
    if (pendingPositionSync !== null) {
      cancelAnimationFrame(pendingPositionSync)
    }
    pendingPositionSync = requestAnimationFrame(() => {
      pendingPositionSync = null
      if (!surface.hidden) {
        updatePosition()
        surface.style.visibility = ""
      }
    })
  }

  const syncOpenFromDomState = () => {
    const domOpen = root.dataset.affinoTooltipState === "open"
    const snapshotOpen = tooltip.getSnapshot().open
    if (domOpen && !snapshotOpen) {
      tooltip.open("programmatic")
      return
    }
    if (!domOpen && snapshotOpen) {
      tooltip.close("programmatic")
    }
  }

  const unsubscribe = tooltip.subscribe((snapshot: TooltipState) => {
    const state = snapshot.open ? "open" : "closed"
    root.dataset.affinoTooltipState = state
    surface.dataset.state = state
    if (snapshot.open) {
      surface.style.position = (root.dataset.affinoTooltipStrategy as CSSPosition) ?? "fixed"
      surface.style.left = "0px"
      surface.style.top = "0px"
      surface.style.visibility = "hidden"
      surface.hidden = false
      ensureSingleActiveTooltip(root)
      syncPosition()
    } else {
      surface.hidden = true
      surface.style.visibility = ""
      if (pendingPositionSync !== null) {
        cancelAnimationFrame(pendingPositionSync)
        pendingPositionSync = null
      }
      const ownerDocument = root.ownerDocument ?? document
      if (getActiveTooltipRoot(ownerDocument) === root) {
        setActiveTooltipRoot(ownerDocument, null)
      }
    }
  })

  detachments.push(() => unsubscribe.unsubscribe())

  const stateObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes" && mutation.attributeName === "data-affino-tooltip-state") {
        syncOpenFromDomState()
        return
      }
    }
  })
  stateObserver.observe(root, {
    attributes: true,
    attributeFilter: ["data-affino-tooltip-state"],
  })
  detachments.push(() => stateObserver.disconnect())
  syncOpenFromDomState()

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
    if (pendingPositionSync !== null) {
      cancelAnimationFrame(pendingPositionSync)
      pendingPositionSync = null
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
      if (!root.isConnected) {
        return
      }
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

  structureRegistry.set(root, { trigger, surface })
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

function ensureSingleActiveTooltip(nextRoot: RootEl): void {
  const ownerDocument = nextRoot.ownerDocument ?? document
  const activeTooltipRoot = getActiveTooltipRoot(ownerDocument)
  if (activeTooltipRoot && activeTooltipRoot !== nextRoot && !isPersistentTooltip(activeTooltipRoot)) {
    closeTooltipRoot(activeTooltipRoot, "programmatic")
  }
  if (!isPersistentTooltip(nextRoot)) {
    setActiveTooltipRoot(ownerDocument, nextRoot)
  }
}

export function scan(root: ParentNode): void {
  if (root instanceof HTMLElement && root.matches(TOOLTIP_ROOT_SELECTOR)) {
    maybeHydrateTooltip(root as RootEl)
  }
  const nodes = root.querySelectorAll<RootEl>(TOOLTIP_ROOT_SELECTOR)
  nodes.forEach((node) => maybeHydrateTooltip(node))
}

function maybeHydrateTooltip(root: RootEl): void {
  const trigger = root.querySelector<HTMLElement>("[data-affino-tooltip-trigger]")
  const surface = root.querySelector<HTMLElement>("[data-affino-tooltip-surface]")
  if (!trigger || !surface) {
    return
  }
  const hasBinding = registry.has(root)
  const previous = structureRegistry.get(root)
  if (hasBinding && !didStructureChange(previous, { trigger, surface })) {
    return
  }
  hydrateTooltip(root)
}

export function setupMutationObserver(): void {
  if (typeof document === "undefined") {
    return
  }
  ensureDocumentObserver({
    globalKey: "__affinoTooltipObserver",
    target: document.documentElement,
    callback: (mutations) => {
      const hasTrackedFocus = focusedTooltipIds.size > 0
      let shouldSyncFocus = false
      mutations.forEach((mutation) => {
        if (!shouldSyncFocus && hasTrackedFocus && mutation.target instanceof Element) {
          shouldSyncFocus = mutation.target.closest(TOOLTIP_ROOT_SELECTOR) !== null
        }
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement || node instanceof DocumentFragment) {
            if (hasTooltipRoot(node)) {
              scheduleScan(node)
              if (hasTrackedFocus) {
                shouldSyncFocus = true
              }
              return
            }
            if (hasTrackedFocus && node instanceof Element && node.closest(TOOLTIP_ROOT_SELECTOR)) {
              shouldSyncFocus = true
            }
          }
        })
        mutation.removedNodes.forEach((node) => {
          if (scheduleRemovedCleanup(node) && hasTrackedFocus) {
            shouldSyncFocus = true
          }
        })
      })

      if (hasTrackedFocus && shouldSyncFocus) {
        scheduleFocusSync(syncTrackedFocus)
      }
    },
  })
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

function scheduleRemovedCleanup(node: Node): boolean {
  const roots = collectTooltipRoots(node)
  if (!roots.length) {
    return false
  }
  roots.forEach((root) => pendingRemovedRoots.add(root))
  if (!removedCleanupScheduled) {
    removedCleanupScheduled = true
    enqueueMicrotask(flushRemovedRoots)
  }
  return true
}

function flushRemovedRoots(): void {
  removedCleanupScheduled = false
  const roots = Array.from(pendingRemovedRoots)
  pendingRemovedRoots.clear()
  roots.forEach((root) => {
    if (!root.isConnected) {
      registry.get(root)?.()
    }
  })
}

function enqueueMicrotask(task: () => void): void {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(task)
    return
  }
  Promise.resolve().then(task)
}

function hasTooltipRoot(scope: ParentNode): boolean {
  if (scope instanceof Element && scope.matches(TOOLTIP_ROOT_SELECTOR)) {
    return true
  }
  return scope.querySelector(TOOLTIP_ROOT_SELECTOR) !== null
}

function collectTooltipRoots(node: Node): RootEl[] {
  const roots: RootEl[] = []
  if (node instanceof HTMLElement && node.matches(TOOLTIP_ROOT_SELECTOR)) {
    roots.push(node as RootEl)
  }
  if (node instanceof HTMLElement || node instanceof DocumentFragment) {
    node.querySelectorAll<RootEl>(TOOLTIP_ROOT_SELECTOR).forEach((root) => roots.push(root))
  }
  return roots
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

export function setupPointerGuards(): void {
  setupGlobalPointerGuards({
    getActiveRoot: (ownerDocument) => getActiveTooltipRoot(ownerDocument),
    isGuardSkipped: (root) => {
      const mode = resolveTriggerMode(root.dataset.affinoTooltipTriggerMode)
      return mode === "manual" || mode === "click" || mode === "focus" || isPinnedTooltip(root)
    },
    closeRoot: (root, reason) => closeTooltipRoot(root, reason),
  })
}

export function setupPointerIntentTracker(): void {
  setupGlobalPointerIntentTracker({
    findOwningRoot: (target) => target.closest<RootEl>("[data-affino-tooltip-root]"),
    isFocusedTooltipId: (id) => focusedTooltipIds.has(id),
  })
}

function toKebabCase(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase()
}
