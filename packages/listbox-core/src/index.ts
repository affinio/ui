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
  const count = resolveOptionCount(input.context)
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
  const enabledIndexes = buildEnabledIndexes(input.context)
  if (enabledIndexes.length === 0) {
    return createListboxState()
  }
  const first = enabledIndexes[0]!
  const last = enabledIndexes[enabledIndexes.length - 1]!
  let selection = selectLinearIndex({ index: first })
  selection = extendLinearSelectionToIndex({ state: selection, index: last })
  return {
    selection,
    activeIndex: last,
  }
}

function isIndexDisabled(context: ListboxContext, index: number): boolean {
  try {
    return context.isDisabled?.(index) ?? false
  } catch {
    return false
  }
}

function resolveOptionCount(context: ListboxContext): number {
  const raw = context.optionCount
  if (!Number.isFinite(raw)) {
    return 0
  }
  if (raw <= 0) {
    return 0
  }
  return Math.trunc(raw)
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
  const count = resolveOptionCount(context)
  if (count <= 0) {
    return -1
  }
  if (delta === 0 && currentIndex >= 0 && currentIndex < count && !isIndexDisabled(context, currentIndex)) {
    return currentIndex
  }
  const enabledIndexes = buildEnabledIndexes(context)
  if (enabledIndexes.length === 0) {
    return -1
  }
  if (!Number.isFinite(delta)) {
    return delta > 0 ? enabledIndexes[0]! : enabledIndexes[enabledIndexes.length - 1]!
  }
  const direction = delta > 0 ? 1 : -1
  let steps = Math.abs(Math.trunc(delta))
  let cursor = currentIndex
  if (cursor < 0 || cursor >= count) {
    cursor = direction > 0 ? -1 : count
  }
  if (steps === 0) {
    if (cursor === -1) {
      return direction > 0 ? enabledIndexes[0]! : enabledIndexes[enabledIndexes.length - 1]!
    }
    return cursor
  }
  return navigateEnabledIndexes(cursor, direction, steps, enabledIndexes, loop)
}

function buildEnabledIndexes(context: ListboxContext): number[] {
  const count = resolveOptionCount(context)
  if (count <= 0) return []

  const enabledIndexes: number[] = []
  for (let index = 0; index < count; index += 1) {
    if (!isIndexDisabled(context, index)) {
      enabledIndexes.push(index)
    }
  }
  return enabledIndexes
}

function navigateEnabledIndexes(
  cursor: number,
  direction: 1 | -1,
  steps: number,
  enabledIndexes: number[],
  loop: boolean,
): number {
  const total = enabledIndexes.length
  if (total === 0) {
    return cursor
  }
  if (direction > 0) {
    let start = upperBound(enabledIndexes, cursor)
    if (start >= total) {
      if (!loop) {
        return cursor
      }
      start = 0
    }
    if (!loop) {
      const target = start + steps - 1
      return enabledIndexes[target >= total ? total - 1 : target]!
    }
    const target = (start + steps - 1) % total
    return enabledIndexes[target]!
  }

  let start = lowerBound(enabledIndexes, cursor) - 1
  if (start < 0) {
    if (!loop) {
      return cursor
    }
    start = total - 1
  }
  if (!loop) {
    const target = start - (steps - 1)
    return enabledIndexes[target < 0 ? 0 : target]!
  }
  const target = modulo(start - (steps - 1), total)
  return enabledIndexes[target]!
}

function lowerBound(values: number[], value: number): number {
  let lo = 0
  let hi = values.length
  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo) / 2)
    if (values[mid]! < value) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }
  return lo
}

function upperBound(values: number[], value: number): number {
  let lo = 0
  let hi = values.length
  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo) / 2)
    if (values[mid]! <= value) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }
  return lo
}

function modulo(value: number, mod: number): number {
  return ((value % mod) + mod) % mod
}
