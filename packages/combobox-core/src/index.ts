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
  if (input.context.disabled) {
    return input.state
  }

  const shouldExtend = input.context.mode === "multiple" ? input.extend : false
  const nextListbox = moveListboxFocus({
    state: input.state.listbox,
    context: input.context,
    delta: input.delta,
    extend: shouldExtend,
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
  if (input.context.disabled) {
    return input.state
  }

  const canToggleSelection = input.context.mode === "multiple"
  const nextListbox = activateListboxIndex({
    state: input.state.listbox,
    context: input.context,
    index: input.index,
    toggle: canToggleSelection ? input.toggle : false,
    extend: canToggleSelection ? input.extend : false,
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

export function getSelectedIndexCount(selection: LinearSelectionState): number {
  let total = 0
  for (const range of selection.ranges) {
    const normalized = normalizeSelectionRange(range)
    if (!normalized) {
      continue
    }
    const { start, end } = normalized
    total += end - start + 1
  }
  return Math.max(total, 0)
}

export function mapSelectedIndexes<T>(
  selection: LinearSelectionState,
  map: (index: number, position: number) => T,
): T[] {
  const total = getSelectedIndexCount(selection)
  if (total === 0) {
    return []
  }
  const mapped = new Array<T>(total)
  let cursor = 0
  for (const range of selection.ranges) {
    const normalized = normalizeSelectionRange(range)
    if (!normalized) {
      continue
    }
    const { start, end } = normalized
    for (let index = start; index <= end; index += 1) {
      mapped[cursor] = map(index, cursor)
      cursor += 1
    }
  }
  return cursor === mapped.length ? mapped : mapped.slice(0, cursor)
}

export function getSelectedIndexes(selection: LinearSelectionState): number[] {
  const total = getSelectedIndexCount(selection)
  if (total === 0) {
    return []
  }
  const indexes = new Array<number>(total)
  let cursor = 0
  for (const range of selection.ranges) {
    const normalized = normalizeSelectionRange(range)
    if (!normalized) {
      continue
    }
    const { start, end } = normalized
    for (let index = start; index <= end; index += 1) {
      indexes[cursor] = index
      cursor += 1
    }
  }
  return cursor === indexes.length ? indexes : indexes.slice(0, cursor)
}

export function isIndexSelected(selection: LinearSelectionState, index: number): boolean {
  if (!Number.isFinite(index)) {
    return false
  }
  const normalizedIndex = Math.trunc(index)
  return selection.ranges.some((range: LinearRange) => {
    const normalized = normalizeSelectionRange(range)
    if (!normalized) {
      return false
    }
    return normalizedIndex >= normalized.start && normalizedIndex <= normalized.end
  })
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

function normalizeSelectionRange(range: LinearRange): { start: number; end: number } | null {
  if (!Number.isFinite(range.start) || !Number.isFinite(range.end)) {
    return null
  }
  const normalizedStart = Math.trunc(range.start)
  const normalizedEnd = Math.trunc(range.end)
  return {
    start: Math.min(normalizedStart, normalizedEnd),
    end: Math.max(normalizedStart, normalizedEnd),
  }
}
