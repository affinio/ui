import { getCurrentScope, onScopeDispose, shallowRef } from "vue"
import type { ShallowRef } from "vue"
import { DisclosureCore, type DisclosureState } from "@affino/disclosure-core"

export interface DisclosureController {
  readonly core: DisclosureCore
  readonly state: ShallowRef<DisclosureState>
  readonly open: () => void
  readonly close: () => void
  readonly toggle: () => void
  readonly dispose: () => void
}

export function useDisclosureController(defaultOpen = false): DisclosureController {
  const core = new DisclosureCore(defaultOpen)
  const state = shallowRef<DisclosureState>(core.getSnapshot())
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
    open: () => core.open(),
    close: () => core.close(),
    toggle: () => core.toggle(),
    dispose,
  }
}
