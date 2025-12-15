import { useCallback, useEffect, useRef } from "react"
import type { Alignment, Placement, PositionResult, Rect } from "@affino/menu-core"
import type { MenuController } from "./useMenuController"
import { assignPanelPosition, toRect } from "./dom"

const isBrowser = typeof window !== "undefined"

const isDebugMenuEnabled = () => (
  (typeof process !== "undefined" && Boolean(process.env?.DEBUG_MENU)) ||
  (typeof globalThis !== "undefined" && Boolean((globalThis as Record<string, unknown>).__MENU_DEBUG__))
)

interface PositioningOptions {
  afterUpdate?: (position: PositionResult) => void
  placement?: Placement
  align?: Alignment
  gutter?: number
  viewportPadding?: number
}

export function useMenuPositioning(controller: MenuController, options?: PositioningOptions) {
  const panelElementRef = controller.panelRef
  const triggerElementRef = controller.triggerRef
  const anchorElementRef = controller.anchorRef
  const controllerCore = controller.core
  const stateOpen = controller.state.open
  const anchorVersion = controller.versions.anchor
  const triggerVersion = controller.versions.trigger
  const panelVersion = controller.versions.panel
  const optionsRef = useRef<PositioningOptions | undefined>(options)
  optionsRef.current = options

  const rafRef = useRef<number | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)

  const update = useCallback(() => {
    if (!isBrowser) return
    if (!stateOpen) {
      if (isDebugMenuEnabled()) {
        console.log("useMenuPositioning: skip update (closed)", controllerCore.id)
      }
      return
    }
    const panelEl = panelElementRef.current
    if (!panelEl) {
      if (isDebugMenuEnabled()) {
        console.log("useMenuPositioning: skip update (no panel)", controllerCore.id)
      }
      return
    }
    const anchorRect = anchorElementRef.current ?? toRect(triggerElementRef.current)
    const panelRect = toRect(panelEl)
    if (!anchorRect || !panelRect) {
      if (isDebugMenuEnabled()) {
        console.log("useMenuPositioning: skip update (missing geometry)", {
          controllerId: controllerCore.id,
          hasAnchor: Boolean(anchorRect),
          hasTrigger: Boolean(triggerElementRef.current),
          hasPanel: Boolean(panelRect),
        })
      }
      return
    }

    const opts = optionsRef.current
    const gutter = opts?.gutter ?? 6
    const viewportPadding = opts?.viewportPadding ?? 8
    const placement = resolvePreferredPlacement(
      opts?.placement,
      anchorRect,
      panelRect,
      window.innerWidth,
      window.innerHeight,
      gutter,
      viewportPadding
    )
    const position = controllerCore.computePosition(anchorRect, panelRect, {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      placement,
      align: opts?.align,
      gutter,
      viewportPadding,
    })
    if (isDebugMenuEnabled()) {
      console.log("useMenuPositioning: assign position", {
        controllerId: controllerCore.id,
        anchorRect,
        panelRect,
        position,
      })
    }
    assignPanelPosition(panelEl, position)
    opts?.afterUpdate?.(position)
  }, [stateOpen, controllerCore, anchorElementRef, triggerElementRef, panelElementRef])

  const schedule = useCallback(() => {
    if (!isBrowser) return
    if (rafRef.current !== null) return
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null
      update()
    })
  }, [update])

  useEffect(() => {
    if (!isBrowser) return

    const handleScroll = () => schedule()

    window.addEventListener("scroll", handleScroll, true)
    window.addEventListener("resize", handleScroll)

    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      window.removeEventListener("scroll", handleScroll, true)
      window.removeEventListener("resize", handleScroll)
    }
  }, [schedule])

  useEffect(() => {
    if (!isBrowser) return
    if (typeof ResizeObserver === "undefined") return

    const observer = new ResizeObserver(() => schedule())
    resizeObserverRef.current = observer

    return () => {
      observer.disconnect()
      resizeObserverRef.current = null
    }
  }, [schedule])

  useEffect(() => {
    const observer = resizeObserverRef.current
    if (!observer) return
    const trigger = controller.triggerRef.current
    if (!trigger) return
    observer.observe(trigger)
    return () => {
      observer.unobserve(trigger)
    }
  }, [triggerVersion])

  useEffect(() => {
    const observer = resizeObserverRef.current
    if (!observer) return
    const panel = controller.panelRef.current
    if (!panel) return
    observer.observe(panel)
    return () => {
      observer.unobserve(panel)
    }
  }, [panelVersion])

  useEffect(() => {
    if (stateOpen) {
      schedule()
    }
  }, [stateOpen, schedule])

  useEffect(() => {
    if (stateOpen) {
      schedule()
    }
  }, [anchorVersion, schedule, stateOpen])

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
