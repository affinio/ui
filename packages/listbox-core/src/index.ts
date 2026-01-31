import {
  clearLinearSelection,
  emptyLinearSelectionState,
  extendLinearSelectionToIndex,
  selectLinearIndex,
  toggleLinearIndex,
  type LinearSelectionState,
} from "@affino/selection-core"

export interface ListboxContext {
  optionCount: number
  isDisabled?(index: number): boolean
}

export interface ListboxState {
  selection: LinearSelectionState
  activeIndex: number
}

export function createListboxState(initial?: Partial<ListboxState>): ListboxState {
  return {
    selection: initial?.selection ?? emptyLinearSelectionState(),
    activeIndex: initial?.activeIndex ?? -1,
  }
}

export interface MoveListboxFocusInput {
  state: ListboxState
  context: ListboxContext
  delta: number
  extend?: boolean
  loop?: boolean
}

export function moveListboxFocus(input: MoveListboxFocusInput): ListboxState {
  const nextIndex = resolveTargetIndex(input.state.activeIndex, input.delta, input.context, input.loop ?? false)
  if (nextIndex === -1 || nextIndex === input.state.activeIndex) {
    return input.state
  }
  return activateListboxIndex({
    state: input.state,
    context: input.context,
    index: nextIndex,
    extend: input.extend,
  })
}

export interface ActivateListboxIndexInput {
  state: ListboxState
  context: ListboxContext
  index: number
  extend?: boolean
  toggle?: boolean
}

export function activateListboxIndex(input: ActivateListboxIndexInput): ListboxState {
  const count = input.context.optionCount
  if (count <= 0) {
    return createListboxState()
  }

  const index = clampIndex(input.index, count)
  if (index === -1) {
    return input.state
  }

  if (isIndexDisabled(input.context, index)) {
    return {
      selection: input.state.selection,
      activeIndex: index,
    }
  }

  let selection: LinearSelectionState
  if (input.toggle) {
    selection = toggleLinearIndex({ state: input.state.selection, index })
  } else if (input.extend) {
    selection = extendLinearSelectionToIndex({ state: input.state.selection, index })
  } else {
    selection = selectLinearIndex({ index })
  }

  return {
    selection,
    activeIndex: index,
  }
}

export interface ToggleActiveOptionInput {
  state: ListboxState
}

export function toggleActiveListboxOption(input: ToggleActiveOptionInput): ListboxState {
  const index = input.state.activeIndex
  if (index < 0) {
    return input.state
  }
  return {
    activeIndex: index,
    selection: toggleLinearIndex({ state: input.state.selection, index }),
  }
}

export interface ClearListboxSelectionInput {
  preserveActiveIndex?: boolean
  state?: ListboxState
}

export function clearListboxSelection(input: ClearListboxSelectionInput = {}): ListboxState {
  const nextState = createListboxState()
  if (input.preserveActiveIndex && input.state) {
    nextState.activeIndex = input.state.activeIndex
  }
  return nextState
}

export interface SelectAllListboxOptionsInput {
  context: ListboxContext
}

export function selectAllListboxOptions(input: SelectAllListboxOptionsInput): ListboxState {
  const first = findEdgeIndex(input.context, +1)
  if (first === -1) {
    return createListboxState()
  }
  const last = findEdgeIndex(input.context, -1)
  let selection = selectLinearIndex({ index: first })
  selection = extendLinearSelectionToIndex({ state: selection, index: last })
  return {
    selection,
    activeIndex: last,
  }
}

function isIndexDisabled(context: ListboxContext, index: number): boolean {
  return context.isDisabled?.(index) ?? false
}

function clampIndex(index: number, count: number): number {
  if (count <= 0) return -1
  if (!Number.isFinite(index)) {
    return index > 0 ? count - 1 : 0
  }
  const next = Math.trunc(index)
  if (next < 0) return 0
  if (next >= count) return count - 1
  return next
}

function resolveTargetIndex(
  currentIndex: number,
  delta: number,
  context: ListboxContext,
  loop: boolean,
): number {
  const count = context.optionCount
  if (count <= 0) {
    return -1
  }
  if (delta === 0 && currentIndex >= 0 && currentIndex < count && !isIndexDisabled(context, currentIndex)) {
    return currentIndex
  }
  if (!Number.isFinite(delta)) {
    return findEdgeIndex(context, delta > 0 ? 1 : -1)
  }
  const direction = delta > 0 ? 1 : -1
  let steps = Math.abs(Math.trunc(delta))
  let cursor = currentIndex
  if (cursor < 0 || cursor >= count) {
    cursor = direction > 0 ? -1 : count
  }
  while (steps > 0) {
    const nextIndex = advance(cursor, direction, context, loop)
    if (nextIndex === cursor) {
      break
    }
    cursor = nextIndex
    steps -= 1
  }
  if (cursor === -1) {
    return findEdgeIndex(context, direction)
  }
  return cursor
}

function advance(
  start: number,
  direction: 1 | -1,
  context: ListboxContext,
  loop: boolean,
): number {
  const count = context.optionCount
  if (count <= 0) return -1
  let next = start
  let visited = 0
  while (visited < count) {
    next += direction
    if (next < 0 || next >= count) {
      if (!loop) {
        return start
      }
      next = ((next % count) + count) % count
    }
    if (!isIndexDisabled(context, next)) {
      return next
    }
    visited += 1
  }
  return start
}

function findEdgeIndex(context: ListboxContext, direction: 1 | -1): number {
  const count = context.optionCount
  if (count <= 0) {
    return -1
  }
  const start = direction > 0 ? -1 : count
  const edge = advance(start, direction, context, false)
  return edge
}
