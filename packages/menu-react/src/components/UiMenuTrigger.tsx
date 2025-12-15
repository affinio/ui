import type { PropsWithChildren } from "react"
import { useMenuProvider } from "../context"
import { UiMenuBaseTrigger } from "./UiMenuBaseTrigger"

type TriggerMode = "click" | "contextmenu" | "both"

interface UiMenuTriggerProps extends PropsWithChildren {
  asChild?: boolean
  trigger?: TriggerMode
}

export function UiMenuTrigger({ asChild, trigger, children }: UiMenuTriggerProps) {
  const provider = useMenuProvider()
  return (
    <UiMenuBaseTrigger
      provider={provider}
      variant="menu"
      asChild={asChild}
      triggerMode={trigger}
      componentLabel="UiMenuTrigger"
    >
      {children}
    </UiMenuBaseTrigger>
  )
}
