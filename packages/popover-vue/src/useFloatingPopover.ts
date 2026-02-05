import { nextTick, onScopeDispose, ref, watch } from "vue"
import type { Ref } from "vue"
import type { PositionOptions, PopoverArrowOptions, PopoverArrowProps } from "@affino/popover-core"
import type { PopoverController } from "./usePopoverController"
import {
  createFloatingHiddenStyle,
  createFloatingRelayoutController,
  formatFloatingZIndex,
  resolveFloatingTeleportTarget,
} from "@affino/overlay-host"
import { acquireDocumentScrollLock, releaseDocumentScrollLock } from "@affino/overlay-kernel"

type Strategy = "fixed" | "absolute"
const DEFAULT_Z_INDEX = 120
const POPOVER_HOST_ID = "affino-popover-host"
const POPOVER_HOST_ATTRIBUTE = "data-affino-popover-host"
const SCROLL_LOCK_SOURCE = "popover-vue"

export interface FloatingPopoverOptions extends PositionOptions {
  strategy?: Strategy
  teleportTo?: string | HTMLElement | false
  zIndex?: number | string
  arrow?: PopoverArrowOptions
  closeOnInteractOutside?: boolean
  returnFocus?: boolean
  lockScroll?: boolean
}

export interface FloatingPopoverBindings {
  triggerRef: Ref<HTMLElement | null>
  contentRef: Ref<HTMLElement | null>
  contentStyle: Ref<Record<string, string>>
  teleportTarget: Ref<string | HTMLElement | null>
  arrowProps: Ref<PopoverArrowProps | null>
  updatePosition: () => Promise<void>
}

export function useFloatingPopover(
  controller: PopoverController,
  options: FloatingPopoverOptions = {},
): FloatingPopoverBindings {
  const strategy: Strategy = options.strategy ?? "fixed"
  const zIndex = formatFloatingZIndex(options.zIndex ?? DEFAULT_Z_INDEX)
  const closeOnOutside = options.closeOnInteractOutside ?? controller.core.shouldCloseOnInteractOutside()
  const returnFocus = options.returnFocus ?? true
  const lockScroll = options.lockScroll ?? controller.core.isModal()

  const triggerRef = ref<HTMLElement | null>(null)
  const contentRef = ref<HTMLElement | null>(null)
  const contentStyle = ref<Record<string, string>>(createFloatingHiddenStyle(strategy, zIndex))
  const teleportTarget = ref<string | HTMLElement | null>(
    resolveFloatingTeleportTarget(options.teleportTo, {
      id: POPOVER_HOST_ID,
      attribute: POPOVER_HOST_ATTRIBUTE,
    }),
  )
  const arrowProps = ref<PopoverArrowProps | null>(null)
  let lockedDocument: Document | null = null
  let outsideCleanup: (() => void) | null = null

  const updatePosition = async () => {
    if (typeof window === "undefined") return
    if (!controller.state.value.open || !triggerRef.value || !contentRef.value) return

    await nextTick()
    const anchorRect = triggerRef.value.getBoundingClientRect()
    const surfaceRect = contentRef.value.getBoundingClientRect()
    const position = controller.core.computePosition(anchorRect, surfaceRect, {
      placement: options.placement,
      align: options.align,
      gutter: options.gutter,
      viewportPadding: options.viewportPadding,
      viewportWidth: options.viewportWidth ?? window.innerWidth,
      viewportHeight: options.viewportHeight ?? window.innerHeight,
    })

    contentStyle.value = {
      position: strategy,
      left: `${Math.round(position.left)}px`,
      top: `${Math.round(position.top)}px`,
      transform: "translate3d(0, 0, 0)",
      ...(zIndex ? { zIndex } : {}),
    }

    if (options.arrow) {
      arrowProps.value = controller.core.getArrowProps({
        anchorRect,
        popoverRect: surfaceRect,
        position,
        options: options.arrow,
      })
    } else {
      arrowProps.value = null
    }
  }

  const resetPosition = () => {
    contentStyle.value = createFloatingHiddenStyle(strategy, zIndex)
    arrowProps.value = null
  }

  const resolveActiveDocument = (): Document | null => {
    return triggerRef.value?.ownerDocument ?? contentRef.value?.ownerDocument ?? (typeof document !== "undefined" ? document : null)
  }

  const handlePointerDown = (event: Event) => {
    if (!controller.state.value.open) return
    const target = event.target as Node | null
    if (isWithinSurface(target, triggerRef.value, contentRef.value, controller.id)) {
      return
    }
    if (!closeOnOutside) {
      return
    }
    controller.interactOutside({ event, target })
  }

  const handleFocusIn = (event: FocusEvent) => {
    if (!controller.state.value.open) return
    const target = event.target as Node | null
    if (isWithinSurface(target, triggerRef.value, contentRef.value, controller.id)) {
      return
    }
    if (!closeOnOutside) {
      return
    }
    controller.interactOutside({ event, target })
  }

  const attachOutsideHandlers = () => {
    if (outsideCleanup || typeof document === "undefined") return
    const doc = document
    const pointerListener = (event: Event) => handlePointerDown(event)
    const focusListener = (event: FocusEvent) => handleFocusIn(event)
    doc.addEventListener("pointerdown", pointerListener, true)
    doc.addEventListener("focusin", focusListener, true)
    outsideCleanup = () => {
      doc.removeEventListener("pointerdown", pointerListener, true)
      doc.removeEventListener("focusin", focusListener, true)
      outsideCleanup = null
    }
  }

  const detachOutsideHandlers = () => {
    outsideCleanup?.()
  }

  watch(
    () => controller.state.value.open,
    (open, previous) => {
      if (open) {
        attachOutsideHandlers()
        relayoutController.activate()
        if (lockScroll && !lockedDocument) {
          const activeDocument = resolveActiveDocument()
          if (activeDocument) {
            acquireDocumentScrollLock(activeDocument, SCROLL_LOCK_SOURCE)
            lockedDocument = activeDocument
          }
        }
        void updatePosition()
      } else {
        detachOutsideHandlers()
        relayoutController.deactivate()
        if (previous && lockScroll && lockedDocument) {
          releaseDocumentScrollLock(lockedDocument, SCROLL_LOCK_SOURCE)
          lockedDocument = null
        }
        resetPosition()
        if (previous && returnFocus) {
          nextTick(() => {
            triggerRef.value?.focus?.({ preventScroll: true })
          })
        }
      }
    },
  )

  watch([triggerRef, contentRef], () => {
    if (controller.state.value.open) {
      void updatePosition()
    }
  })

  const relayoutController = createFloatingRelayoutController({
    metrics: { source: "popover-vue" },
    onRelayout: () => {
      if (!controller.state.value.open || typeof window === "undefined") {
        return
      }
      window.requestAnimationFrame(() => {
        void updatePosition()
      })
    },
  })

  onScopeDispose(() => {
    detachOutsideHandlers()
    relayoutController.destroy()
    if (lockScroll && lockedDocument) {
      releaseDocumentScrollLock(lockedDocument, SCROLL_LOCK_SOURCE)
      lockedDocument = null
    }
  })

  return {
    triggerRef,
    contentRef,
    contentStyle,
    teleportTarget,
    arrowProps,
    updatePosition,
  }
}

function isWithinSurface(
  target: Node | null,
  trigger: HTMLElement | null,
  content: HTMLElement | null,
  popoverId?: string,
): boolean {
  if (!target) {
    return false
  }
  if (trigger?.contains(target)) {
    return true
  }
  if (content?.contains(target)) {
    return true
  }
  return isStickyZoneTarget(target, popoverId)
}

function isStickyZoneTarget(target: Node | null, popoverId?: string): boolean {
  if (!target) {
    return false
  }
  const element = target instanceof Element ? target : target.parentElement
  if (!element) {
    return false
  }
  const sticky = element.closest<HTMLElement>("[data-affino-popover-sticky]")
  if (!sticky) {
    return false
  }
  const attr = sticky.getAttribute("data-affino-popover-sticky")
  if (attr == null) {
    return true
  }
  const ids = attr
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
  if (ids.length === 0) {
    return true
  }
  if (!popoverId) {
    return false
  }
  return ids.includes(popoverId)
}
