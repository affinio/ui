import { useOptionalSubmenuProvider } from "./context"
import type { SubmenuProviderValue } from "./context"

export function useSubmenuBridge(variant: "menu" | "submenu"): SubmenuProviderValue | null {
  if (variant !== "submenu") {
    return null
  }
  const bridge = useOptionalSubmenuProvider()
  if (!bridge) {
    throw new Error("Submenu components must be rendered inside <UiSubMenu>")
  }
  return bridge
}
