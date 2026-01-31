import type { LinearSelectionState } from "@affino/selection-core"
import { getCurrentScope, onScopeDispose, shallowRef, type ShallowRef } from "vue"
import type { LinearSelectionStore } from "./store"

export interface UseLinearSelectionStoreResult {
  state: ShallowRef<LinearSelectionState>
  stop(): void
}

export function useLinearSelectionStore(
  store: LinearSelectionStore,
): UseLinearSelectionStoreResult {
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
