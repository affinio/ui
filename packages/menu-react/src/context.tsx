import { createContext, useContext, useMemo } from "react"
import type { PropsWithChildren } from "react"
import type { MenuController } from "./useMenuController"
import { useMenuTreeState, type MenuTreeSnapshot } from "./useMenuTreeState"

export interface MenuProviderValue {
  controller: MenuController
  parentController: MenuController | null
  rootId: string
  submenuItemId?: string
  tree: {
    state: MenuTreeSnapshot
  }
  parent?: MenuProviderValue | null
}

export interface SubmenuProviderValue {
  parent: MenuProviderValue
  child: MenuProviderValue
  parentSubmenu?: SubmenuProviderValue | null
}

export const MenuProviderContext = createContext<MenuProviderValue | null>(null)
export const SubmenuProviderContext = createContext<SubmenuProviderValue | null>(null)

interface ProvideMenuProviderArgs {
  controller: MenuController
  parentController?: MenuController | null
  parent?: MenuProviderValue | null
  rootId?: string
  submenuItemId?: string
}

export function useMenuProviderValue(args: ProvideMenuProviderArgs): MenuProviderValue {
  const parent = args.parent ?? null
  const controller = args.controller
  const resolvedParentController = args.parentController ?? parent?.controller ?? null
  const resolvedRootId = args.rootId ?? parent?.rootId ?? controller.id
  const treeState = useMenuTreeState(controller)

  return useMemo(
    () => ({
      controller,
      parentController: resolvedParentController,
      rootId: resolvedRootId,
      submenuItemId: args.submenuItemId,
      parent,
      tree: { state: treeState },
    }),
    [controller, resolvedParentController, resolvedRootId, args.submenuItemId, parent, treeState]
  )
}

interface ProvideSubmenuProviderArgs {
  parent: MenuProviderValue
  child: MenuProviderValue
  parentSubmenu?: SubmenuProviderValue | null
}

export function useSubmenuProviderValue(args: ProvideSubmenuProviderArgs): SubmenuProviderValue {
  const inherited = args.parentSubmenu ?? useOptionalSubmenuProvider()
  return useMemo(
    () => ({ parent: args.parent, child: args.child, parentSubmenu: inherited ?? null }),
    [args.parent, args.child, inherited]
  )
}

export function MenuProvider({ value, children }: PropsWithChildren<{ value: MenuProviderValue }>) {
  return <MenuProviderContext.Provider value={value}>{children}</MenuProviderContext.Provider>
}

export function SubmenuProvider({ value, children }: PropsWithChildren<{ value: SubmenuProviderValue }>) {
  return <SubmenuProviderContext.Provider value={value}>{children}</SubmenuProviderContext.Provider>
}

export function useMenuProvider(): MenuProviderValue {
  const ctx = useContext(MenuProviderContext)
  if (!ctx) {
    throw new Error("Menu components must be rendered inside <UiMenu>")
  }
  return ctx
}

export function useOptionalMenuProvider(): MenuProviderValue | null {
  return useContext(MenuProviderContext)
}

export function useSubmenuProvider(): SubmenuProviderValue {
  const ctx = useContext(SubmenuProviderContext)
  if (!ctx) {
    throw new Error("Submenu components must be rendered inside <UiSubMenu>")
  }
  return ctx
}

export function useOptionalSubmenuProvider(): SubmenuProviderValue | null {
  return useContext(SubmenuProviderContext)
}

export type { MenuTreeSnapshot }
