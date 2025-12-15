import type { PropsWithChildren } from "react"

export function UiMenuLabel({ children }: PropsWithChildren) {
  return <div className="ui-menu-label" role="presentation">{children}</div>
}
