import { nextTick, onScopeDispose, ref, watch } from "vue"
import type { Ref } from "vue"
import type { PositionOptions, TooltipArrowOptions, TooltipArrowProps } from "@affino/tooltip-core"
import type { TooltipController } from "./useTooltipController"
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

  const updatePosition = async () => {
    if (typeof window === "undefined") return
    if (!controller.state.value.open || !triggerRef.value || !tooltipRef.value) return

    await nextTick()
    const anchorRect = triggerRef.value.getBoundingClientRect()
    const surfaceRect = tooltipRef.value.getBoundingClientRect()
    const position = controller.core.computePosition(anchorRect, surfaceRect, {
      placement: options.placement,
      align: options.align,
      gutter: options.gutter,
      viewportPadding: options.viewportPadding,
      viewportWidth: options.viewportWidth ?? window.innerWidth,
      viewportHeight: options.viewportHeight ?? window.innerHeight,
    })

    tooltipStyle.value = {
      position: strategy,
      left: `${Math.round(position.left)}px`,
      top: `${Math.round(position.top)}px`,
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

  const relayoutController = createFloatingRelayoutController({
    metrics: { source: "tooltip-vue" },
    onRelayout: () => {
      if (!controller.state.value.open || typeof window === "undefined") {
        return
      }
      window.requestAnimationFrame(() => {
        void updatePosition()
      })
    },
  })

  watch(
    () => controller.state.value.open,
    (open) => {
      if (open) {
        relayoutController.activate()
        void updatePosition()
      } else {
        relayoutController.deactivate()
        resetPosition()
      }
    },
  )

  watch([triggerRef, tooltipRef], () => {
    if (controller.state.value.open) {
      void updatePosition()
    }
  })

  onScopeDispose(() => {
    relayoutController.destroy()
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
