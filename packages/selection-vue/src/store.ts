import {
  activateListboxIndex,
  clearListboxSelection,
  createListboxState,
  moveListboxFocus,
  selectAllListboxOptions,
  toggleActiveListboxOption,
  type ListboxContext,
  type ListboxState,
} from "@affino/listbox-core"
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

function cloneLinearRanges(ranges: readonly LinearSelectionState["ranges"][number][]): LinearSelectionState["ranges"] {
  return ranges.map(range => ({ start: range.start, end: range.end }))
}

function cloneLinearState(state: LinearSelectionState): LinearSelectionState {
  return {
    ranges: cloneLinearRanges(state.ranges),
    activeRangeIndex: state.activeRangeIndex,
    anchor: state.anchor,
    focus: state.focus,
  }
}

function linearRangesEqual(left: readonly LinearSelectionState["ranges"][number][], right: readonly LinearSelectionState["ranges"][number][]) {
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

function linearStatesEqual(a: LinearSelectionState, b: LinearSelectionState): boolean {
  if (a === b) return true
  if (a.activeRangeIndex !== b.activeRangeIndex) return false
  if (a.anchor !== b.anchor) return false
  if (a.focus !== b.focus) return false
  return linearRangesEqual(a.ranges, b.ranges)
}

export function createLinearSelectionStore(options: LinearSelectionStoreOptions = {}): LinearSelectionStore {
  let current = options.initialState ? cloneLinearState(options.initialState) : emptyLinearSelectionState()
  const listeners = new Set<LinearSelectionStoreListener>()
  let disposed = false

  function ensureActive() {
    if (disposed) {
      throw new Error("LinearSelectionStore has been disposed")
    }
  }

  function notify() {
    if (disposed) return
    const snapshot = cloneLinearState(current)
    for (const listener of listeners) {
      listener(snapshot)
    }
  }

  return {
    getState() {
      return cloneLinearState(current)
    },
    peekState() {
      return current
    },
    setState(state) {
      ensureActive()
      if (linearStatesEqual(current, state)) return
      current = cloneLinearState(state)
      notify()
    },
    applyResult(state) {
      ensureActive()
      if (linearStatesEqual(current, state)) return
      current = cloneLinearState(state)
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

export type ListboxStoreListener = (state: ListboxState) => void

export interface ListboxStoreOptions {
  context: ListboxContext
  initialState?: ListboxState
}

export interface ListboxStore {
  context: ListboxContext
  getState(): ListboxState
  peekState(): ListboxState
  setState(state: ListboxState): void
  applyResult(state: ListboxState): void
  subscribe(listener: ListboxStoreListener): () => void
  dispose(): void
  setContext(context: ListboxContext): void
  activate(index: number, options?: { extend?: boolean; toggle?: boolean }): ListboxState
  move(delta: number, options?: { extend?: boolean; loop?: boolean }): ListboxState
  toggleActiveOption(): ListboxState
  clearSelection(options?: { preserveActiveIndex?: boolean }): ListboxState
  selectAll(): ListboxState
}

function cloneListboxState(state: ListboxState): ListboxState {
  return {
    activeIndex: state.activeIndex,
    selection: cloneLinearState(state.selection),
  }
}

function listboxStatesEqual(a: ListboxState, b: ListboxState): boolean {
  if (a === b) return true
  return a.activeIndex === b.activeIndex && linearStatesEqual(a.selection, b.selection)
}

export function createListboxStore(options: ListboxStoreOptions): ListboxStore {
  if (!options?.context) {
    throw new Error("createListboxStore requires a context with optionCount")
  }

  let current = options.initialState ? cloneListboxState(options.initialState) : createListboxState()
  let contextRef = options.context
  const listeners = new Set<ListboxStoreListener>()
  let disposed = false

  function ensureActive() {
    if (disposed) {
      throw new Error("ListboxStore has been disposed")
    }
  }

  function notify() {
    if (disposed) return
    const snapshot = cloneListboxState(current)
    for (const listener of listeners) {
      listener(snapshot)
    }
  }

  const store: ListboxStore = {
    context: contextRef,
    getState() {
      return cloneListboxState(current)
    },
    peekState() {
      return current
    },
    setState(state) {
      ensureActive()
      if (listboxStatesEqual(current, state)) return
      current = cloneListboxState(state)
      notify()
    },
    applyResult(state) {
      ensureActive()
      if (listboxStatesEqual(current, state)) return
      current = cloneListboxState(state)
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
    setContext(nextContext) {
      contextRef = nextContext
      store.context = nextContext
    },
    activate(index, options) {
      const next = activateListboxIndex({
        state: current,
        context: contextRef,
        index,
        extend: options?.extend,
        toggle: options?.toggle,
      })
      store.applyResult(next)
      return next
    },
    move(delta, options) {
      const next = moveListboxFocus({
        state: current,
        context: contextRef,
        delta,
        extend: options?.extend,
        loop: options?.loop,
      })
      store.applyResult(next)
      return next
    },
    toggleActiveOption() {
      const next = toggleActiveListboxOption({ state: current })
      store.applyResult(next)
      return next
    },
    clearSelection(options) {
      const next = clearListboxSelection({
        state: current,
        preserveActiveIndex: options?.preserveActiveIndex,
      })
      store.applyResult(next)
      return next
    },
    selectAll() {
      const next = selectAllListboxOptions({ context: contextRef })
      store.applyResult(next)
      return next
    },
  }

  return store
}
