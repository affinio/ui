import { PopoverCore } from "@affino/popover-core"
import type {
  PopoverArrowOptions,
  PopoverArrowProps,
  PopoverContentProps,
  PopoverState,
  PopoverTriggerProps,
  SurfaceReason,
} from "@affino/popover-core"

type PopoverHandle = {
  open: (reason?: SurfaceReason) => void
  close: (reason?: SurfaceReason) => void
  toggle: () => void
  getSnapshot: () => PopoverState
}

type RootEl = HTMLElement & {
  dataset: DOMStringMap & {
    affinoPopoverRoot?: string
    affinoPopoverPlacement?: string
    affinoPopoverAlign?: string
    affinoPopoverGutter?: string
    affinoPopoverViewportPadding?: string
    affinoPopoverStrategy?: string
    affinoPopoverRole?: string
    affinoPopoverModal?: string
    affinoPopoverCloseEscape?: string
    affinoPopoverCloseOutside?: string
    affinoPopoverReturnFocus?: string
    affinoPopoverLockScroll?: string
    affinoPopoverArrowSize?: string
    affinoPopoverArrowInset?: string
    affinoPopoverArrowOffset?: string
    affinoPopoverPinned?: string
    affinoPopoverDefaultOpen?: string
    affinoPopoverManual?: string
  }
  affinoPopover?: PopoverHandle
}

type RootCleanup = () => void
type Detachment = () => void

const registry = new WeakMap<RootEl, RootCleanup>()
const arrowStyleRegistry = new WeakMap<HTMLElement, Set<string>>()
let activePopoverRoot: RootEl | null = null
let scrollLockDepth = 0
let storedOverflow: string | null = null

export function bootstrapAffinoPopovers(): void {
  scan(document)
  setupMutationObserver()
  setupLivewireHooks()
}

export function hydratePopover(root: RootEl): void {
  const resolveTrigger = () => root.querySelector<HTMLElement>("[data-affino-popover-trigger]")
  const resolveContent = () => root.querySelector<HTMLElement>("[data-affino-popover-content]")
  const trigger = resolveTrigger()
  const content = resolveContent()
  if (!trigger || !content) {
    return
  }

  const teardown = registry.get(root)
  teardown?.()

  const options = resolveOptions(root)
  const popover = new PopoverCore({
    id: root.dataset.affinoPopoverRoot,
    closeOnEscape: options.closeOnEscape,
    closeOnInteractOutside: options.closeOnInteractOutside,
    modal: options.modal,
    defaultOpen: options.defaultOpen,
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

  const arrow = content.querySelector<HTMLElement>("[data-affino-popover-arrow]")
  let pendingMeasureFrame: number | null = null
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
    content.style.transform = "translate3d(0, 0, 0)"
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
    content.style.position = options.strategy
    content.style.left = "-9999px"
    content.style.top = "-9999px"
    content.style.transform = "translate3d(0, 0, 0)"
    delete content.dataset.placement
    delete content.dataset.align
    if (arrow) {
      resetArrow(arrow)
    }
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

    if (open) {
      ensureSingleActivePopover(root)
      attachOutsideGuards()
      attachRelayoutHandlers()
      if ((options.lockScroll || options.modal) && !scrollLocked) {
        acquireScrollLock()
        scrollLocked = true
      }
      requestAnimationFrame(updatePosition)
    } else {
      detachOutsideGuards()
      detachRelayoutHandlers()
      if ((options.lockScroll || options.modal) && scrollLocked) {
        releaseScrollLock()
        scrollLocked = false
      }
      resetPosition()
      if (options.returnFocus && document.activeElement !== trigger) {
        requestAnimationFrame(() => {
          if (!trigger.isConnected) {
            return
          }
          trigger.focus({ preventScroll: true })
        })
      }
      if (activePopoverRoot === root) {
        activePopoverRoot = null
      }
    }
  }

  const unsubscribe = popover.subscribe((snapshot) => {
    applyState(snapshot.open)
  })

  detachments.push(() => {
    unsubscribe.unsubscribe()
    resizeObserver?.disconnect()
    detachOutsideGuards()
    detachRelayoutHandlers()
    resetPosition()
  })

  if (options.pinned || options.defaultOpen) {
    requestAnimationFrame(() => {
      if (root.isConnected && (options.pinned || options.defaultOpen)) {
        popover.open("programmatic")
      }
    })
  }

  detachments.push(() => popover.destroy())

  registry.set(root, () => {
    if (activePopoverRoot === root) {
      activePopoverRoot = null
    }
    if (scrollLocked) {
      releaseScrollLock()
      scrollLocked = false
    }
    detachments.forEach((cleanup) => cleanup())
    registry.delete(root)
  })
}

function resolveOptions(root: RootEl) {
  return {
    placement: (root.dataset.affinoPopoverPlacement as any) ?? "bottom",
    align: (root.dataset.affinoPopoverAlign as any) ?? "center",
    gutter: readNumber(root.dataset.affinoPopoverGutter, 12),
    viewportPadding: readNumber(root.dataset.affinoPopoverViewportPadding, 20),
    strategy: resolveStrategy(root.dataset.affinoPopoverStrategy),
    role: (root.dataset.affinoPopoverRole as any) ?? "dialog",
    modal: readBoolean(root.dataset.affinoPopoverModal, false),
    closeOnEscape: readBoolean(root.dataset.affinoPopoverCloseEscape, true),
    closeOnInteractOutside: readBoolean(root.dataset.affinoPopoverCloseOutside, true),
    returnFocus: readBoolean(root.dataset.affinoPopoverReturnFocus, true),
    lockScroll: readBoolean(root.dataset.affinoPopoverLockScroll, false),
    arrow: resolveArrowOptions(root),
    pinned: readBoolean(root.dataset.affinoPopoverPinned, false),
    defaultOpen: readBoolean(root.dataset.affinoPopoverDefaultOpen, false),
  }
}

function resolveArrowOptions(root: RootEl): PopoverArrowOptions | null {
  const size = readNumber(root.dataset.affinoPopoverArrowSize, NaN)
  const inset = readNumber(root.dataset.affinoPopoverArrowInset, NaN)
  const offset = readNumber(root.dataset.affinoPopoverArrowOffset, NaN)
  if (Number.isNaN(size) && Number.isNaN(inset) && Number.isNaN(offset)) {
    return null
  }
  return {
    size: Number.isNaN(size) ? undefined : size,
    inset: Number.isNaN(inset) ? undefined : inset,
    staticOffset: Number.isNaN(offset) ? undefined : offset,
  }
}

function resolveStrategy(strategy?: string): "fixed" | "absolute" {
  if (!strategy) {
    return "fixed"
  }
  return strategy === "absolute" ? "absolute" : "fixed"
}

function bindArrowProps(arrow: HTMLElement, props: PopoverArrowProps) {
  const previousKeys = arrowStyleRegistry.get(arrow)
  previousKeys?.forEach((key) => arrow.style.removeProperty(key))

  const nextKeys = new Set<string>()
  Object.entries(props.style ?? {}).forEach(([key, value]) => {
    arrow.style.setProperty(key, String(value))
    nextKeys.add(key)
  })
  arrowStyleRegistry.set(arrow, nextKeys)

  arrow.setAttribute("data-placement", props["data-placement"])
  arrow.setAttribute("data-align", props["data-align"])
  arrow.setAttribute("data-arrow", props["data-arrow"])
}

function resetArrow(arrow: HTMLElement) {
  arrow.removeAttribute("data-placement")
  arrow.removeAttribute("data-align")
  arrow.removeAttribute("data-arrow")
  const keys = arrowStyleRegistry.get(arrow)
  keys?.forEach((key) => arrow.style.removeProperty(key))
  arrowStyleRegistry.delete(arrow)
}

function bindProps(element: HTMLElement, props: PopoverTriggerProps | PopoverContentProps): Detachment {
  const disposers: Detachment[] = []

  for (const [key, value] of Object.entries(props)) {
    if (key === "tabIndex") {
      if (value == null) {
        element.removeAttribute("tabindex")
      } else {
        element.setAttribute("tabindex", String(value))
        element.tabIndex = Number(value)
      }
      continue
    }

    if (key.startsWith("on") && typeof value === "function") {
      const eventName = key === "onKeydown" ? "keydown" : key.slice(2).toLowerCase()
      const handler = value as EventListener
      element.addEventListener(eventName, handler)
      disposers.push(() => element.removeEventListener(eventName, handler))
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

function attachHandle(root: RootEl, popover: PopoverCore): Detachment {
  const handle: PopoverHandle = {
    open: (reason = "programmatic") => popover.open(reason),
    close: (reason = "programmatic") => popover.close(reason),
    toggle: () => popover.toggle(),
    getSnapshot: () => popover.getSnapshot(),
  }
  root.affinoPopover = handle
  return () => {
    if (root.affinoPopover === handle) {
      delete root.affinoPopover
    }
  }
}

function ensureSingleActivePopover(nextRoot: RootEl) {
  // Core contract: only auto-managed popovers get closed when another opens.
  if (activePopoverRoot && activePopoverRoot !== nextRoot && !isPersistentPopover(activePopoverRoot)) {
    closePopoverRoot(activePopoverRoot, "programmatic")
  }
  if (!isPersistentPopover(nextRoot)) {
    activePopoverRoot = nextRoot
  }
}

function closePopoverRoot(root: RootEl, reason: SurfaceReason) {
  root.affinoPopover?.close(reason)
  if (activePopoverRoot === root) {
    activePopoverRoot = null
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

function scan(node: ParentNode): void {
  if (node instanceof HTMLElement && node.matches("[data-affino-popover-root]")) {
    hydratePopover(node as RootEl)
  }
  const roots = node.querySelectorAll<RootEl>("[data-affino-popover-root]")
  roots.forEach((root) => hydratePopover(root))
}

function setupMutationObserver(): void {
  if ((window as any).__affinoPopoverObserver) {
    return
  }
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement || node instanceof DocumentFragment) {
          scan(node)
        }
      })
    })
  })
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  })
  ;(window as any).__affinoPopoverObserver = observer
}

function setupLivewireHooks(): void {
  const livewire = (window as any).Livewire
  if (!livewire || (window as any).__affinoPopoverLivewireHooked) {
    return
  }
  if (typeof livewire.hook === "function") {
    livewire.hook("morph.added", ({ el }: { el: Element }) => {
      if (el instanceof HTMLElement || el instanceof DocumentFragment) {
        scan(el)
      }
    })
  }
  document.addEventListener("livewire:navigated", () => {
    activePopoverRoot = null
    scan(document)
  })
  ;(window as any).__affinoPopoverLivewireHooked = true
}

function acquireScrollLock() {
  if (scrollLockDepth === 0) {
    storedOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = "hidden"
  }
  scrollLockDepth += 1
}

function releaseScrollLock() {
  if (scrollLockDepth === 0) {
    return
  }
  scrollLockDepth -= 1
  if (scrollLockDepth === 0) {
    document.documentElement.style.overflow = storedOverflow ?? ""
    storedOverflow = null
  }
}

function readNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
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

function toKebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase()
}
