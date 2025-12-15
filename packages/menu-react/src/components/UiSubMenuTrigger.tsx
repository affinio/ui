import type { PropsWithChildren } from "react"
import { useMenuProvider } from "../context"
import { UiMenuBaseTrigger } from "./UiMenuBaseTrigger"

interface UiSubMenuTriggerProps extends PropsWithChildren {
  asChild?: boolean
}

export function UiSubMenuTrigger({ asChild, children }: UiSubMenuTriggerProps) {
  const provider = useMenuProvider()
  return (
    <UiMenuBaseTrigger
      provider={provider}
      variant="submenu"
      asChild={asChild}
      componentLabel="UiSubMenuTrigger"
      showArrow
    >
      {children}
    </UiMenuBaseTrigger>
  )
}
