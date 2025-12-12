import type { MenuCallbacks, MenuOptions, SubmenuCore } from "@affino/menu-core"
import type { MenuController as CoreCompatibleController } from "./useMenuController"
import { useMenuController } from "./useMenuController"

export type { MenuController } from "./useMenuController"

export function useMenu(options?: MenuOptions, callbacks?: MenuCallbacks) {
  const controller = useMenuController({ kind: "root", options, callbacks })
  return { core: controller.core, state: controller.state, controller }
}

export function createSubmenuController(
  parent: CoreCompatibleController | CoreCompatibleController["core"],
  options: { parentItemId: string } & MenuOptions,
  callbacks?: MenuCallbacks
) {
  const controller = useMenuController({
    kind: "submenu",
    parent,
    parentItemId: options.parentItemId,
    options,
    callbacks,
  })
  return { core: controller.core as SubmenuCore, state: controller.state, dispose: controller.dispose, controller }
}
