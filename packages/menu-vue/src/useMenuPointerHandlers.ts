import { onBeforeUnmount, watch } from "vue"
import type { ComputedRef } from "vue"
import type { PanelProps, PointerEventLike, PointerMeta, TriggerProps } from "@affino/menu-core"
import { toPointerPayload } from "./pointer"
import type { MenuProviderValue, SubmenuProviderValue } from "./context"

const isBrowser = typeof window !== "undefined"

interface TriggerFactoryOptions {
  bindings: ComputedRef<TriggerProps>
  bridge?: SubmenuProviderValue | null
}

interface PanelFactoryOptions {
  bindings: ComputedRef<PanelProps>
  bridge?: SubmenuProviderValue | null
}

const handlerCache = new WeakMap<MenuProviderValue, PointerHandlers>()

type PointerHandlers = {
  makeTriggerHandlers: (config: TriggerFactoryOptions) => {
    onPointerEnter: (event: PointerEvent) => void
    onPointerLeave: (event: PointerEvent) => void
  }
  makePanelHandlers: (config: PanelFactoryOptions) => {
    onPointerEnter: (event: PointerEvent) => void
    onPointerLeave: (event: PointerEvent) => void
  }
}

export function useMenuPointerHandlers(provider: MenuProviderValue): PointerHandlers {
  const cached = handlerCache.get(provider)
  if (cached) {
    return cached
  }

  const recordPointer = (event: PointerEvent, bridge?: SubmenuProviderValue | null) => {
    bridge?.child.controller.recordPointer?.({ x: event.clientX, y: event.clientY })
    provider.controller.recordPointer?.({ x: event.clientX, y: event.clientY })
  }

  const buildMeta = (event: PointerEvent): PointerMeta => {
    const related = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null
    if (!related) {
      return {
        isInsidePanel: false,
        enteredChildPanel: false,
        relatedTargetId: null,
      }
    }
    const relation = resolveMenuRelation(related)
    const isSameTree = relation.rootId === provider.rootId
    return {
      isInsidePanel: provider.controller.panelRef.value?.contains(related) ?? false,
      enteredChildPanel: isSameTree ? isDescendant(relation.menuId, provider) : false,
      relatedTargetId: related.id || null,
    }
  }

  const makeTriggerHandlers = ({ bindings, bridge }: TriggerFactoryOptions) => ({
    onPointerEnter: (event: PointerEvent) => {
      recordPointer(event, bridge)
      bindings.value.onPointerEnter?.(toPointerPayload(event))
    },
    onPointerLeave: (event: PointerEvent) => {
      recordPointer(event, bridge)
      bindings.value.onPointerLeave?.(toPointerPayload(event, buildMeta(event)))
    },
  })

  const makePanelHandlers = ({ bindings, bridge }: PanelFactoryOptions) => ({
    onPointerEnter: (event: PointerEvent) => {
      recordPointer(event, bridge)
      bindings.value.onPointerEnter?.(toPointerPayload(event))
    },
    onPointerLeave: (event: PointerEvent) => {
      recordPointer(event, bridge)
      bindings.value.onPointerLeave?.(toPointerPayload(event, buildMeta(event)))
    },
  })

  const handleDocumentPointerDown = (event: PointerEvent) => {
    if (!provider.controller.state.value.open) return
    if (isTargetWithinTree(event.target, provider.rootId)) return
    provider.controller.close("pointer")
  }

  if (isBrowser) {
    const stop = watch(
      () => provider.controller.state.value.open,
      (open) => {
        if (open) {
          window.addEventListener("pointerdown", handleDocumentPointerDown, true)
        } else {
          window.removeEventListener("pointerdown", handleDocumentPointerDown, true)
        }
      },
      { immediate: true }
    )

    onBeforeUnmount(() => {
      stop()
      window.removeEventListener("pointerdown", handleDocumentPointerDown, true)
    })
  }

  const api: PointerHandlers = {
    makeTriggerHandlers,
    makePanelHandlers,
  }

  handlerCache.set(provider, api)

  return api
}

function resolveMenuRelation(element: HTMLElement | null) {
  const panel = element?.closest<HTMLElement>("[data-ui-menu-panel='true']")
  if (panel) {
    return {
      menuId: panel.getAttribute("data-ui-menu-id"),
      rootId: panel.getAttribute("data-ui-root-menu-id"),
    }
  }
  const trigger = element?.closest<HTMLElement>("[data-ui-menu-trigger='true']")
  if (trigger) {
    return {
      menuId: trigger.getAttribute("data-ui-menu-id"),
      rootId: trigger.getAttribute("data-ui-root-menu-id"),
    }
  }
  return { menuId: null, rootId: null }
}

function isDescendant(menuId: string | null, provider: MenuProviderValue) {
  if (!menuId) return false
  const path = provider.tree.state.value.openPath
  const index = path.indexOf(provider.controller.id)
  if (index === -1) return false
  return path.slice(index + 1).includes(menuId)
}

function isTargetWithinTree(target: EventTarget | null, rootId: string) {
  if (!(target instanceof HTMLElement)) return false
  const relation = resolveMenuRelation(target)
  return relation.rootId === rootId
}
