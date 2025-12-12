import { inject, provide } from "vue"
import type { InjectionKey, ShallowRef } from "vue"
import type { MenuController } from "./useMenuController"
import { useMenuTreeState, type MenuTreeSnapshot } from "./useMenuTreeState"

export interface MenuProviderValue {
  controller: MenuController
  parentController: MenuController | null
  rootId: string
  submenuItemId?: string
  tree: {
    state: ShallowRef<MenuTreeSnapshot>
  }
  /** Direct reference to the parent provider for collapsing submenu plumbing. */
  parent?: MenuProviderValue | null
}

export interface SubmenuProviderValue {
  parent: MenuProviderValue
  child: MenuProviderValue
  parentSubmenu?: SubmenuProviderValue | null
}

const MENU_PROVIDER_KEY: InjectionKey<MenuProviderValue> = Symbol("ui-menu-provider")
const SUBMENU_PROVIDER_KEY: InjectionKey<SubmenuProviderValue> = Symbol("ui-submenu-provider")

interface ProvideMenuProviderArgs {
  controller: MenuController
  parentController?: MenuController | null
  parent?: MenuProviderValue | null
  rootId?: string
  submenuItemId?: string
}

/**
 * Registers the current menu scope, wiring it to the shared tree snapshot and exposing
 * convenience references to the parent/root providers.
 */
export function provideMenuProvider(value: ProvideMenuProviderArgs) {
  const parent = value.parent ?? null
  const controller = value.controller
  const resolvedParentController = value.parentController ?? parent?.controller ?? null
  const resolvedRootId = value.rootId ?? parent?.rootId ?? controller.id

  const scope: MenuProviderValue = {
    controller,
    parentController: resolvedParentController,
    rootId: resolvedRootId,
    submenuItemId: value.submenuItemId,
    parent,
    tree: {
      state: useMenuTreeState(controller),
    },
  }

  provide(MENU_PROVIDER_KEY, scope)
  return scope
}

export function useMenuProvider(): MenuProviderValue {
  const ctx = inject(MENU_PROVIDER_KEY)
  if (!ctx) {
    throw new Error("Menu components must be used inside <UiMenu>")
  }
  return ctx
}

interface ProvideSubmenuProviderArgs {
  parent: MenuProviderValue
  child: MenuProviderValue
  parentSubmenu?: SubmenuProviderValue | null
}

/** Links the current submenu with its parent so pointer prediction can walk the chain. */
export function provideSubmenuProvider(value: ProvideSubmenuProviderArgs) {
  const inherited = value.parentSubmenu ?? inject(SUBMENU_PROVIDER_KEY, null)
  const bridge: SubmenuProviderValue = { parent: value.parent, child: value.child, parentSubmenu: inherited }
  provide(SUBMENU_PROVIDER_KEY, bridge)
  return bridge
}

export function useSubmenuProvider(): SubmenuProviderValue {
  const ctx = inject(SUBMENU_PROVIDER_KEY)
  if (!ctx) {
    throw new Error("Submenu components must be nested inside <UiSubMenu>")
  }
  return ctx
}

export function useOptionalSubmenuProvider(): SubmenuProviderValue | null {
  return inject(SUBMENU_PROVIDER_KEY, null)
}

export type { MenuTreeSnapshot } from "./useMenuTreeState"
