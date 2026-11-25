import { inject, provide } from "vue"
import type { InjectionKey, Ref } from "vue"
import type { MenuController } from "./useMenuController"

export interface MenuBarContextValue {
  readonly activeMenuId: Readonly<Ref<string | null>>
  register: (controller: MenuController) => () => void
  open: (controller: MenuController, reason?: "pointer" | "keyboard" | "programmatic", preserveFocus?: boolean) => void
  toggle: (controller: MenuController) => void
  close: (controller: MenuController, reason?: "pointer" | "keyboard" | "programmatic") => void
  pointerEnter: (controller: MenuController, event: PointerEvent) => void
  focus: (controller: MenuController) => void
  pointerLeave: (event: PointerEvent) => void
  moveFocus: (controller: MenuController, direction: -1 | 1 | "first" | "last") => void
  shouldFocusPanel: (controller: MenuController) => boolean
  tabIndex: (controller: MenuController) => 0 | -1
}

const MENU_BAR_KEY: InjectionKey<MenuBarContextValue> = Symbol("ui-menu-bar")

export function provideMenuBar(value: MenuBarContextValue): void {
  provide(MENU_BAR_KEY, value)
}

export function useOptionalMenuBar(): MenuBarContextValue | null {
  return inject(MENU_BAR_KEY, null)
}
