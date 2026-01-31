import type { HeadlessSelectionState } from "@affino/grid-selection-core"
import { getCurrentScope, onScopeDispose, shallowRef, type ShallowRef } from "vue"
import type { GridSelectionStore } from "./store"

export interface UseGridSelectionStoreResult<RowKey> {
  state: ShallowRef<HeadlessSelectionState<RowKey>>
  stop(): void
}

export function useGridSelectionStore<RowKey>(
  store: GridSelectionStore<RowKey>,
): UseGridSelectionStoreResult<RowKey> {
  const state = shallowRef(store.getState())
  let active = true

  const unsubscribe = store.subscribe((snapshot) => {
    if (!active) return
    state.value = snapshot
  })

  const stop = () => {
    if (!active) return
    active = false
    unsubscribe()
  }

  if (getCurrentScope()) {
    onScopeDispose(stop)
  }

  return {
    state,
    stop,
  }
}
