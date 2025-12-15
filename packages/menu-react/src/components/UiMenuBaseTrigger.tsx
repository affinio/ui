import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type {
  PropsWithChildren,
  PointerEvent as ReactPointerEvent,
  MouseEvent as ReactMouseEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from "react"
import type { ItemProps, TriggerProps } from "@affino/menu-core"
import type { MenuProviderValue, SubmenuProviderValue } from "../context"
import { AsChild } from "./AsChild"
import { useMenuPointerHandlers } from "../useMenuPointerHandlers"
import { useSubmenuBridge } from "../useSubmenuBridge"
import type { MenuController } from "../useMenuController"

const isDebugMenuEnabled = () => (
  (typeof process !== "undefined" && Boolean(process.env?.DEBUG_MENU)) ||
  (typeof globalThis !== "undefined" && Boolean((globalThis as Record<string, unknown>).__MENU_DEBUG__))
)

const stopPropagationKeys = new Set(["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End", "Enter", " ", "Space"])
const LONG_PRESS_DELAY_MS = 450
const LONG_PRESS_MOVE_TOLERANCE_PX = 12

type TriggerMode = "click" | "contextmenu" | "both"

interface TriggerPointerHandlers {
  onPointerEnter: (event: PointerEvent) => void
  onPointerLeave: (event: PointerEvent) => void
}

interface UiMenuBaseTriggerProps extends PropsWithChildren {
  provider: MenuProviderValue
  variant: "menu" | "submenu"
  asChild?: boolean
  triggerMode?: TriggerMode
  showArrow?: boolean
  componentLabel: string
}

export function UiMenuBaseTrigger({
  provider,
  variant,
  asChild,
  triggerMode,
  showArrow,
  componentLabel,
  children,
}: UiMenuBaseTriggerProps) {
  const elementRef = useRef<HTMLElement | null>(null)
  const computedMode = useMemo<TriggerMode>(() => {
    if (triggerMode) return triggerMode
    return variant === "menu" ? "click" : "both"
  }, [triggerMode, variant])

  const openOnClick = computedMode === "click" || computedMode === "both"
  const openOnContext = computedMode === "contextmenu" || computedMode === "both"

  const submenuBridge = useSubmenuBridge(variant)
  const targetController = submenuBridge ? submenuBridge.child.controller : provider.controller
  const parentController = submenuBridge?.parent.controller ?? provider.parentController
  const submenuItemId = submenuBridge?.child.submenuItemId ?? provider.submenuItemId ?? null

  const triggerBindings = targetController.core.getTriggerProps()
  const parentBindings = useMemo(() => {
    if (variant !== "submenu" || !parentController || !submenuItemId) {
      return null
    }
    return parentController.core.getItemProps(submenuItemId)
  }, [variant, parentController, submenuItemId])

  const pointerHandlers = useMenuPointerHandlers(provider)
  const triggerPointer = pointerHandlers.makeTriggerHandlers({ bindings: triggerBindings, bridge: submenuBridge })
  const [boundElement, setBoundElement] = useState<HTMLElement | null>(null)
  const setTriggerElement = provider.controller.setTriggerElement

  const bindElement = useCallback((node: HTMLElement | null) => {
    elementRef.current = node
    setBoundElement((prev) => (prev === node ? prev : node))
  }, [])

  useLayoutEffect(() => {
    setTriggerElement(boundElement)
  }, [boundElement, setTriggerElement])

  useEffect(() => {
    return () => {
      setTriggerElement(null)
    }
  }, [setTriggerElement])

  const parentCore = parentController?.core ?? null
  const parentControllerId = parentController?.id ?? null

  useEffect(() => {
    if (variant !== "submenu" || !parentCore || !submenuItemId) {
      return
    }
    if (isDebugMenuEnabled()) {
      console.log("register submenu", parentControllerId, submenuItemId)
    }
    const unregister = parentCore.registerItem(submenuItemId)
    return () => {
      if (isDebugMenuEnabled()) {
        console.log("unregister submenu", parentControllerId, submenuItemId)
      }
      unregister?.()
    }
  }, [variant, parentCore, submenuItemId, parentControllerId])

  useEffect(() => {
    if (variant !== "submenu" || !parentController || !submenuItemId) {
      return
    }
    if (parentController.state.activeItemId === submenuItemId) {
      if (isDebugMenuEnabled()) {
        console.log("submenu trigger highlighted", submenuItemId)
      }
      elementRef.current?.focus({ preventScroll: true })
    }
  }, [variant, parentController, submenuItemId, parentController?.state.activeItemId])

  const elementBindings = useMemo(() => createElementBindings(variant, triggerBindings, parentBindings), [variant, triggerBindings, parentBindings])

  const {
    handleClick,
    handleContextMenu,
    handleKeydown,
    handlePointerEnter,
    handlePointerLeave,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  } = useTriggerEventHandlers({
    variant,
    provider,
    targetController,
    triggerBindings,
    parentBindings,
    pointer: triggerPointer,
    openOnClick,
    openOnContext,
    submenuBridge,
  })

  const reactPointerEnter = variant === "submenu"
    ? (event: ReactPointerEvent<HTMLElement>) => {
        if (isDebugMenuEnabled()) {
          console.log("react synthetic pointer enter", event.type)
        }
        handlePointerEnter(event.nativeEvent)
      }
    : undefined
  const reactPointerLeave = variant === "submenu"
    ? (event: ReactPointerEvent<HTMLElement>) => {
        if (isDebugMenuEnabled()) {
          console.log("react synthetic pointer leave", event.type)
        }
        handlePointerLeave(event.nativeEvent)
      }
    : undefined
  const reactMouseEnter = variant === "submenu"
    ? (event: ReactMouseEvent<HTMLElement>) => handlePointerEnter(event.nativeEvent)
    : undefined
  const reactMouseLeave = variant === "submenu"
    ? (event: ReactMouseEvent<HTMLElement>) => handlePointerLeave(event.nativeEvent)
    : undefined
  const reactPointerDown = variant === "menu"
    ? (event: ReactPointerEvent<HTMLElement>) => handlePointerDown(event.nativeEvent)
    : undefined
  const reactPointerUp = variant === "menu"
    ? (event: ReactPointerEvent<HTMLElement>) => handlePointerUp(event.nativeEvent)
    : undefined
  const reactPointerCancel = variant === "menu"
    ? () => handlePointerCancel()
    : undefined
  const reactPointerMove = variant === "menu"
    ? (event: ReactPointerEvent<HTMLElement>) => handlePointerMove(event.nativeEvent)
    : undefined
  const reactClick = variant === "menu"
    ? (openOnClick ? (event: ReactMouseEvent<HTMLElement>) => handleClick(event.nativeEvent) : undefined)
    : (event: ReactMouseEvent<HTMLElement>) => handleClick(event.nativeEvent)
  const reactContextMenu = variant === "menu" && openOnContext
    ? (event: ReactMouseEvent<HTMLElement>) => handleContextMenu(event.nativeEvent)
    : undefined
  const reactKeydown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (stopPropagationKeys.has(event.key)) {
      event.stopPropagation()
    }
    handleKeydown(event.nativeEvent)
  }

  const triggerProps = {
    className: variant === "submenu" ? "ui-submenu-trigger" : "ui-menu-trigger",
    id: elementBindings.id ?? undefined,
    role: elementBindings.role,
    tabIndex: elementBindings.tabIndex ?? undefined,
    "data-state": elementBindings.dataState,
    "aria-disabled": elementBindings.ariaDisabled,
    "aria-haspopup": elementBindings.ariaHaspopup,
    "aria-expanded": elementBindings.ariaExpanded,
    "aria-controls": elementBindings.ariaControls,
    "data-ui-menu-trigger": "true",
    "data-ui-menu-id": targetController.id,
    "data-ui-root-menu-id": provider.rootId,
    "data-ui-parent-menu-id": parentController?.id ?? undefined,
    onPointerEnter: reactPointerEnter,
    onPointerLeave: reactPointerLeave,
    onMouseEnter: reactMouseEnter,
    onMouseLeave: reactMouseLeave,
    onPointerDown: reactPointerDown,
    onPointerUp: reactPointerUp,
    onPointerCancel: reactPointerCancel,
    onPointerMove: reactPointerMove,
    onClick: reactClick,
    onContextMenu: reactContextMenu,
    onKeyDown: reactKeydown,
  }

  const asChildProps = {
    ...triggerProps,
    ref: bindElement,
  }

  if (asChild) {
    return (
      <AsChild componentLabel={componentLabel} forwardedProps={asChildProps}>
        {children}
      </AsChild>
    )
  }

  return (
    <button type="button" ref={bindElement} {...triggerProps}>
      {children}
      {(variant === "submenu" || showArrow) && <span className="ui-submenu-arrow">▶</span>}
    </button>
  )
}

function createElementBindings(
  variant: "menu" | "submenu",
  triggerBindings: TriggerProps,
  parentBindings: ItemProps | null
) {
  if (variant !== "submenu" || !parentBindings) {
    return {
      id: triggerBindings.id,
      role: triggerBindings.role,
      tabIndex: triggerBindings.tabIndex,
      dataState: undefined,
      ariaDisabled: undefined,
      ariaHaspopup: triggerBindings["aria-haspopup"],
      ariaExpanded: triggerBindings["aria-expanded"],
      ariaControls: triggerBindings["aria-controls"],
    }
  }

  return {
    id: parentBindings.id,
    role: parentBindings.role,
    tabIndex: parentBindings.tabIndex,
    dataState: parentBindings["data-state"],
    ariaDisabled: parentBindings["aria-disabled"],
    ariaHaspopup: triggerBindings["aria-haspopup"],
    ariaExpanded: triggerBindings["aria-expanded"],
    ariaControls: triggerBindings["aria-controls"],
  }
}

function useTriggerEventHandlers(args: {
  variant: "menu" | "submenu"
  provider: MenuProviderValue
  targetController: MenuController
  triggerBindings: TriggerProps
  parentBindings: ItemProps | null
  pointer: TriggerPointerHandlers
  openOnClick: boolean
  openOnContext: boolean
  submenuBridge: SubmenuProviderValue | null
}) {
  const ancestorBridge = args.submenuBridge?.parentSubmenu ?? null
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressOrigin = useRef<{ x: number; y: number } | null>(null)

  const resetAnchor = () => args.provider.controller.setAnchor(null)
  const setAnchorFromEvent = (event: MouseEvent | PointerEvent) => {
    args.provider.controller.setAnchor({ x: event.clientX, y: event.clientY, width: 0, height: 0 })
  }

  const shouldHandleLongPress = (event: PointerEvent) =>
    args.variant === "menu" && args.openOnContext && event.pointerType === "touch"

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    longPressOrigin.current = null
  }

  const handleContextMenu = useCallback((event: MouseEvent | PointerEvent) => {
    if (args.variant !== "menu") {
      args.targetController.recordPointer?.({ x: event.clientX, y: event.clientY })
      args.triggerBindings.onClick?.(event as MouseEvent)
      return
    }
    if (!args.openOnContext) return
    event.preventDefault()
    if (args.provider.controller.state.open) {
      args.provider.controller.close("pointer")
      requestAnimationFrame(() => {
        setAnchorFromEvent(event)
        args.provider.controller.open("pointer")
      })
      return
    }
    setAnchorFromEvent(event)
    args.provider.controller.open("pointer")
  }, [args])

  const scheduleLongPress = (event: PointerEvent) => {
    clearLongPress()
    longPressOrigin.current = { x: event.clientX, y: event.clientY }
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null
      longPressOrigin.current = null
      handleContextMenu(event)
    }, LONG_PRESS_DELAY_MS)
  }

  const cancelIfPointerMoved = (event: PointerEvent) => {
    if (!longPressOrigin.current) return
    const dx = event.clientX - longPressOrigin.current.x
    const dy = event.clientY - longPressOrigin.current.y
    if (dx * dx + dy * dy > LONG_PRESS_MOVE_TOLERANCE_PX * LONG_PRESS_MOVE_TOLERANCE_PX) {
      clearLongPress()
    }
  }

  const handleClick = (event: MouseEvent) => {
    if (args.variant === "menu" && !args.openOnClick) return
    args.targetController.recordPointer?.({ x: event.clientX, y: event.clientY })
    if (args.variant === "menu") {
      resetAnchor()
    }
    if (isDebugMenuEnabled()) {
      console.log("ui-menu trigger click", {
        id: args.targetController.id,
        openBefore: args.targetController.state.open,
        hasCoreHandler: Boolean(args.triggerBindings.onClick),
      })
    }
    if (args.triggerBindings.onClick) {
      args.triggerBindings.onClick(event)
    } else {
      args.targetController.toggle()
    }
    if (isDebugMenuEnabled()) {
      queueMicrotask(() => {
        console.log("ui-menu trigger toggled", {
          id: args.targetController.id,
          openAfter: args.targetController.state.open,
        })
      })
    }
  }

  const handleKeydown = (event: KeyboardEvent) => {
    if (isDebugMenuEnabled()) {
      console.log("handleKeydown", args.variant, event.key, args.targetController.state.open, args.targetController.kind, args.targetController.core.constructor.name)
    }
    if (args.variant === "menu") {
      resetAnchor()
    }

    if (
      args.variant === "submenu" &&
      event.key === "ArrowLeft" &&
      !args.targetController.state.open &&
      ancestorBridge
    ) {
      event.preventDefault()
      ancestorBridge.child.controller.close("keyboard")
      ancestorBridge.parent.controller.highlight(ancestorBridge.child.submenuItemId ?? null)
      ancestorBridge.child.controller.triggerRef.current?.focus({ preventScroll: true })
      return
    }

    if (stopPropagationKeys.has(event.key)) {
      event.stopPropagation()
    }

    if (args.variant === "submenu" && args.parentBindings) {
      args.parentBindings.onKeyDown?.(event)
    }

    if (isDebugMenuEnabled()) {
      console.log(
        "hasTriggerKeydown",
        Boolean(args.triggerBindings.onKeyDown),
        args.triggerBindings.onKeyDown?.toString().slice(0, 80)
      )
    }
    args.triggerBindings.onKeyDown?.(event)
    if (isDebugMenuEnabled()) {
      console.log("after", args.targetController.state.open)
    }
  }

  const handlePointerEnter = (event: PointerEvent | MouseEvent) => {
    if (isDebugMenuEnabled()) {
      console.log("pointer enter", args.variant, args.targetController.id)
    }
    if (args.variant === "submenu" && args.parentBindings) {
      args.parentBindings.onPointerEnter?.(event)
    }
    args.pointer.onPointerEnter(event as PointerEvent)
  }

  const handlePointerLeave = (event: PointerEvent | MouseEvent) => {
    if (isDebugMenuEnabled()) {
      console.log("pointer leave", args.variant, args.targetController.id)
    }
    args.pointer.onPointerLeave(event as PointerEvent)
  }

  const handlePointerDown = (event: PointerEvent) => {
    if (!shouldHandleLongPress(event)) {
      clearLongPress()
      return
    }
    event.preventDefault()
    scheduleLongPress(event)
  }

  const handlePointerMove = (event: PointerEvent) => {
    if (!shouldHandleLongPress(event)) return
    cancelIfPointerMoved(event)
  }

  const handlePointerUp = (event: PointerEvent) => {
    if (shouldHandleLongPress(event)) {
      cancelIfPointerMoved(event)
    }
    clearLongPress()
  }

  const handlePointerCancel = () => {
    clearLongPress()
  }

  useEffect(() => {
    return () => {
      clearLongPress()
    }
  }, [])

  return {
    handleClick,
    handleContextMenu,
    handleKeydown,
    handlePointerEnter,
    handlePointerLeave,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  }
}
