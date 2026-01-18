import type { MenuCallbacks } from "../types"

export class MenuEvents {
  constructor(private readonly menuId: string, private readonly callbacks: MenuCallbacks = {}) {}

  emitSelect(itemId: string) {
    this.callbacks.onSelect?.(itemId, this.menuId)
  }

  emitHighlight(itemId: string | null) {
    this.callbacks.onHighlight?.(itemId, this.menuId)
  }
}
