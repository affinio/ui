import { useCallback, useEffect, useMemo, useRef } from "react"
import type { PropsWithChildren, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from "react"
import type { MenuController } from "../useMenuController"
import { useMenuProvider, useOptionalSubmenuProvider } from "../context"
import { uid } from "../id"
import { AsChild } from "./AsChild"

const stopPropagationKeys = new Set(["ArrowDown", "ArrowUp", "Home", "End", "Enter", " ", "Space"])

interface UiMenuItemProps extends PropsWithChildren {
  id?: string
  disabled?: boolean
  danger?: boolean
  asChild?: boolean
  onSelect?: (payload: { id: string; controller: MenuController }) => void
}

export function UiMenuItem({ id, disabled, danger, asChild, onSelect, children }: UiMenuItemProps) {
  const provider = useMenuProvider()
  const submenuBridge = useOptionalSubmenuProvider()
  const itemId = useMemo(() => id ?? uid("ui-menu-item"), [id])
  const elementRef = useRef<HTMLElement | null>(null)
  const controller = provider.controller
  const core = controller.core

  useEffect(() => {
    const unregister = core.registerItem(itemId, { disabled })
    return () => {
      unregister?.()
    }
  }, [core, itemId, disabled])

  const bindings = core.getItemProps(itemId)
  const isDisabled = Boolean(bindings["aria-disabled"])

  useEffect(() => {
    if (controller.state.activeItemId === itemId && !isDisabled) {
      elementRef.current?.focus({ preventScroll: true })
    }
  }, [controller.state.activeItemId, itemId, isDisabled])

  const emitSelect = useCallback(() => {
    onSelect?.({ id: itemId, controller })
  }, [onSelect, itemId, controller])

  const handleClick = (event: ReactMouseEvent) => {
    if (isDisabled) {
      event.preventDefault()
      return
    }
    emitSelect()
    bindings.onClick?.(event.nativeEvent)
  }

  const handlePointerEnter = (event: ReactPointerEvent) => {
    bindings.onPointerEnter?.(event.nativeEvent)
  }

  const handleKeydown = (event: ReactKeyboardEvent) => {
    if (!isDisabled && (event.key === "Enter" || event.key === " " || event.key === "Space")) {
      emitSelect()
      bindings.onKeyDown?.(event.nativeEvent)
      event.preventDefault()
      return
    }
    if (submenuBridge && event.key === "ArrowLeft") {
      event.preventDefault()
      event.stopPropagation()
      submenuBridge.child.controller.close("keyboard")
      submenuBridge.parent.controller.highlight(submenuBridge.child.submenuItemId ?? null)
      submenuBridge.child.controller.triggerRef.current?.focus({ preventScroll: true })
      return
    }
    if (stopPropagationKeys.has(event.key)) {
      event.stopPropagation()
    }
    bindings.onKeyDown?.(event.nativeEvent)
  }

  const handleFocus = () => {
    elementRef.current?.scrollIntoView({ block: "nearest" })
  }

  const setElement = useCallback((node: HTMLElement | null) => {
    elementRef.current = node
  }, [])

  const itemProps = {
    className: ["ui-menu-item", danger ? "is-danger" : null].filter(Boolean).join(" ") || undefined,
    id: bindings.id ?? undefined,
    role: bindings.role,
    tabIndex: bindings.tabIndex ?? undefined,
    "data-state": bindings["data-state"],
    "aria-disabled": bindings["aria-disabled"],
    onFocus: handleFocus,
    onPointerEnter: handlePointerEnter,
    onClick: handleClick,
    onKeyDown: handleKeydown,
  }

  if (asChild) {
    return (
      <AsChild componentLabel="UiMenuItem" forwardedProps={{ ...itemProps, ref: setElement }}>
        {children}
      </AsChild>
    )
  }

  return (
    <div ref={setElement} {...itemProps}>
      {children}
    </div>
  )
}
