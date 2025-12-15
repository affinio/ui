import type { HTMLAttributes, PropsWithChildren } from "react"
import { useMenuProvider } from "../context"
import { UiMenuBaseContent } from "./UiMenuBaseContent"

interface UiSubMenuContentProps extends PropsWithChildren<HTMLAttributes<HTMLDivElement>> {
  teleportTo?: string
}

export function UiSubMenuContent({ teleportTo, className, children, ...rest }: UiSubMenuContentProps) {
  const provider = useMenuProvider()
  return (
    <UiMenuBaseContent
      provider={provider}
      variant="submenu"
      teleportTo={teleportTo}
      className={className}
      {...rest}
    >
      {children}
    </UiMenuBaseContent>
  )
}
