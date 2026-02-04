import {
  activateListboxIndex,
  createListboxState,
  moveListboxFocus,
  type ListboxContext,
  type ListboxState,
} from "@affino/listbox-core"
import type { LinearRange, LinearSelectionState } from "@affino/selection-core"

export type ComboboxMode = "single" | "multiple"

export interface ComboboxContext extends ListboxContext {
  mode: ComboboxMode
  loop: boolean
  disabled: boolean
}

export interface ComboboxState {
  open: boolean
  filter: string
  listbox: ListboxState
}

export function createComboboxState(initial?: Partial<ComboboxState>): ComboboxState {
  return {
    open: initial?.open ?? false,
    filter: initial?.filter ?? "",
    listbox: initial?.listbox ? cloneListboxState(initial.listbox) : createListboxState(),
  }
}

export function setComboboxOpen(state: ComboboxState, open: boolean): ComboboxState {
  if (state.open === open) {
    return state
  }
  return {
    ...state,
    open,
  }
}

export function setComboboxFilter(state: ComboboxState, filter: string): ComboboxState {
  if (state.filter === filter) {
    return state
  }
  return {
    ...state,
    filter,
  }
}

export interface MoveComboboxFocusInput {
  state: ComboboxState
  context: ComboboxContext
  delta: number
  extend?: boolean
}

export function moveComboboxFocus(input: MoveComboboxFocusInput): ComboboxState {
  const nextListbox = moveListboxFocus({
    state: input.state.listbox,
    context: input.context,
    delta: input.delta,
    extend: input.extend,
    loop: input.context.loop,
  })
  if (nextListbox === input.state.listbox) {
    return input.state
  }
  return {
    ...input.state,
    listbox: cloneListboxState(nextListbox),
  }
}

export interface ActivateComboboxIndexInput {
  state: ComboboxState
  context: ComboboxContext
  index: number
  toggle?: boolean
  extend?: boolean
}

export function activateComboboxIndex(input: ActivateComboboxIndexInput): ComboboxState {
  const nextListbox = activateListboxIndex({
    state: input.state.listbox,
    context: input.context,
    index: input.index,
    toggle: input.toggle,
    extend: input.extend,
  })
  if (nextListbox === input.state.listbox) {
    return input.state
  }
  return {
    ...input.state,
    listbox: cloneListboxState(nextListbox),
  }
}

/**
 * Resets ranges + filter text but intentionally leaves `state.open` alone so adapters
 * can decide whether the surface should stay visible or close themselves afterwards.
 */
export function clearComboboxSelection(state: ComboboxState): ComboboxState {
  return {
    ...state,
    filter: "",
    listbox: createListboxState(),
  }
}

export function getSelectedIndexes(selection: LinearSelectionState): number[] {
  const indexes: number[] = []
  for (const range of selection.ranges) {
    for (let index = range.start; index <= range.end; index += 1) {
      indexes.push(index)
    }
  }
  return indexes
}

export function isIndexSelected(selection: LinearSelectionState, index: number): boolean {
  return selection.ranges.some((range: LinearRange) => index >= range.start && index <= range.end)
}

export function cloneListboxState(state: ListboxState): ListboxState {
  return {
    activeIndex: state.activeIndex,
    selection: {
      ranges: state.selection.ranges.map((range: LinearRange) => ({ start: range.start, end: range.end })),
      activeRangeIndex: state.selection.activeRangeIndex,
      anchor: state.selection.anchor,
      focus: state.selection.focus,
    },
  }
}
