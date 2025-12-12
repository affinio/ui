import type { MenuCallbacks, PositionResult } from "../Types"

/**
 * Thin facade over the public callback bag that guarantees consistent ordering of emitted
 * events. MenuCore funnels every observable side-effect through this helper so that user code
 * can rely on deterministic sequences.
 */
export class MenuEvents {
  constructor(private readonly menuId: string, private readonly callbacks: MenuCallbacks = {}) {}

  emitOpen() {
    this.callbacks.onOpen?.(this.menuId)
  }

  emitClose() {
    this.callbacks.onClose?.(this.menuId)
  }

  emitSelect(itemId: string) {
    this.callbacks.onSelect?.(itemId, this.menuId)
  }

  emitHighlight(itemId: string | null) {
    this.callbacks.onHighlight?.(itemId, this.menuId)
  }

  emitPosition(position: PositionResult) {
    this.callbacks.onPositionChange?.(this.menuId, position)
  }
}
