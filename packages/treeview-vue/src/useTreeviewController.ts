import { getCurrentScope, onScopeDispose, shallowRef } from "vue"
import type { ShallowRef } from "vue"
import {
  TreeviewCore,
  type TreeviewNode,
  type TreeviewOptions,
  type TreeviewSnapshot,
} from "@affino/treeview-core"

export interface TreeviewController<Value = string> {
  readonly core: TreeviewCore<Value>
  readonly state: ShallowRef<TreeviewSnapshot<Value>>
  readonly registerNodes: (nodes: ReadonlyArray<TreeviewNode<Value>>) => void
  readonly select: (value: Value) => void
  readonly clearSelection: () => void
  readonly focus: (value: Value) => void
  readonly focusFirst: () => void
  readonly focusLast: () => void
  readonly focusNext: () => void
  readonly focusPrevious: () => void
  readonly expand: (value: Value) => void
  readonly collapse: (value: Value) => void
  readonly toggle: (value: Value) => void
  readonly expandPath: (value: Value) => void
  readonly isExpanded: (value: Value) => boolean
  readonly isSelected: (value: Value) => boolean
  readonly isActive: (value: Value) => boolean
  readonly getVisibleValues: () => Value[]
  readonly dispose: () => void
}

export function useTreeviewController<Value = string>(
  options: TreeviewOptions<Value> = {},
): TreeviewController<Value> {
  const core = new TreeviewCore<Value>(options)
  const state = shallowRef<TreeviewSnapshot<Value>>(core.getSnapshot())
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
    registerNodes: (nodes) => core.registerNodes(nodes),
    select: (value) => core.select(value),
    clearSelection: () => core.clearSelection(),
    focus: (value) => core.focus(value),
    focusFirst: () => core.focusFirst(),
    focusLast: () => core.focusLast(),
    focusNext: () => core.focusNext(),
    focusPrevious: () => core.focusPrevious(),
    expand: (value) => core.expand(value),
    collapse: (value) => core.collapse(value),
    toggle: (value) => core.toggle(value),
    expandPath: (value) => core.expandPath(value),
    isExpanded: (value) => core.isExpanded(value),
    isSelected: (value) => core.isSelected(value),
    isActive: (value) => core.isActive(value),
    getVisibleValues: () => core.getVisibleValues(),
    dispose,
  }
}
