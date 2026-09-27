import { nextTick, onScopeDispose, ref, watch } from "vue"
import type { Ref } from "vue"
import type { PositionOptions, TooltipArrowOptions, TooltipArrowProps } from "@affino/tooltip-core"
import type { TooltipController } from "./useTooltipController.js"
import {
  createFloatingHiddenStyle,
  createFloatingRelayoutController,
  formatFloatingZIndex,
  resolveFloatingTeleportTarget,
} from "@affino/overlay-host"

type Strategy = "fixed" | "absolute"
const DEFAULT_Z_INDEX = 80

export interface FloatingTooltipOptions extends PositionOptions {
  strategy?: Strategy
  teleportTo?: string | HTMLElement | false
  zIndex?: number | string
  arrow?: TooltipArrowOptions
}

export interface FloatingTooltipBindings {
  triggerRef: Ref<HTMLElement | null>
  tooltipRef: Ref<HTMLElement | null>
  tooltipStyle: Ref<Record<string, string>>
  teleportTarget: Ref<string | HTMLElement | null>
  arrowProps: Ref<TooltipArrowProps | null>
  updatePosition: () => Promise<void>
}

const TOOLTIP_HOST_ID = "affino-tooltip-host"
const TOOLTIP_HOST_ATTRIBUTE = "data-affino-tooltip-host"

export function useFloatingTooltip(
  controller: TooltipController,
  options: FloatingTooltipOptions = {},
): FloatingTooltipBindings {
  const strategy: Strategy = options.strategy ?? "fixed"
  const zIndex = formatFloatingZIndex(options.zIndex ?? DEFAULT_Z_INDEX)
  const triggerRef = ref<HTMLElement | null>(null)
  const tooltipRef = ref<HTMLElement | null>(null)
  const tooltipStyle = ref<Record<string, string>>(createFloatingHiddenStyle(strategy, zIndex))
  const teleportTarget = ref<string | HTMLElement | null>(
    resolveFloatingTeleportTarget(options.teleportTo, {
      id: TOOLTIP_HOST_ID,
      attribute: TOOLTIP_HOST_ATTRIBUTE,
    }),
  )
  const arrowProps = ref<TooltipArrowProps | null>(null)
  let disposed = false
  let pendingPositionFrame: number | null = null
  let resizeObserver: ResizeObserver | null = null
  let observedTrigger: HTMLElement | null = null
  let observedTooltip: HTMLElement | null = null

  const cancelPendingPositionFrame = () => {
    if (pendingPositionFrame !== null) {
      window.cancelAnimationFrame(pendingPositionFrame)
      pendingPositionFrame = null
    }
  }

  const updatePosition = async () => {
    if (typeof window === "undefined" || disposed || !controller.state.value.open) return
    const trigger = triggerRef.value
    const tooltip = tooltipRef.value
    if (!trigger || !tooltip) return

    await nextTick()
    if (disposed || !controller.state.value.open || triggerRef.value !== trigger || tooltipRef.value !== tooltip) return
    if (!trigger.isConnected || !tooltip.isConnected) return

    const anchorRect = trigger.getBoundingClientRect()
    const surfaceRect = tooltip.getBoundingClientRect()
    const position = controller.core.computePosition(anchorRect, surfaceRect, {
      placement: options.placement,
      align: options.align,
      gutter: options.gutter,
      viewportPadding: options.viewportPadding,
      viewportWidth: options.viewportWidth ?? window.innerWidth,
      viewportHeight: options.viewportHeight ?? window.innerHeight,
    })

    const coordinates = resolveFloatingCoordinates(tooltip, position.left, position.top, strategy)

    tooltipStyle.value = {
      position: strategy,
      left: `${Math.round(coordinates.left)}px`,
      top: `${Math.round(coordinates.top)}px`,
      transform: "translate3d(0, 0, 0)",
      ...(zIndex ? { zIndex } : {}),
    }

    arrowProps.value = controller.core.getArrowProps({
      anchorRect,
      tooltipRect: surfaceRect,
      position,
      options: options.arrow,
    })
  }

  const resetPosition = () => {
    tooltipStyle.value = createFloatingHiddenStyle(strategy, zIndex)
    arrowProps.value = null
  }

  const syncResizeObservation = () => {
    if (typeof ResizeObserver === "undefined") return
    const trigger = controller.state.value.open ? triggerRef.value : null
    const tooltip = controller.state.value.open ? tooltipRef.value : null
    if (trigger === observedTrigger && tooltip === observedTooltip) return
    resizeObserver?.disconnect()
    observedTrigger = trigger
    observedTooltip = tooltip
    if (!trigger && !tooltip) return
    resizeObserver ??= new ResizeObserver(schedulePositionUpdate)
    if (trigger) resizeObserver.observe(trigger)
    if (tooltip) resizeObserver.observe(tooltip)
  }

  const schedulePositionUpdate = () => {
    if (disposed || pendingPositionFrame !== null || typeof window === "undefined") return
    pendingPositionFrame = window.requestAnimationFrame(() => {
      pendingPositionFrame = null
      if (!disposed && controller.state.value.open) void updatePosition()
    })
  }

  const relayoutController = createFloatingRelayoutController({
    metrics: { source: "tooltip-vue" },
    onRelayout: () => {
      if (!controller.state.value.open || typeof window === "undefined") {
        return
      }
      schedulePositionUpdate()
    },
  })

  watch(
    () => controller.state.value.open,
    (open) => {
      if (open) {
        relayoutController.activate()
        syncResizeObservation()
        void updatePosition()
      } else {
        relayoutController.deactivate()
        syncResizeObservation()
        cancelPendingPositionFrame()
        resetPosition()
      }
    },
    { immediate: true },
  )

  watch([triggerRef, tooltipRef], () => {
    syncResizeObservation()
    if (controller.state.value.open) {
      void updatePosition()
    }
  })

  onScopeDispose(() => {
    disposed = true
    cancelPendingPositionFrame()
    relayoutController.destroy()
    resizeObserver?.disconnect()
    resizeObserver = null
  })

  return {
    triggerRef,
    tooltipRef,
    tooltipStyle,
    teleportTarget,
    arrowProps,
    updatePosition,
  }
}

function resolveFloatingCoordinates(element: HTMLElement, left: number, top: number, strategy: Strategy) {
  const parent = element.offsetParent as HTMLElement | null
  if (!parent) {
    if (strategy !== "absolute") return { left, top }
    const win = element.ownerDocument.defaultView
    return { left: left + (win?.scrollX ?? 0), top: top + (win?.scrollY ?? 0) }
  }
  const rect = parent.getBoundingClientRect()
  return {
    left: left - rect.left - parent.clientLeft + parent.scrollLeft,
    top: top - rect.top - parent.clientTop + parent.scrollTop,
  }
}
