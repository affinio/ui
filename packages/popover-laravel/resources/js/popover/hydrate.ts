import { PopoverCore } from "@affino/popover-core"
import {
  acquireDocumentScrollLock,
  didStructureChange,
  ensureDocumentObserver,
  releaseDocumentScrollLock,
} from "@affino/overlay-kernel"
import type { SurfaceReason } from "@affino/popover-core"
import { attachHandle, bindArrowProps, bindProps, resetArrow } from "./dom"
import { resolveOptions } from "./options"
import { getActivePopoverRoot, registry, setActivePopoverRoot, structureRegistry } from "./registry"
import type { Detachment, RootEl } from "./types"

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
        acquireDocumentScrollLock(root.ownerDocument, "popover")
        scrollLocked = true
      }
      requestAnimationFrame(updatePosition)
    } else {
      detachOutsideGuards()
      detachRelayoutHandlers()
      if ((options.lockScroll || options.modal) && scrollLocked) {
        releaseDocumentScrollLock(root.ownerDocument, "popover")
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
      if (getActivePopoverRoot(root.ownerDocument) === root) {
        setActivePopoverRoot(root.ownerDocument, null)
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
  if (activePopoverRoot && activePopoverRoot !== nextRoot && !isPersistentPopover(activePopoverRoot)) {
    closePopoverRoot(activePopoverRoot, "programmatic")
  }
  if (!isPersistentPopover(nextRoot)) {
    setActivePopoverRoot(ownerDocument, nextRoot)
  }
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
