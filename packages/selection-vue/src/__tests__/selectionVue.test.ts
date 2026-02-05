import { describe, expect, it, vi } from "vitest"
import { effectScope, type ShallowRef } from "vue"
import { clearLinearSelection, selectLinearIndex, type LinearSelectionState } from "@affino/selection-core"
import {
  activateListboxIndex,
  moveListboxFocus,
  toggleActiveListboxOption,
  type ListboxState,
} from "@affino/listbox-core"
import { createLinearSelectionStore, createListboxStore } from "../store"
import { useLinearSelectionStore } from "../useLinearSelection"
import { useListboxStore } from "../useListboxStore"

describe("createLinearSelectionStore", () => {
  it("notifies subscribers with cloned snapshots", () => {
    const store = createLinearSelectionStore()
    const snapshots: LinearSelectionState[] = []
    const unsubscribe = store.subscribe((snapshot) => {
      snapshots.push(snapshot)
    })

    store.applyResult(selectLinearIndex({ index: 2 }))
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]?.ranges).toEqual([{ start: 2, end: 2 }])

    unsubscribe()
  })
})

describe("useLinearSelectionStore", () => {
  it("streams store updates and stops with the scope", () => {
    const store = createLinearSelectionStore()
    const scope = effectScope()
    let selection!: ShallowRef<LinearSelectionState>

    scope.run(() => {
      const result = useLinearSelectionStore(store)
      selection = result.state
    })

    expect(selection.value.ranges).toHaveLength(0)
    store.applyResult(selectLinearIndex({ index: 4 }))
    expect(selection.value.ranges[0]).toEqual({ start: 4, end: 4 })

    scope.stop()
    store.applyResult(clearLinearSelection())
    expect(selection.value.ranges[0]).toEqual({ start: 4, end: 4 })
  })

  it("works safely outside a Vue effect scope and can be stopped manually", () => {
    const store = createLinearSelectionStore()
    const result = useLinearSelectionStore(store)

    store.applyResult(selectLinearIndex({ index: 2 }))
    expect(result.state.value.ranges[0]).toEqual({ start: 2, end: 2 })

    result.stop()
    store.applyResult(clearLinearSelection())
    expect(result.state.value.ranges[0]).toEqual({ start: 2, end: 2 })
  })
})

describe("createListboxStore", () => {
  it("streams cloned snapshots when activating indexes", () => {
    const context = { optionCount: 4 }
    const store = createListboxStore({ context })
    const snapshots: ListboxState[] = []

    const unsubscribe = store.subscribe((snapshot) => {
      snapshots.push(snapshot)
    })

    store.activate(2)
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]?.activeIndex).toBe(2)
    expect(snapshots[0]?.selection.ranges[0]).toEqual({ start: 2, end: 2 })

    unsubscribe()
  })

  it("responds to context mutations when moving and selecting", () => {
    const context = { optionCount: 2 }
    const store = createListboxStore({ context })

    store.move(1)
    expect(store.peekState().activeIndex).toBe(0)

    context.optionCount = 5
    store.move(1)
    expect(store.peekState().activeIndex).toBe(1)

    context.optionCount = 0
    store.selectAll()
    expect(store.peekState().selection.ranges).toHaveLength(0)

    context.optionCount = 6
    store.selectAll()
    expect(store.peekState().selection.ranges[0]).toEqual({ start: 0, end: 5 })
  })

  it("stays in parity with listbox-core reducers for edge transitions", () => {
    const context = { optionCount: 5 }
    const store = createListboxStore({ context })
    const base = store.peekState()

    const expectedActivate = activateListboxIndex({
      state: base,
      context,
      index: 999,
      extend: false,
      toggle: false,
    })
    const actualActivate = store.activate(999)
    expect(actualActivate).toEqual(expectedActivate)

    const expectedMove = moveListboxFocus({
      state: actualActivate,
      context,
      delta: -999,
      loop: false,
      extend: false,
    })
    const actualMove = store.move(-999, { loop: false, extend: false })
    expect(actualMove).toEqual(expectedMove)

    const expectedToggle = toggleActiveListboxOption({ state: actualMove })
    const actualToggle = store.toggleActiveOption()
    expect(actualToggle).toEqual(expectedToggle)
  })

  it("does not leak listeners across repeated subscribe/unsubscribe cycles", () => {
    const store = createListboxStore({ context: { optionCount: 10 } })
    const listeners = Array.from({ length: 50 }, () => vi.fn())
    const unsubs = listeners.map((listener) => store.subscribe(listener))

    unsubs.forEach((unsubscribe) => unsubscribe())
    // Idempotent unsubscribe should remain safe.
    unsubs.forEach((unsubscribe) => unsubscribe())

    store.activate(3)
    listeners.forEach((listener) => {
      expect(listener).not.toHaveBeenCalled()
    })
  })
})

describe("useListboxStore", () => {
  it("tracks store updates inside an effect scope", () => {
    const context = { optionCount: 3 }
    const store = createListboxStore({ context })
    const scope = effectScope()
    let listbox!: ShallowRef<ListboxState>

    scope.run(() => {
      const result = useListboxStore(store)
      listbox = result.state
    })

    expect(listbox.value.activeIndex).toBe(-1)
    store.activate(1)
    expect(listbox.value.activeIndex).toBe(1)

    scope.stop()
    store.clearSelection({ preserveActiveIndex: true })
    expect(listbox.value.activeIndex).toBe(1)
    expect(listbox.value.selection.ranges[0]).toEqual({ start: 1, end: 1 })
  })

  it("is safe outside an effect scope and supports explicit stop", () => {
    const context = { optionCount: 4 }
    const store = createListboxStore({ context })
    const result = useListboxStore(store)

    store.activate(2)
    expect(result.state.value.activeIndex).toBe(2)

    result.stop()
    store.activate(0)
    expect(result.state.value.activeIndex).toBe(2)
  })
})
