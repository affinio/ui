import { getCurrentScope, onScopeDispose, shallowRef } from "vue"
import type { ShallowRef } from "vue"
import {
  TreeviewCore,
  type TreeviewActionResult,
  type TreeviewClipboardAction,
  type TreeviewDropPosition,
  type TreeviewInteractionSubscriber,
  type TreeviewNode,
  type TreeviewNodeMeta,
  type TreeviewOptions,
  type TreeviewRegisterOptions,
  type TreeviewRegisterResult,
  type TreeviewSnapshot,
  type TreeviewSelectionModifiers,
} from "@affino/treeview-core"

export interface TreeviewController<Value = string> {
  readonly core: TreeviewCore<Value>
  readonly state: ShallowRef<TreeviewSnapshot<Value>>
  readonly selectionMode: "single" | "multiple"
  readonly registerNodes: (
    nodes: ReadonlyArray<TreeviewNode<Value>>,
    options?: TreeviewRegisterOptions,
  ) => TreeviewRegisterResult
  readonly removeNodes: (values: ReadonlyArray<Value>) => TreeviewRegisterResult
  readonly batch: <T>(callback: () => T) => T
  readonly select: (value: Value) => void
  readonly requestSelect: (value: Value, modifiers?: TreeviewSelectionModifiers) => TreeviewActionResult
  readonly requestToggleSelection: (value: Value) => TreeviewActionResult
  readonly requestRangeSelection: (value: Value) => TreeviewActionResult
  readonly clearSelection: () => void
  readonly focus: (value: Value) => void
  readonly requestFocus: (value: Value) => TreeviewActionResult
  readonly requestArrowLeft: () => TreeviewActionResult
  readonly requestArrowRight: () => TreeviewActionResult
  readonly focusFirst: () => void
  readonly requestFocusFirst: () => TreeviewActionResult
  readonly focusLast: () => void
  readonly requestFocusLast: () => TreeviewActionResult
  readonly focusNext: () => void
  readonly requestFocusNext: (options?: { extendSelection?: boolean }) => TreeviewActionResult
  readonly focusPrevious: () => void
  readonly requestFocusPrevious: (options?: { extendSelection?: boolean }) => TreeviewActionResult
  readonly expand: (value: Value) => void
  readonly requestExpand: (value: Value) => TreeviewActionResult
  readonly collapse: (value: Value) => void
  readonly requestCollapse: (value: Value) => TreeviewActionResult
  readonly toggle: (value: Value) => void
  readonly requestToggle: (value: Value) => TreeviewActionResult
  readonly expandPath: (value: Value) => void
  readonly isExpanded: (value: Value) => boolean
  readonly isSelected: (value: Value) => boolean
  readonly getSelectedValues: () => ReadonlyArray<Value>
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
  readonly subscribeInteractions: (subscriber: TreeviewInteractionSubscriber<Value>) => { unsubscribe: () => void }
  readonly requestBeginDrag: (sourceValues?: ReadonlyArray<Value>) => boolean
  readonly requestHoverDrop: (targetValue: Value, position: TreeviewDropPosition) => boolean
  readonly requestResolveDrop: (accepted: boolean) => boolean
  readonly requestCancelDrag: () => boolean
  readonly requestClipboardIntent: (action: TreeviewClipboardAction, targetValue?: Value | null) => void
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
    selectionMode: core.selectionMode,
    registerNodes: (nodes, options) => core.registerNodes(nodes, options),
    removeNodes: (values) => core.removeNodes(values),
    batch: (callback) => core.batch(callback),
    select: (value) => core.select(value),
    requestSelect: (value, modifiers?: TreeviewSelectionModifiers) => core.requestSelect(value, modifiers),
    requestToggleSelection: (value) => core.requestToggleSelection(value),
    requestRangeSelection: (value) => core.requestRangeSelection(value),
    clearSelection: () => core.clearSelection(),
    focus: (value) => core.focus(value),
    requestFocus: (value) => core.requestFocus(value),
    requestArrowLeft: () => core.requestArrowLeft(),
    requestArrowRight: () => core.requestArrowRight(),
    focusFirst: () => core.focusFirst(),
    requestFocusFirst: () => core.requestFocusFirst(),
    focusLast: () => core.focusLast(),
    requestFocusLast: () => core.requestFocusLast(),
    focusNext: () => core.focusNext(),
    requestFocusNext: (options) => core.requestFocusNext(options),
    focusPrevious: () => core.focusPrevious(),
    requestFocusPrevious: (options) => core.requestFocusPrevious(options),
    expand: (value) => core.expand(value),
    requestExpand: (value) => core.requestExpand(value),
    collapse: (value) => core.collapse(value),
    requestCollapse: (value) => core.requestCollapse(value),
    toggle: (value) => core.toggle(value),
    requestToggle: (value) => core.requestToggle(value),
    expandPath: (value) => core.expandPath(value),
    isExpanded: (value) => core.isExpanded(value),
    isSelected: (value) => core.isSelected(value),
    getSelectedValues: () => core.getSelectedValues(),
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
    subscribeInteractions: (subscriber) => core.subscribeInteractions(subscriber),
    requestBeginDrag: (sourceValues) => core.requestBeginDrag(sourceValues),
    requestHoverDrop: (targetValue, position) => core.requestHoverDrop(targetValue, position),
    requestResolveDrop: (accepted) => core.requestResolveDrop(accepted),
    requestCancelDrag: () => core.requestCancelDrag(),
    requestClipboardIntent: (action, targetValue) => core.requestClipboardIntent(action, targetValue),
    dispose,
  }
}
