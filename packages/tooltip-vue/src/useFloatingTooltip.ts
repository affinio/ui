import { nextTick, onBeforeUnmount, ref, watch } from "vue"
import type { Ref } from "vue"
import type { PositionOptions, TooltipArrowOptions, TooltipArrowProps } from "@affino/tooltip-core"
import type { TooltipController } from "./useTooltipController"
import { ensureOverlayHost } from "@affino/overlay-host"

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

export function useFloatingTooltip(
  controller: TooltipController,
  options: FloatingTooltipOptions = {},
): FloatingTooltipBindings {
  const strategy: Strategy = options.strategy ?? "fixed"
  const zIndex = formatZIndex(options.zIndex ?? DEFAULT_Z_INDEX)
  const triggerRef = ref<HTMLElement | null>(null)
  const tooltipRef = ref<HTMLElement | null>(null)
  const tooltipStyle = ref<Record<string, string>>(createHiddenStyle(strategy, zIndex))
  const teleportTarget = ref<string | HTMLElement | null>(resolveTeleportTarget(options.teleportTo))
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
    tooltipStyle.value = createHiddenStyle(strategy, zIndex)
    arrowProps.value = null
  }

  watch(
    () => controller.state.value.open,
    (open) => {
      if (open) {
        updatePosition()
      } else {
        resetPosition()
      }
    },
  )

  watch([triggerRef, tooltipRef], () => {
    if (controller.state.value.open) {
      updatePosition()
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

  return {
    triggerRef,
    tooltipRef,
    tooltipStyle,
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
  return ensureOverlayHost({ id: TOOLTIP_HOST_ID, attribute: TOOLTIP_HOST_ATTRIBUTE }) ?? "body"
}

function formatZIndex(value?: number | string): string | undefined {
  if (value === undefined) {
    return undefined
  }
  return typeof value === "number" ? `${value}` : value
}
