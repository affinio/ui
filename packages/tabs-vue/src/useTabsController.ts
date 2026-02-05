import { getCurrentScope, onScopeDispose, shallowRef } from "vue"
import type { ShallowRef } from "vue"
import { TabsCore, type TabsState } from "@affino/tabs-core"

export interface TabsController<Value = string> {
  readonly core: TabsCore<Value>
  readonly state: ShallowRef<TabsState<Value>>
  readonly select: (value: Value) => void
  readonly clear: () => void
  readonly isSelected: (value: Value) => boolean
  readonly dispose: () => void
}

export function useTabsController<Value = string>(defaultValue: Value | null = null): TabsController<Value> {
  const core = new TabsCore<Value>(defaultValue)
  const state = shallowRef<TabsState<Value>>(core.getSnapshot())
  const subscription = core.subscribe((next) => {
    state.value = next
  })

  let disposed = false
  const dispose = () => {
    if (disposed) {
      return
    }
    disposed = true
    subscription.unsubscribe()
    core.destroy()
  }

  if (getCurrentScope()) {
    onScopeDispose(dispose)
  }

  return {
    core,
    state,
    select: (value: Value) => core.select(value),
    clear: () => core.clear(),
    isSelected: (value: Value) => state.value.value === value,
    dispose,
  }
}
