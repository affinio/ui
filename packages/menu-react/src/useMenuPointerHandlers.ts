import { useEffect, useMemo } from "react"
import type { PanelProps, PointerMeta, TriggerProps } from "@affino/menu-core"
import { toPointerPayload } from "./pointer"
import type { MenuProviderValue, SubmenuProviderValue } from "./context"

const isBrowser = typeof window !== "undefined"

type TriggerFactoryOptions = {
  bindings: TriggerProps
  bridge?: SubmenuProviderValue | null
}

type PanelFactoryOptions = {
  bindings: PanelProps
  bridge?: SubmenuProviderValue | null
}

export type PointerHandlers = {
  makeTriggerHandlers: (config: TriggerFactoryOptions) => {
    onPointerEnter: (event: PointerEvent | MouseEvent) => void
    onPointerLeave: (event: PointerEvent | MouseEvent) => void
  }
  makePanelHandlers: (config: PanelFactoryOptions) => {
    onPointerEnter: (event: PointerEvent | MouseEvent) => void
    onPointerLeave: (event: PointerEvent | MouseEvent) => void
  }
}

export function useMenuPointerHandlers(provider: MenuProviderValue): PointerHandlers {
  useEffect(() => {
    if (!isBrowser) {
      return
    }

    if (!provider.controller.state.open) {
      return
    }

    const handleDocumentPointerDown = (event: PointerEvent) => {
      if (!provider.controller.state.open) return
      if (isTargetWithinTree(event.target, provider.rootId)) return
      provider.controller.close("pointer")
    }

    window.addEventListener("pointerdown", handleDocumentPointerDown, true)

    return () => {
      window.removeEventListener("pointerdown", handleDocumentPointerDown, true)
    }
  }, [provider.controller, provider.controller.state.open, provider.rootId])

  return useMemo(() => {
    const recordPointer = (event: PointerEvent | MouseEvent, bridge?: SubmenuProviderValue | null) => {
      bridge?.child.controller.recordPointer?.({ x: event.clientX, y: event.clientY })
      provider.controller.recordPointer?.({ x: event.clientX, y: event.clientY })
    }

    const buildMeta = (event: PointerEvent | MouseEvent): PointerMeta => {
      const related = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null
      if (!related) {
        return {
          isInsidePanel: false,
          enteredChildPanel: false,
          relatedTargetId: null,
          isWithinTree: false,
          relatedMenuId: null,
        }
      }
      const relation = resolveMenuRelation(related)
      const isSameTree = relation.rootId === provider.rootId
      const relatedMenuId = relation.kind === "trigger"
        ? relation.parentMenuId ?? relation.menuId
        : relation.menuId
      return {
        isInsidePanel: provider.controller.panelRef.current?.contains(related) ?? false,
        enteredChildPanel: isSameTree ? isDescendant(relation.menuId, provider) : false,
        relatedTargetId: related.id || null,
        isWithinTree: isSameTree,
        relatedMenuId,
      }
    }

    const makeTriggerHandlers = ({ bindings, bridge }: TriggerFactoryOptions) => ({
      onPointerEnter: (event: PointerEvent | MouseEvent) => {
        recordPointer(event, bridge)
        bindings.onPointerEnter?.(toPointerPayload(event))
      },
      onPointerLeave: (event: PointerEvent | MouseEvent) => {
        recordPointer(event, bridge)
        bindings.onPointerLeave?.(toPointerPayload(event, buildMeta(event)))
      },
    })

    const makePanelHandlers = ({ bindings, bridge }: PanelFactoryOptions) => ({
      onPointerEnter: (event: PointerEvent | MouseEvent) => {
        recordPointer(event, bridge)
        bindings.onPointerEnter?.(toPointerPayload(event))
      },
      onPointerLeave: (event: PointerEvent | MouseEvent) => {
        recordPointer(event, bridge)
        bindings.onPointerLeave?.(toPointerPayload(event, buildMeta(event)))
      },
    })

    return {
      makeTriggerHandlers,
      makePanelHandlers,
    }
  }, [provider])
}

type RelationKind = "panel" | "trigger" | null

function resolveMenuRelation(element: HTMLElement | null) {
  const panel = element?.closest<HTMLElement>("[data-ui-menu-panel='true']")
  if (panel) {
    return {
      kind: "panel" as RelationKind,
      menuId: panel.getAttribute("data-ui-menu-id"),
      rootId: panel.getAttribute("data-ui-root-menu-id"),
      parentMenuId: panel.getAttribute("data-ui-parent-menu-id"),
    }
  }
  const trigger = element?.closest<HTMLElement>("[data-ui-menu-trigger='true']")
  if (trigger) {
    return {
      kind: "trigger" as RelationKind,
      menuId: trigger.getAttribute("data-ui-menu-id"),
      rootId: trigger.getAttribute("data-ui-root-menu-id"),
      parentMenuId: trigger.getAttribute("data-ui-parent-menu-id"),
    }
  }
  return { kind: null as RelationKind, menuId: null, rootId: null, parentMenuId: null }
}

function isDescendant(menuId: string | null, provider: MenuProviderValue) {
  if (!menuId) return false
  const path = provider.tree.state.openPath
  const index = path.indexOf(provider.controller.id)
  if (index === -1) return false
  return path.slice(index + 1).includes(menuId)
}

function isTargetWithinTree(target: EventTarget | null, rootId: string) {
  if (!(target instanceof HTMLElement)) return false
  const relation = resolveMenuRelation(target)
  return relation.rootId === rootId
}
