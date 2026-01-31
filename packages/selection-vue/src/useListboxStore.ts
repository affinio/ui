import type { ListboxState } from "@affino/listbox-core"
import { getCurrentScope, onScopeDispose, shallowRef, type ShallowRef } from "vue"
import type { ListboxStore } from "./store"

export interface UseListboxStoreResult {
  state: ShallowRef<ListboxState>
  stop(): void
}

export function useListboxStore(store: ListboxStore): UseListboxStoreResult {
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
