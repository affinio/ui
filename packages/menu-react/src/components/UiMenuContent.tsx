import type { HTMLAttributes, PropsWithChildren } from "react"
import { useMenuProvider } from "../context"
import { UiMenuBaseContent } from "./UiMenuBaseContent"

interface UiMenuContentProps extends PropsWithChildren<HTMLAttributes<HTMLDivElement>> {
  teleportTo?: string
}

export function UiMenuContent({ teleportTo, className, children, ...rest }: UiMenuContentProps) {
  const provider = useMenuProvider()
  return (
    <UiMenuBaseContent
      provider={provider}
      variant="menu"
      teleportTo={teleportTo}
      className={className}
      {...rest}
    >
      {children}
    </UiMenuBaseContent>
  )
}
