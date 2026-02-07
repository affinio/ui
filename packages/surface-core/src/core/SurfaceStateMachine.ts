import type { SurfaceState } from "../types"

export interface SurfaceStateChange {
  changed: boolean
  state: SurfaceState
}

export class SurfaceStateMachine {
  private state: SurfaceState
  private snapshotState: SurfaceState

  constructor(initialOpen = false) {
    this.state = { open: initialOpen }
    this.snapshotState = createSnapshot(this.state)
  }

  get snapshot(): SurfaceState {
    return this.snapshotState
  }

  open(): SurfaceStateChange {
    if (this.state.open) {
      return { changed: false, state: this.snapshotState }
    }
    this.state = { open: true }
    this.snapshotState = createSnapshot(this.state)
    return { changed: true, state: this.snapshotState }
  }

  close(): SurfaceStateChange {
    if (!this.state.open) {
      return { changed: false, state: this.snapshotState }
    }
    this.state = { open: false }
    this.snapshotState = createSnapshot(this.state)
    return { changed: true, state: this.snapshotState }
  }

  toggle(): SurfaceStateChange {
    return this.state.open ? this.close() : this.open()
  }
}

function createSnapshot(state: SurfaceState): SurfaceState {
  return Object.freeze({ ...state }) as SurfaceState
}
