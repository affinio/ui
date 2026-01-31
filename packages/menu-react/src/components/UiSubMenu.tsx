import { useMemo } from "react"
import type { PropsWithChildren } from "react"
import type { MenuCallbacks, MenuOptions } from "@affino/menu-core"
import { useMenuProvider, MenuProvider, useMenuProviderValue, SubmenuProvider, useSubmenuProviderValue } from "../context"
import { useMenuController } from "../useMenuController"
import { uid } from "../id"
import { usePointerRecorder } from "../usePointerRecorder"

interface UiSubMenuProps extends PropsWithChildren {
  id?: string
  options?: MenuOptions
  callbacks?: MenuCallbacks
}

export function UiSubMenu({ id, options, callbacks, children }: UiSubMenuProps) {
  const parentProvider = useMenuProvider()
  const submenuItemId = useMemo(() => id ?? uid("ui-submenu-item"), [id])
  const controller = useMenuController({
    kind: "submenu",
    parent: parentProvider.controller,
    parentItemId: submenuItemId,
    options,
    callbacks,
  })
  const childProvider = useMenuProviderValue({ controller, parent: parentProvider, submenuItemId })
  const submenuBridge = useSubmenuProviderValue({ parent: parentProvider, child: childProvider })
  usePointerRecorder(controller.recordPointer)

  return (
    <MenuProvider value={childProvider}>
      <SubmenuProvider value={submenuBridge}>{children}</SubmenuProvider>
    </MenuProvider>
  )
}
