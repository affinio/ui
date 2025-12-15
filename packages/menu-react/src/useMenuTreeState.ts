import { useEffect, useState } from "react"
import type { MenuController } from "./useMenuController"

export interface MenuTreeSnapshot {
  openPath: string[]
  activePath: string[]
}

export function useMenuTreeState(controller: MenuController): MenuTreeSnapshot {
  const [state, setState] = useState<MenuTreeSnapshot>({ openPath: [], activePath: [] })

  useEffect(() => {
    const tree = (controller.core as any)?.getTree?.()
    if (!tree?.subscribe) {
      return
    }
    const unsubscribe = tree.subscribe(controller.id, (snapshot: MenuTreeSnapshot) => {
      setState(snapshot)
    })
    return () => {
      unsubscribe?.()
    }
  }, [controller.core, controller.id])

  return state
}
