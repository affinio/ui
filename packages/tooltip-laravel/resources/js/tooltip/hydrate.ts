import { TooltipCore } from "@affino/tooltip-core"
import type { TooltipTriggerProps, TooltipState, TooltipReason } from "@affino/tooltip-core"
import { didStructureChange, ensureDocumentObserver, getDocumentOverlayManager } from "@affino/overlay-kernel"
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
  isTooltipTopmost,
  registerTooltipCore,
  registry,
  setActiveTooltipRoot,
  structureRegistry,
} from "./registry"
import { isFocusMode, isPersistentTooltip, isPinnedTooltip, readNumber, resolveAlignment, resolveCSSPosition, resolvePlacement, resolveTriggerMode } from "./options"
import type {
  Cleanup,
  RootEl,
  TooltipHandle,
  TriggerEventHandlers,
  TriggerListenerEvent,
  TriggerMode,
  CSSPosition,
} from "./types"

const POINTER_INTENT_WINDOW_MS = 300
const MAX_ZERO_SIZE_MEASURE_RETRIES = 2
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
    registry.get(root)?.()
    structureRegistry.delete(root)
    root.dataset.affinoTooltipState = "closed"
    return
  }
  const focusTarget = resolveFocusableTarget(trigger) ?? trigger

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
    overlayManager: getDocumentOverlayManager(root.ownerDocument),
  })
  registerTooltipCore(root, tooltip)

  const detachments: Cleanup[] = []
  let disposed = false
  let pendingMeasureFrame: number | null = null
  let pendingPositionSync: number | null = null
  let pendingRelayoutFrame: number | null = null
  let relayoutListenersActive = false
  let zeroSizeMeasureRetries = 0

  const cancelPendingMeasure = () => {
    if (pendingMeasureFrame !== null) {
      cancelAnimationFrame(pendingMeasureFrame)
      pendingMeasureFrame = null
    }
    zeroSizeMeasureRetries = 0
  }

  const updatePosition = () => {
    if (disposed || !root.isConnected || !surface.isConnected) return
    const anchorRect = trigger.getBoundingClientRect()
    const strategy = resolveCSSPosition(root.dataset.affinoTooltipStrategy)

    if (surface.style.position !== strategy) {
      surface.style.position = strategy
    }

    const tooltipRect = surface.getBoundingClientRect()
    if (tooltipRect.width === 0 || tooltipRect.height === 0) {
      if (pendingMeasureFrame === null && zeroSizeMeasureRetries < MAX_ZERO_SIZE_MEASURE_RETRIES) {
        zeroSizeMeasureRetries += 1
        pendingMeasureFrame = requestAnimationFrame(() => {
          pendingMeasureFrame = null
          if (!surface.hidden && surface.isConnected && root.isConnected && tooltip.getSnapshot().open) {
            updatePosition()
          }
        })
      }
      return
    }
    zeroSizeMeasureRetries = 0

    const position = tooltip.computePosition(anchorRect, tooltipRect, {
      placement: resolvePlacement(root.dataset.affinoTooltipPlacement),
      align: resolveAlignment(root.dataset.affinoTooltipAlign),
      gutter: readNumber(root.dataset.affinoTooltipGutter, 8),
      viewportWidth: ownerWindow?.innerWidth,
      viewportHeight: ownerWindow?.innerHeight,
    })

    const coordinates = resolveSurfaceCoordinates(surface, position.left, position.top, strategy, ownerWindow)
    surface.style.position = strategy
    surface.style.left = `${coordinates.left}px`
    surface.style.top = `${coordinates.top}px`
    surface.style.transform = ""
    surface.dataset.placement = position.placement
    surface.dataset.align = position.align
  }

  const describedBy = (focusTarget.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter((id) => id && id !== tooltip.getTooltipProps().id)
  const triggerProps = tooltip.getTriggerProps({
    tabIndex: focusTarget.hasAttribute("tabindex") ? focusTarget.tabIndex : undefined,
    describedBy,
  }) as TooltipTriggerProps
  const triggerAttributes = stripTriggerEventHandlers(triggerProps)
  if (focusTarget !== trigger) {
    triggerAttributes.tabIndex = focusTarget.tabIndex
  }
  detachments.push(bindProps(focusTarget, triggerAttributes))
  const primePosition = () => {
    if (!surface.hidden) {
      return
    }

    surface.style.position = resolveCSSPosition(root.dataset.affinoTooltipStrategy)
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
        const ownerDocument = root.ownerDocument ?? document
        requestAnimationFrame(() => {
          const active = ownerDocument.activeElement
          const activeInsideRoot = active instanceof Element && root.contains(active)
          const shouldRelease = !activeInsideRoot || hasExplicitTarget || pointerInitiated
          if (shouldRelease) {
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
  const surfacePointerEnter: EventListener = (event) => {
    const handler = tooltipProps.onPointerEnter
    if (typeof handler === "function") handler(event as PointerEvent)
  }
  const surfacePointerLeave: EventListener = (event) => {
    const handler = tooltipProps.onPointerLeave
    if (typeof handler === "function") handler(event as PointerEvent)
  }
  surface.addEventListener("pointerenter", surfacePointerEnter)
  surface.addEventListener("pointerleave", surfacePointerLeave)
  detachments.push(() => {
    surface.removeEventListener("pointerenter", surfacePointerEnter)
    surface.removeEventListener("pointerleave", surfacePointerLeave)
  })
  syncA11yState(focusTarget, surface, tooltip.getSnapshot().open, describedBy)

  const ownerDocument = root.ownerDocument ?? document
  const ownerWindow = ownerDocument.defaultView
  const scheduleRelayout = () => {
    if (disposed || pendingRelayoutFrame !== null) return
    pendingRelayoutFrame = requestAnimationFrame(() => {
      pendingRelayoutFrame = null
      if (!disposed && !surface.hidden && tooltip.getSnapshot().open && root.isConnected) updatePosition()
    })
  }
  const activateRelayoutListeners = () => {
    if (relayoutListenersActive) return
    ownerDocument.addEventListener("scroll", scheduleRelayout, { capture: true, passive: true })
    ownerWindow?.addEventListener("resize", scheduleRelayout)
    relayoutListenersActive = true
  }
  const deactivateRelayoutListeners = () => {
    if (!relayoutListenersActive) return
    ownerDocument.removeEventListener("scroll", scheduleRelayout, true)
    ownerWindow?.removeEventListener("resize", scheduleRelayout)
    relayoutListenersActive = false
    if (pendingRelayoutFrame !== null) {
      cancelAnimationFrame(pendingRelayoutFrame)
      pendingRelayoutFrame = null
    }
  }

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

  let resizeObserver: ResizeObserver | null = null
  const activateResizeObserver = () => {
    if (resizeObserver || typeof ResizeObserver === "undefined") return
    resizeObserver = new ResizeObserver(() => {
      if (!surface.hidden && tooltip.getSnapshot().open) scheduleRelayout()
    })
    resizeObserver.observe(trigger)
    resizeObserver.observe(surface)
  }
  const deactivateResizeObserver = () => {
    resizeObserver?.disconnect()
    resizeObserver = null
  }

  const unsubscribe = tooltip.subscribe((snapshot: TooltipState) => {
    const state = snapshot.open ? "open" : "closed"
    root.dataset.affinoTooltipState = state
    surface.dataset.state = state
    syncA11yState(focusTarget, surface, snapshot.open, describedBy)
    if (snapshot.open) {
      activateRelayoutListeners()
      activateResizeObserver()
      surface.style.position = resolveCSSPosition(root.dataset.affinoTooltipStrategy)
      surface.style.left = "0px"
      surface.style.top = "0px"
      surface.style.visibility = "hidden"
      surface.hidden = false
      ensureSingleActiveTooltip(root)
      syncPosition()
    } else {
      deactivateRelayoutListeners()
      deactivateResizeObserver()
      surface.hidden = true
      surface.style.visibility = ""
      cancelPendingMeasure()
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

  detachments.push(() => {
    deactivateResizeObserver()
    deactivateRelayoutListeners()
    cancelPendingMeasure()
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
      if (disposed || !root.isConnected) {
        return
      }
      hydrateTooltip(root)
    })
  }

  const domObserver = new MutationObserver((mutations) => {
    let checkStructure = false
    for (const mutation of mutations) {
      if (mutation.type === "attributes" && mutation.target === root && mutation.attributeName === "data-affino-tooltip-state") {
        syncOpenFromDomState()
      } else if (mutation.type === "attributes" && mutation.target === surface && mutation.attributeName === "id") {
        syncA11yState(focusTarget, surface, tooltip.getSnapshot().open, describedBy)
      } else if (mutation.type === "childList") {
        checkStructure = true
      }
    }
    if (checkStructure) {
      const nextTrigger = resolveTriggerElement()
      const nextSurface = resolveSurfaceElement()
      const nextFocusTarget = nextTrigger ? resolveFocusableTarget(nextTrigger) ?? nextTrigger : null
      if (nextTrigger !== trigger || nextFocusTarget !== focusTarget || nextSurface !== surface) {
        scheduleStructureRehydrate()
      }
    }
  })

  domObserver.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-affino-tooltip-state"] })
  domObserver.observe(surface, { attributes: true, attributeFilter: ["id"] })
  detachments.push(() => domObserver.disconnect())
  syncOpenFromDomState()

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
    if (!currentTrigger) {
      focusRestorers.delete(rootId)
      focusedTooltipIds.delete(rootId)
      return
    }

    const ownerDocument = root.ownerDocument ?? document
    const active = ownerDocument.activeElement
    if (active === currentTrigger || (active instanceof Node && currentTrigger.contains(active))) {
      return
    }
    if (
      active instanceof HTMLElement
      && active.isConnected
      && active !== ownerDocument.body
      && active !== ownerDocument.documentElement
      && !root.contains(active)
    ) {
      focusRestorers.delete(rootId)
      focusedTooltipIds.delete(rootId)
      return
    }

    const focusTarget = resolveFocusableTarget(currentTrigger)
    if (!focusTarget) {
      focusRestorers.delete(rootId)
      focusedTooltipIds.delete(rootId)
      return
    }

    focusTarget.focus({ preventScroll: true })
    triggerProps.onFocus?.(new FocusEvent("focus"))
  }

  const hasTrackedFocus = shouldSyncFocus && rootId != null && focusedTooltipIds.has(rootId)
  const focusDocument = root.ownerDocument ?? document
  const activeElement = focusDocument.activeElement
  const alreadyFocused = shouldSyncFocus
    && (activeElement === trigger || (activeElement instanceof Node && trigger.contains(activeElement)))
  if (shouldSyncFocus && (hasTrackedFocus || alreadyFocused)) {
    requestAnimationFrame(() => {
      if (disposed) return
      const active = focusDocument.activeElement
      const focusOnTrigger = active === trigger || (active instanceof Node && trigger.contains(active))
      if (hasTrackedFocus && !focusOnTrigger) {
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
      if (disposed) return
      if (root.isConnected && isPinnedTooltip(root)) {
        tooltip.open("programmatic")
      }
    })
  }

  registry.set(root, (options = {}) => {
    if (disposed) return
    disposed = true
    const releaseFocus = options.releaseFocus !== false
    const ownerDocument = root.ownerDocument ?? document
    if (getActiveTooltipRoot(ownerDocument) === root) {
      closeTooltipRoot(root, "programmatic")
    }
    if (tooltip.getSnapshot().open) tooltip.close("programmatic")
    detachments.forEach((cleanup) => cleanup())
    tooltip.destroy()
    registerTooltipCore(root, null)
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
    if (key.startsWith("on") && typeof value === "function") continue
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

function resolveSurfaceCoordinates(
  surface: HTMLElement,
  left: number,
  top: number,
  strategy: CSSPosition,
  ownerWindow: Window | null,
) {
  const parent = surface.offsetParent as HTMLElement | null
  if (!parent) {
    if (strategy !== "absolute") return { left, top }
    return { left: left + (ownerWindow?.scrollX ?? 0), top: top + (ownerWindow?.scrollY ?? 0) }
  }
  const rect = parent.getBoundingClientRect()
  return {
    left: left - rect.left - parent.clientLeft + parent.scrollLeft,
    top: top - rect.top - parent.clientTop + parent.scrollTop,
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
    registry.get(root)?.()
    structureRegistry.delete(root)
    root.dataset.affinoTooltipState = "closed"
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
          if (isTooltipRelatedScope(node)) {
            scheduleScan(node)
            if (hasTrackedFocus) {
              shouldSyncFocus = true
            }
            return
          }
          if (hasTrackedFocus && node instanceof Element && node.closest(TOOLTIP_ROOT_SELECTOR)) {
            shouldSyncFocus = true
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

function isTooltipRelatedScope(node: Node): node is HTMLElement | DocumentFragment {
  if (node instanceof HTMLElement || node instanceof DocumentFragment) {
    return hasTooltipRoot(node)
  }
  return false
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
    canCloseRoot: (root) => isTooltipTopmost(root),
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

function syncA11yState(trigger: HTMLElement, surface: HTMLElement, open: boolean, describedBy: string[] = []): void {
  const ids = Array.from(new Set([...describedBy, surface.id].filter(Boolean)))
  if (ids.length) {
    trigger.setAttribute("aria-describedby", ids.join(" "))
  } else {
    trigger.removeAttribute("aria-describedby")
  }
  surface.setAttribute("aria-hidden", open ? "false" : "true")
}
