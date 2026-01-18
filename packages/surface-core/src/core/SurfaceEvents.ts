import type { PositionResult, SurfaceCallbacks } from "../types"

export class SurfaceEvents<C extends SurfaceCallbacks = SurfaceCallbacks> {
  constructor(private readonly surfaceId: string, private readonly callbacks: C = {} as C) {}

  emitOpen() {
    this.callbacks.onOpen?.(this.surfaceId)
  }

  emitClose() {
    this.callbacks.onClose?.(this.surfaceId)
  }

  emitPosition(position: PositionResult) {
    this.callbacks.onPositionChange?.(this.surfaceId, position)
  }
}
