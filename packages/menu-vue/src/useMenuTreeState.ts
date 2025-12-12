import { onBeforeUnmount, shallowRef } from "vue"
import type { ShallowRef } from "vue"
import type { MenuController } from "./useMenuController"

export interface MenuTreeSnapshot {
  openPath: string[]
  activePath: string[]
}

/**
 * Subscribes the given controller to the shared MenuTree so that every menu scope
 * has a reactive view of the currently open and highlighted branches.
 */
export function useMenuTreeState(controller: MenuController): ShallowRef<MenuTreeSnapshot> {
  const state = shallowRef<MenuTreeSnapshot>({ openPath: [], activePath: [] })
  const tree = (controller.core as any)?.getTree?.()
  let unsubscribe: (() => void) | null = null

  if (tree?.subscribe) {
    unsubscribe = tree.subscribe(controller.id, (snapshot: MenuTreeSnapshot) => {
      state.value = snapshot
    })
  }

  onBeforeUnmount(() => {
    unsubscribe?.()
    unsubscribe = null
  })

  return state
}
