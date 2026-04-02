import type { ComboboxState } from "@affino/combobox-core"
import { getCurrentScope, onScopeDispose, shallowRef, type ShallowRef } from "vue"
import type { ComboboxStore } from "./store"

export interface UseComboboxStoreResult {
  state: ShallowRef<ComboboxState>
  stop(): void
}

export function useComboboxStore(store: ComboboxStore): UseComboboxStoreResult {
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