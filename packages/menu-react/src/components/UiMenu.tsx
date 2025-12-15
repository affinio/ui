import type { PropsWithChildren } from "react"
import type { MenuCallbacks, MenuOptions } from "@affino/menu-core"
import { MenuProvider, useMenuProviderValue } from "../context"
import { useMenuController } from "../useMenuController"

interface UiMenuProps extends PropsWithChildren {
  options?: MenuOptions
  callbacks?: MenuCallbacks
}

export function UiMenu({ options, callbacks, children }: UiMenuProps) {
  const controller = useMenuController({ kind: "root", options, callbacks })
  const provider = useMenuProviderValue({ controller })
  return (
    <MenuProvider value={provider}>
      <div className="ui-menu">{children}</div>
    </MenuProvider>
  )
}
