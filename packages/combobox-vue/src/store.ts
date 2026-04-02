import {
  activateComboboxIndex,
  clearComboboxSelection,
  cloneListboxState,
  createComboboxState,
  moveComboboxFocus,
  setComboboxFilter,
  setComboboxOpen,
  type ComboboxContext,
  type ComboboxState,
} from "@affino/combobox-core"

export type ComboboxStoreListener = (state: ComboboxState) => void

export interface ComboboxStoreOptions {
  context: ComboboxContext
  initialState?: ComboboxState
}

export interface ComboboxStore {
  context: ComboboxContext
  getState(): ComboboxState
  peekState(): ComboboxState
  setState(state: ComboboxState): void
  applyResult(state: ComboboxState): void
  subscribe(listener: ComboboxStoreListener): () => void
  dispose(): void
  setContext(context: ComboboxContext): void
  setOpen(open: boolean): ComboboxState
  setFilter(filter: string): ComboboxState
  move(delta: number, options?: { extend?: boolean }): ComboboxState
  activate(index: number, options?: { extend?: boolean; toggle?: boolean }): ComboboxState
  clearSelection(): ComboboxState
}

function cloneComboboxState(state: ComboboxState): ComboboxState {
  return {
    open: state.open,
    filter: state.filter,
    listbox: cloneListboxState(state.listbox),
  }
}

function rangesEqual(
  left: ReadonlyArray<ComboboxState["listbox"]["selection"]["ranges"][number]>,
  right: ReadonlyArray<ComboboxState["listbox"]["selection"]["ranges"][number]>,
): boolean {
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

function comboboxStatesEqual(left: ComboboxState, right: ComboboxState): boolean {
  if (left === right) return true
  if (left.open !== right.open || left.filter !== right.filter) return false
  if (left.listbox.activeIndex !== right.listbox.activeIndex) return false
  if (left.listbox.selection.activeRangeIndex !== right.listbox.selection.activeRangeIndex) return false
  if (left.listbox.selection.anchor !== right.listbox.selection.anchor) return false
  if (left.listbox.selection.focus !== right.listbox.selection.focus) return false
  return rangesEqual(left.listbox.selection.ranges, right.listbox.selection.ranges)
}

export function createComboboxStore(options: ComboboxStoreOptions): ComboboxStore {
  if (!options?.context) {
    throw new Error("createComboboxStore requires a context with optionCount")
  }

  let current = options.initialState ? cloneComboboxState(options.initialState) : createComboboxState()
  let contextRef = options.context
  const listeners = new Set<ComboboxStoreListener>()
  let disposed = false

  function ensureActive() {
    if (disposed) {
      throw new Error("ComboboxStore has been disposed")
    }
  }

  function notify() {
    if (disposed) return
    const snapshot = cloneComboboxState(current)
    for (const listener of listeners) {
      listener(snapshot)
    }
  }

  const store: ComboboxStore = {
    context: contextRef,
    getState() {
      return cloneComboboxState(current)
    },
    peekState() {
      return current
    },
    setState(state) {
      ensureActive()
      if (comboboxStatesEqual(current, state)) return
      current = cloneComboboxState(state)
      notify()
    },
    applyResult(state) {
      ensureActive()
      if (comboboxStatesEqual(current, state)) return
      current = cloneComboboxState(state)
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
    setContext(context) {
      contextRef = context
      store.context = context
    },
    setOpen(open) {
      const next = setComboboxOpen(current, open)
      store.applyResult(next)
      return next
    },
    setFilter(filter) {
      const next = setComboboxFilter(current, filter)
      store.applyResult(next)
      return next
    },
    move(delta, options) {
      const next = moveComboboxFocus({
        state: current,
        context: contextRef,
        delta,
        extend: options?.extend,
      })
      store.applyResult(next)
      return next
    },
    activate(index, options) {
      const next = activateComboboxIndex({
        state: current,
        context: contextRef,
        index,
        extend: options?.extend,
        toggle: options?.toggle,
      })
      store.applyResult(next)
      return next
    },
    clearSelection() {
      const next = clearComboboxSelection(current)
      store.applyResult(next)
      return next
    },
  }

  return store
}