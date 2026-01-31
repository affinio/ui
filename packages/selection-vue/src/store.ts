import { emptyLinearSelectionState, type LinearSelectionState } from "@affino/selection-core"

export type LinearSelectionStoreListener = (state: LinearSelectionState) => void

export interface LinearSelectionStoreOptions {
  initialState?: LinearSelectionState
}

export interface LinearSelectionStore {
  getState(): LinearSelectionState
  peekState(): LinearSelectionState
  setState(state: LinearSelectionState): void
  applyResult(state: LinearSelectionState): void
  subscribe(listener: LinearSelectionStoreListener): () => void
  dispose(): void
}

function cloneRanges(ranges: readonly LinearSelectionState["ranges"][number][]): LinearSelectionState["ranges"] {
  return ranges.map(range => ({ start: range.start, end: range.end }))
}

function cloneState(state: LinearSelectionState): LinearSelectionState {
  return {
    ranges: cloneRanges(state.ranges),
    activeRangeIndex: state.activeRangeIndex,
    anchor: state.anchor,
    focus: state.focus,
  }
}

function rangesEqual(left: readonly LinearSelectionState["ranges"][number][], right: readonly LinearSelectionState["ranges"][number][]) {
  if (left === right) return true
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index]
    const b = right[index]
    if (!a || !b) return false
    if (a.start !== b.start || a.end !== b.end) {
      return false
    }
  }
  return true
}

function statesEqual(a: LinearSelectionState, b: LinearSelectionState): boolean {
  if (a === b) return true
  if (a.activeRangeIndex !== b.activeRangeIndex) return false
  if (a.anchor !== b.anchor) return false
  if (a.focus !== b.focus) return false
  return rangesEqual(a.ranges, b.ranges)
}

export function createLinearSelectionStore(options: LinearSelectionStoreOptions = {}): LinearSelectionStore {
  let current = options.initialState ? cloneState(options.initialState) : emptyLinearSelectionState()
  const listeners = new Set<LinearSelectionStoreListener>()
  let disposed = false

  function ensureActive() {
    if (disposed) {
      throw new Error("LinearSelectionStore has been disposed")
    }
  }

  function notify() {
    if (disposed) return
    const snapshot = cloneState(current)
    for (const listener of listeners) {
      listener(snapshot)
    }
  }

  return {
    getState() {
      return cloneState(current)
    },
    peekState() {
      return current
    },
    setState(state) {
      ensureActive()
      if (statesEqual(current, state)) return
      current = cloneState(state)
      notify()
    },
    applyResult(state) {
      ensureActive()
      if (statesEqual(current, state)) return
      current = cloneState(state)
      notify()
    },
    subscribe(listener) {
      if (disposed) {
        return () => {}
      }
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      listeners.clear()
    },
  }
}
