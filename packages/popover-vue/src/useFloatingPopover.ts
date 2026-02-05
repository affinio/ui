import { nextTick, onBeforeUnmount, ref, watch } from "vue"
import type { Ref } from "vue"
import type { PositionOptions, PopoverArrowOptions, PopoverArrowProps } from "@affino/popover-core"
import type { PopoverController } from "./usePopoverController"
import { ensureOverlayHost, createScrollLockController } from "@affino/overlay-host"

type Strategy = "fixed" | "absolute"
const DEFAULT_Z_INDEX = 120
const POPOVER_HOST_ID = "affino-popover-host"
const POPOVER_HOST_ATTRIBUTE = "data-affino-popover-host"

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

const createHiddenStyle = (strategy: Strategy, zIndex?: string): Record<string, string> => {
  const style: Record<string, string> = {
    position: strategy,
    left: "-9999px",
    top: "-9999px",
    transform: "translate3d(0, 0, 0)",
  }
  if (zIndex) {
    style.zIndex = zIndex
  }
  return style
}

export function useFloatingPopover(
  controller: PopoverController,
  options: FloatingPopoverOptions = {},
): FloatingPopoverBindings {
  const strategy: Strategy = options.strategy ?? "fixed"
  const zIndex = formatZIndex(options.zIndex ?? DEFAULT_Z_INDEX)
  const closeOnOutside = options.closeOnInteractOutside ?? controller.core.shouldCloseOnInteractOutside()
  const returnFocus = options.returnFocus ?? true
  const lockScroll = options.lockScroll ?? controller.core.isModal()

  const triggerRef = ref<HTMLElement | null>(null)
  const contentRef = ref<HTMLElement | null>(null)
  const contentStyle = ref<Record<string, string>>(createHiddenStyle(strategy, zIndex))
  const teleportTarget = ref<string | HTMLElement | null>(resolveTeleportTarget(options.teleportTo))
  const arrowProps = ref<PopoverArrowProps | null>(null)
  const scrollLock = createScrollLockController()
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
    contentStyle.value = createHiddenStyle(strategy, zIndex)
    arrowProps.value = null
  }

  const handlePointerDown = (event: Event) => {
    if (!controller.state.value.open) return
    const target = event.target as Node | null
    if (isWithinSurface(target, triggerRef.value, contentRef.value, controller.id)) {
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
        if (lockScroll) {
          scrollLock.lock()
        }
        void updatePosition()
      } else {
        detachOutsideHandlers()
        if (previous && lockScroll) {
          scrollLock.unlock()
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

  if (typeof window !== "undefined") {
    const handleRelayout = () => {
      if (!controller.state.value.open) return
      window.requestAnimationFrame(() => {
        void updatePosition()
      })
    }

    window.addEventListener("resize", handleRelayout)
    window.addEventListener("scroll", handleRelayout, true)

    onBeforeUnmount(() => {
      window.removeEventListener("resize", handleRelayout)
      window.removeEventListener("scroll", handleRelayout, true)
    })
  }

  onBeforeUnmount(() => {
    detachOutsideHandlers()
    if (lockScroll) {
      scrollLock.unlock()
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

function resolveTeleportTarget(teleportTo?: string | HTMLElement | false): string | HTMLElement | null {
  if (teleportTo === false) {
    return null
  }
  if (teleportTo) {
    return teleportTo
  }
  return ensureOverlayHost({ id: POPOVER_HOST_ID, attribute: POPOVER_HOST_ATTRIBUTE }) ?? "body"
}

function formatZIndex(value?: number | string): string | undefined {
  if (value === undefined) {
    return undefined
  }
  return typeof value === "number" ? `${value}` : value
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
