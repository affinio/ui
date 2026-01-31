import { describe, expect, it } from "vitest"
import { effectScope, type ShallowRef } from "vue"
import { clearLinearSelection, selectLinearIndex, type LinearSelectionState } from "@affino/selection-core"
import { createLinearSelectionStore } from "../store"
import { useLinearSelectionStore } from "../useLinearSelection"

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
})
