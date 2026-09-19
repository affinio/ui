import { getCurrentScope, onScopeDispose, shallowRef } from "vue"
import type { ShallowRef } from "vue"
import {
  TreeviewCore,
  type TreeviewActionResult,
  type TreeviewNode,
  type TreeviewNodeMeta,
  type TreeviewOptions,
  type TreeviewRegisterOptions,
  type TreeviewRegisterResult,
  type TreeviewSnapshot,
} from "@affino/treeview-core"

export interface TreeviewController<Value = string> {
  readonly core: TreeviewCore<Value>
  readonly state: ShallowRef<TreeviewSnapshot<Value>>
  readonly registerNodes: (
    nodes: ReadonlyArray<TreeviewNode<Value>>,
    options?: TreeviewRegisterOptions,
  ) => TreeviewRegisterResult
  readonly select: (value: Value) => void
  readonly requestSelect: (value: Value) => TreeviewActionResult
  readonly clearSelection: () => void
  readonly focus: (value: Value) => void
  readonly requestFocus: (value: Value) => TreeviewActionResult
  readonly focusFirst: () => void
  readonly requestFocusFirst: () => TreeviewActionResult
  readonly focusLast: () => void
  readonly requestFocusLast: () => TreeviewActionResult
  readonly focusNext: () => void
  readonly requestFocusNext: () => TreeviewActionResult
  readonly focusPrevious: () => void
  readonly requestFocusPrevious: () => TreeviewActionResult
  readonly expand: (value: Value) => void
  readonly requestExpand: (value: Value) => TreeviewActionResult
  readonly collapse: (value: Value) => void
  readonly requestCollapse: (value: Value) => TreeviewActionResult
  readonly toggle: (value: Value) => void
  readonly requestToggle: (value: Value) => TreeviewActionResult
  readonly expandPath: (value: Value) => void
  readonly isExpanded: (value: Value) => boolean
  readonly isSelected: (value: Value) => boolean
  readonly isActive: (value: Value) => boolean
  readonly getVisibleValues: () => Value[]
  readonly getVisibleCount: () => number
  readonly getVisibleAt: (index: number) => Value | null
  readonly getVisibleIndex: (value: Value) => number
  readonly getVisibleWindow: (start: number, end: number) => ReadonlyArray<Value>
  readonly getNodeMeta: (value: Value) => TreeviewNodeMeta<Value> | null
  readonly setSearchQuery: (query: string) => void
  readonly clearSearchQuery: () => void
  readonly getSearchMatchCount: () => number
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
    registerNodes: (nodes, options) => core.registerNodes(nodes, options),
    select: (value) => core.select(value),
    requestSelect: (value) => core.requestSelect(value),
    clearSelection: () => core.clearSelection(),
    focus: (value) => core.focus(value),
    requestFocus: (value) => core.requestFocus(value),
    focusFirst: () => core.focusFirst(),
    requestFocusFirst: () => core.requestFocusFirst(),
    focusLast: () => core.focusLast(),
    requestFocusLast: () => core.requestFocusLast(),
    focusNext: () => core.focusNext(),
    requestFocusNext: () => core.requestFocusNext(),
    focusPrevious: () => core.focusPrevious(),
    requestFocusPrevious: () => core.requestFocusPrevious(),
    expand: (value) => core.expand(value),
    requestExpand: (value) => core.requestExpand(value),
    collapse: (value) => core.collapse(value),
    requestCollapse: (value) => core.requestCollapse(value),
    toggle: (value) => core.toggle(value),
    requestToggle: (value) => core.requestToggle(value),
    expandPath: (value) => core.expandPath(value),
    isExpanded: (value) => core.isExpanded(value),
    isSelected: (value) => core.isSelected(value),
    isActive: (value) => core.isActive(value),
    getVisibleValues: () => core.getVisibleValues(),
    getVisibleCount: () => core.getVisibleCount(),
    getVisibleAt: (index) => core.getVisibleAt(index),
    getVisibleIndex: (value) => core.getVisibleIndex(value),
    getVisibleWindow: (start, end) => core.getVisibleWindow(start, end),
    getNodeMeta: (value) => core.getNodeMeta(value),
    setSearchQuery: (query) => core.setSearchQuery(query),
    clearSearchQuery: () => core.clearSearchQuery(),
    getSearchMatchCount: () => core.getSearchMatchCount(),
    dispose,
  }
}
