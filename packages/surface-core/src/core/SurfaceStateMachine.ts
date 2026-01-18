import type { SurfaceState } from "../types"

export interface SurfaceStateChange {
  changed: boolean
  state: SurfaceState
}

export class SurfaceStateMachine {
  private state: SurfaceState

  constructor(initialOpen = false) {
    this.state = { open: initialOpen }
  }

  get snapshot(): SurfaceState {
    return { ...this.state }
  }

  open(): SurfaceStateChange {
    if (this.state.open) {
      return { changed: false, state: this.snapshot }
    }
    this.state = { open: true }
    return { changed: true, state: this.snapshot }
  }

  close(): SurfaceStateChange {
    if (!this.state.open) {
      return { changed: false, state: this.snapshot }
    }
    this.state = { open: false }
    return { changed: true, state: this.snapshot }
  }

  toggle(): SurfaceStateChange {
    return this.state.open ? this.close() : this.open()
  }
}
