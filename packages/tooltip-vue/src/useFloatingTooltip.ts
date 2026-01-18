import { nextTick, onBeforeUnmount, ref, watch } from "vue"
import type { Ref } from "vue"
import type { PositionOptions } from "@affino/tooltip-core"
import type { TooltipController } from "./useTooltipController"

type Strategy = "fixed" | "absolute"

export interface FloatingTooltipOptions extends PositionOptions {
  strategy?: Strategy
}

export interface FloatingTooltipBindings {
  triggerRef: Ref<HTMLElement | null>
  tooltipRef: Ref<HTMLElement | null>
  tooltipStyle: Ref<Record<string, string>>
  updatePosition: () => Promise<void>
}

const createHiddenStyle = (strategy: Strategy): Record<string, string> => ({
  position: strategy,
  left: "-9999px",
  top: "-9999px",
  transform: "translate3d(0, 0, 0)",
})

export function useFloatingTooltip(
  controller: TooltipController,
  options: FloatingTooltipOptions = {},
): FloatingTooltipBindings {
  const strategy: Strategy = options.strategy ?? "fixed"
  const triggerRef = ref<HTMLElement | null>(null)
  const tooltipRef = ref<HTMLElement | null>(null)
  const tooltipStyle = ref<Record<string, string>>(createHiddenStyle(strategy))

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
    }
  }

  const resetPosition = () => {
    tooltipStyle.value = createHiddenStyle(strategy)
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
    updatePosition,
  }
}
