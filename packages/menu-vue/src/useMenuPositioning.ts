import { nextTick, onBeforeUnmount, watch } from "vue"
import type { Alignment, Placement, PositionResult, Rect } from "@affino/menu-core"
import type { MenuController } from "./useMenuController"
import { toRect, assignPanelPosition } from "./dom"

const isBrowser = typeof window !== "undefined"

interface PositioningOptions {
  afterUpdate?: (position: PositionResult) => void
  placement?: Placement
  align?: Alignment
  gutter?: number
  viewportPadding?: number
}

export function useMenuPositioning(controller: MenuController, options?: PositioningOptions) {
  if (!isBrowser) {
    return () => {}
  }

  let rafHandle: number | null = null
  let resizeObserver: ResizeObserver | null = null
  let relayoutBound = false

  const schedule = () => {
    if (rafHandle !== null) return
    rafHandle = window.requestAnimationFrame(() => {
      rafHandle = null
      update()
    })
  }

  const update = () => {
    if (!controller.state.value.open) return
    const panelEl = controller.panelRef.value
    if (!panelEl) return
    const anchorRect = controller.anchorRef.value ?? toRect(controller.triggerRef.value)
    const panelRect = toRect(panelEl)
    if (!anchorRect || !panelRect) return
    const gutter = options?.gutter ?? 6
    const viewportPadding = options?.viewportPadding ?? 8
    const placement = resolvePreferredPlacement(
      options?.placement,
      anchorRect,
      panelRect,
      window.innerWidth,
      window.innerHeight,
      gutter,
      viewportPadding
    )
    const position = controller.core.computePosition(anchorRect, panelRect, {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      placement,
      align: options?.align,
      gutter,
      viewportPadding,
    })
    assignPanelPosition(panelEl, position)
    options?.afterUpdate?.(position)
  }

  const observe = (el: HTMLElement | null) => {
    if (!resizeObserver || !el) return
    resizeObserver.observe(el)
  }

  const unobserve = (el: HTMLElement | null) => {
    if (!resizeObserver || !el) return
    resizeObserver.unobserve(el)
  }

  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(schedule)

    watch(
      () => controller.triggerRef.value,
      (next, prev) => {
        if (prev) unobserve(prev)
        if (next) observe(next)
      }
    )

    watch(
      () => controller.panelRef.value,
      (next, prev) => {
        if (prev) unobserve(prev)
        if (next) observe(next)
      }
    )
  }

  const handleRelayout = () => {
    if (!controller.state.value.open) return
    schedule()
  }

  const bindRelayoutListeners = () => {
    if (relayoutBound) return
    relayoutBound = true
    window.addEventListener("scroll", handleRelayout, true)
    window.addEventListener("resize", handleRelayout)
  }

  const unbindRelayoutListeners = () => {
    if (!relayoutBound) return
    relayoutBound = false
    window.removeEventListener("scroll", handleRelayout, true)
    window.removeEventListener("resize", handleRelayout)
  }

  onBeforeUnmount(() => {
    if (rafHandle !== null) {
      window.cancelAnimationFrame(rafHandle)
      rafHandle = null
    }
    unbindRelayoutListeners()
    resizeObserver?.disconnect()
  })

  watch(
    () => controller.state.value.open,
    (open) => {
      if (open) {
        bindRelayoutListeners()
        nextTick(() => {
          schedule()
        })
      } else {
        unbindRelayoutListeners()
      }
    },
    { immediate: true }
  )

  watch(
    () => controller.anchorRef.value,
    () => {
      if (controller.state.value.open) {
        schedule()
      }
    }
  )

  return update
}

function resolvePreferredPlacement(
  preferred: Placement | undefined,
  anchor: Rect,
  panel: Rect,
  viewportWidth: number,
  viewportHeight: number,
  gutter: number,
  viewportPadding: number
): Placement {
  const basePreference = preferred && preferred !== "auto" ? preferred : "auto"

  if ((basePreference === "right" || basePreference === "left") && preferred === "auto") {
    const spaceRight = availableHorizontalSpace("right", anchor, viewportWidth, gutter, viewportPadding)
    const spaceLeft = availableHorizontalSpace("left", anchor, viewportWidth, gutter, viewportPadding)
    return spaceRight >= spaceLeft ? "right" : "left"
  }

  if (!preferred || preferred === "auto") {
    return "auto"
  }

  if (preferred === "left" || preferred === "right") {
    return chooseHorizontalPlacement(preferred, anchor, panel, viewportWidth, viewportHeight, gutter, viewportPadding)
  }
  if (preferred === "top" || preferred === "bottom") {
    return chooseVerticalPlacement(preferred, anchor, panel, viewportHeight, viewportWidth, gutter, viewportPadding)
  }
  return preferred
}

function chooseHorizontalPlacement(
  preferred: Exclude<Placement, "top" | "bottom" | "auto">,
  anchor: Rect,
  panel: Rect,
  viewportWidth: number,
  viewportHeight: number,
  gutter: number,
  viewportPadding: number
): Placement {
  const opposite = preferred === "left" ? "right" : "left"
  const preferredSpace = availableHorizontalSpace(preferred, anchor, viewportWidth, gutter, viewportPadding)
  if (preferredSpace >= panel.width) {
    return preferred
  }
  const oppositeSpace = availableHorizontalSpace(opposite, anchor, viewportWidth, gutter, viewportPadding)
  if (oppositeSpace >= panel.width) {
    return opposite
  }
  const belowSpace = availableVerticalSpace("bottom", anchor, viewportHeight, gutter, viewportPadding)
  const aboveSpace = availableVerticalSpace("top", anchor, viewportHeight, gutter, viewportPadding)
  if (belowSpace >= panel.height || aboveSpace >= panel.height) {
    return belowSpace >= aboveSpace ? "bottom" : "top"
  }
  return preferredSpace >= oppositeSpace ? preferred : opposite
}

function chooseVerticalPlacement(
  preferred: Exclude<Placement, "left" | "right" | "auto">,
  anchor: Rect,
  panel: Rect,
  viewportHeight: number,
  viewportWidth: number,
  gutter: number,
  viewportPadding: number
): Placement {
  const opposite = preferred === "top" ? "bottom" : "top"
  const preferredSpace = availableVerticalSpace(preferred, anchor, viewportHeight, gutter, viewportPadding)
  if (preferredSpace >= panel.height) {
    return preferred
  }
  const oppositeSpace = availableVerticalSpace(opposite, anchor, viewportHeight, gutter, viewportPadding)
  if (oppositeSpace >= panel.height) {
    return opposite
  }
  const rightSpace = availableHorizontalSpace("right", anchor, viewportWidth, gutter, viewportPadding)
  const leftSpace = availableHorizontalSpace("left", anchor, viewportWidth, gutter, viewportPadding)
  if (rightSpace >= panel.width || leftSpace >= panel.width) {
    return rightSpace >= leftSpace ? "right" : "left"
  }
  return preferredSpace >= oppositeSpace ? preferred : opposite
}

function availableHorizontalSpace(
  side: "left" | "right",
  anchor: Rect,
  viewportWidth: number,
  gutter: number,
  viewportPadding: number
) {
  if (side === "right") {
    return viewportWidth - viewportPadding - (anchor.x + anchor.width + gutter)
  }
  return anchor.x - viewportPadding - gutter
}

function availableVerticalSpace(
  side: "top" | "bottom",
  anchor: Rect,
  viewportHeight: number,
  gutter: number,
  viewportPadding: number
) {
  if (side === "bottom") {
    return viewportHeight - viewportPadding - (anchor.y + anchor.height + gutter)
  }
  return anchor.y - viewportPadding - gutter
}
