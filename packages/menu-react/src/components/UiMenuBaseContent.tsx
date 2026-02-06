import { createPortal } from "react-dom"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  PropsWithChildren,
  HTMLAttributes,
  PointerEvent as ReactPointerEvent,
  MouseEvent as ReactMouseEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from "react"
import type { PositionResult } from "@affino/menu-core"
import type { MenuProviderValue } from "../context"
import { useMenuPointerHandlers } from "../useMenuPointerHandlers"
import { useMenuFocus } from "../useMenuFocus"
import { useMenuPositioning } from "../useMenuPositioning"
import { toRect } from "../dom"
import { useSubmenuBridge } from "../useSubmenuBridge"
import { isDebugMenuEnabled } from "../debugEnv"

const DEBUG_MENU = isDebugMenuEnabled()

interface UiMenuBaseContentProps extends PropsWithChildren<HTMLAttributes<HTMLDivElement>> {
  provider: MenuProviderValue
  variant: "menu" | "submenu"
  teleportTo?: string
  className?: string
}

export function UiMenuBaseContent({ provider, variant, teleportTo, className, children, ...rest }: UiMenuBaseContentProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const controller = provider.controller
  const bindings = controller.core.getPanelProps()
  const pointerHandlers = useMenuPointerHandlers(provider)
  const submenuBridge = useSubmenuBridge(variant)
  const panelPointer = pointerHandlers.makePanelHandlers({ bindings, bridge: submenuBridge })
  const { focusFirst, focusLast } = useMenuFocus(controller.panelRef)
  const [lastPlacement, setLastPlacement] = useState<PositionResult["placement"] | null>(null)
  const isOpen = controller.state.open
  useEffect(() => {
    if (DEBUG_MENU) {
      console.log("content", controller.id, variant, "isOpen", isOpen)
    }
  }, [controller.id, variant, isOpen])
  const setPanelElement = controller.setPanelElement
  const setAnchor = controller.setAnchor
  const setTriggerRect = controller.setTriggerRect
  const setPanelRect = controller.setPanelRect
  const anchorVersion = controller.versions.anchor
  const triggerVersion = controller.versions.trigger
  const panelVersion = controller.versions.panel
  const [shouldRender, setShouldRender] = useState(isOpen)
  const [panelState, setPanelState] = useState<"open" | "closed">(isOpen ? "open" : "closed")
  const resolvedSide = lastPlacement ?? (variant === "submenu" ? "right" : "bottom")
  const resolvedMotion = motionFromSide(resolvedSide)
  const defaultClassName = variant === "submenu" ? "ui-submenu-content" : "ui-menu-content"
  const mergedClassName = className ? `${defaultClassName} ${className}` : defaultClassName

  const portalTarget = useMemo(() => {
    if (typeof document === "undefined") {
      return null
    }
    if (!teleportTo) {
      return document.body
    }
    return document.querySelector<HTMLElement>(teleportTo) ?? document.body
  }, [teleportTo])

  const preferredPlacement: PositionResult["placement"] = variant === "submenu" ? "right" : "bottom"

  const syncSubmenuGeometry = useCallback(() => {
    if (variant !== "submenu" || !submenuBridge) {
      return
    }
    const triggerRect = toRect(controller.triggerRef.current)
    setTriggerRect?.(triggerRect ?? null)
    const panelRect = toRect(rootRef.current)
    setPanelRect?.(panelRect ?? null)
  }, [variant, submenuBridge, controller.triggerRef, setTriggerRect, setPanelRect])

  const updatePosition = useMenuPositioning(controller, {
    placement: preferredPlacement,
    afterUpdate: (position) => {
      setLastPlacement(position.placement)
      syncSubmenuGeometry()
    },
  })

  const refreshGeometry = useCallback(() => {
    if (!controller.state.open) {
      return
    }
    syncSubmenuGeometry()
    updatePosition()
  }, [controller.state.open, syncSubmenuGeometry, updatePosition])
  const refreshGeometryRef = useRef(refreshGeometry)
  refreshGeometryRef.current = refreshGeometry

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true)
      setPanelState("closed")
      const raf = requestAnimationFrame(() => {
        setPanelState("open")
        refreshGeometryRef.current()
        if (variant === "submenu") {
          focusFirst()
        } else {
          rootRef.current?.focus({ preventScroll: true })
        }
      })
      return () => cancelAnimationFrame(raf)
    }

    setPanelElement(null)
    setAnchor(null)
    setPanelState("closed")
    setShouldRender(false)
  }, [isOpen, focusFirst, variant, setPanelElement, setAnchor])

  useEffect(() => {
    if (isOpen) {
      refreshGeometryRef.current()
    }
  }, [isOpen, anchorVersion])

  useEffect(() => {
    if (isOpen) {
      refreshGeometryRef.current()
    }
  }, [isOpen, triggerVersion, panelVersion])

  const setRoot = useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node
    setPanelElement(node)
  }, [setPanelElement])

  const handlePointerEnter = (event: ReactPointerEvent | ReactMouseEvent) => {
    panelPointer.onPointerEnter(event.nativeEvent as any)
  }

  const handlePointerLeave = (event: ReactPointerEvent | ReactMouseEvent) => {
    if (variant !== "submenu") {
      return
    }
    panelPointer.onPointerLeave(event.nativeEvent as any)
  }

  const handleKeydown = (event: ReactKeyboardEvent) => {
    if (event.key === "Tab") {
      event.preventDefault()
      if (variant === "submenu") {
        event.shiftKey ? focusLast() : focusFirst()
        return
      }
      controller.close("keyboard")
      setAnchor(null)
      controller.triggerRef.current?.focus()
      return
    }
    bindings.onKeyDown?.(event.nativeEvent)
  }

  if (!shouldRender) {
    return null
  }

  const content = (
    <div
      ref={setRoot}
      className={mergedClassName}
      id={bindings.id ?? undefined}
      role="menu"
      tabIndex={-1}
      data-ui-menu-panel="true"
      data-state={panelState}
      data-side={resolvedSide}
      data-motion={resolvedMotion}
      data-ui-root-menu-id={provider.rootId}
      data-ui-menu-id={controller.id}
      data-ui-parent-menu-id={provider.parentController?.id ?? undefined}
      onPointerEnter={handlePointerEnter as any}
      onPointerLeave={handlePointerLeave as any}
      onMouseEnter={handlePointerEnter as any}
      onMouseLeave={handlePointerLeave as any}
      onKeyDown={handleKeydown as any}
      {...rest}
    >
      {children}
    </div>
  )

  if (portalTarget) {
    return createPortal(content, portalTarget)
  }

  return content
}

function motionFromSide(side: PositionResult["placement"]) {
  switch (side) {
    case "top":
      return "from-top"
    case "left":
      return "from-left"
    case "right":
      return "from-right"
    case "bottom":
    default:
      return "from-bottom"
  }
}
