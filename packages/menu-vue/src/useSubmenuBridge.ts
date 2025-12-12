import { useOptionalSubmenuProvider } from "./context"
import type { SubmenuProviderValue } from "./context"

/**
 * Returns the current submenu bridge when the consuming component is rendered within
 * a <UiSubMenu>. Throws a descriptive error when the component expects a submenu
 * context but none is found.
 */
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
