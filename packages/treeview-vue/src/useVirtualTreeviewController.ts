import { getCurrentScope, onScopeDispose, shallowRef } from "vue"
import type { ShallowRef } from "vue"
import type {
  TreeviewNode,
  TreeviewNodeMeta,
  TreeviewOptions,
} from "@affino/treeview-core"
import {
  useTreeviewController,
  type TreeviewController,
} from "./useTreeviewController.js"

export type VirtualTreeviewOptions<Value = string> = TreeviewOptions<Value> & {
  rowHeight?: number
  overscan?: number
  viewportHeight?: number
}

export type VirtualTreeviewRow<Value = string> = Readonly<TreeviewNodeMeta<Value> & {
  index: number
  top: number
  height: number
}>

type FrameHandle = number | ReturnType<typeof globalThis.setTimeout>

export interface VirtualTreeviewController<Value = string> extends TreeviewController<Value> {
  readonly scrollTop: ShallowRef<number>
  readonly rowHeight: ShallowRef<number>
  readonly viewportHeight: ShallowRef<number>
  readonly totalHeight: ShallowRef<number>
  readonly visibleWindow: ShallowRef<ReadonlyArray<TreeviewNodeMeta<Value>>>
  readonly visibleRows: ShallowRef<ReadonlyArray<VirtualTreeviewRow<Value>>>
  readonly setScrollTop: (value: number) => void
  readonly setViewportHeight: (value: number) => void
  readonly scrollToIndex: (index: number) => void
  readonly scrollToValue: (value: Value) => void
  readonly refreshWindow: () => void
}

export function useVirtualTreeviewController<Value = string>(
  options: VirtualTreeviewOptions<Value> = {},
): VirtualTreeviewController<Value> {
  const {
    rowHeight: initialRowHeight = 32,
    overscan: initialOverscan = 4,
    viewportHeight: initialViewportHeight = 320,
    ...treeOptions
  } = options
  const controller = useTreeviewController<Value>(treeOptions)
  const scrollTop = shallowRef(0)
  const rowHeight = shallowRef(normalizePositiveNumber(initialRowHeight, 32))
  const viewportHeight = shallowRef(normalizeNonNegativeNumber(initialViewportHeight, 320))
  const totalHeight = shallowRef(0)
  const visibleWindow = shallowRef<ReadonlyArray<TreeviewNodeMeta<Value>>>(Object.freeze([]))
  const visibleRows = shallowRef<ReadonlyArray<VirtualTreeviewRow<Value>>>(Object.freeze([]))
  const overscan = Math.max(0, Math.floor(normalizeNonNegativeNumber(initialOverscan, 4)))
  let frame: FrameHandle | null = null
  let disposed = false

  const refreshWindow = () => {
    const count = controller.getVisibleCount()
    totalHeight.value = count * rowHeight.value
    const safeScrollTop = clamp(scrollTop.value, 0, Math.max(0, totalHeight.value - viewportHeight.value))
    if (safeScrollTop !== scrollTop.value) {
      scrollTop.value = safeScrollTop
    }
    const firstVisibleIndex = Math.floor(safeScrollTop / rowHeight.value)
    const visibleRowCount = viewportHeight.value === 0 ? 0 : Math.ceil(viewportHeight.value / rowHeight.value)
    const start = Math.max(0, firstVisibleIndex - overscan)
    const lastVisibleIndex = Math.ceil((safeScrollTop + viewportHeight.value) / rowHeight.value)
    const end = Math.min(count, Math.max(firstVisibleIndex + visibleRowCount, lastVisibleIndex) + overscan)
    const metas: TreeviewNodeMeta<Value>[] = []
    const rows: VirtualTreeviewRow<Value>[] = []
    controller.getVisibleWindow(start, end).forEach((value, offset) => {
      const meta = controller.getNodeMeta(value)
      if (!meta) {
        return
      }
      const index = start + offset
      const top = index * rowHeight.value
      metas.push(meta)
      rows.push(Object.freeze({
        ...meta,
        index,
        top,
        height: rowHeight.value,
      }))
    })
    if (rowsEqual(visibleRows.value, rows)) {
      return
    }
    visibleWindow.value = Object.freeze(metas)
    visibleRows.value = Object.freeze(rows)
  }

  const scheduleRefresh = () => {
    if (frame !== null || disposed) {
      return
    }
    frame = requestFrame(() => {
      frame = null
      refreshWindow()
    })
  }

  const setScrollTop = (value: number) => {
    const nextScrollTop = normalizeNonNegativeNumber(value, 0)
    if (nextScrollTop === scrollTop.value) {
      return
    }
    scrollTop.value = nextScrollTop
    scheduleRefresh()
  }

  const setViewportHeight = (value: number) => {
    const nextViewportHeight = normalizeNonNegativeNumber(value, 0)
    if (nextViewportHeight === viewportHeight.value) {
      return
    }
    viewportHeight.value = nextViewportHeight
    scheduleRefresh()
  }

  const scrollToIndex = (index: number) => {
    if (!Number.isFinite(index)) {
      return
    }
    setScrollTop(Math.max(0, Math.trunc(index)) * rowHeight.value)
  }

  const scrollToValue = (value: Value) => {
    const index = controller.getVisibleIndex(value)
    if (index >= 0) {
      scrollToIndex(index)
    }
  }

  const refreshAfter = <Args extends unknown[], Result>(callback: (...args: Args) => Result) => {
    return (...args: Args): Result => {
      const result = callback(...args)
      refreshWindow()
      return result
    }
  }

  const dispose = () => {
    if (disposed) {
      return
    }
    disposed = true
    if (frame !== null) {
      cancelFrame(frame)
      frame = null
    }
    coreSubscription.unsubscribe()
    controller.dispose()
  }

  if (getCurrentScope()) {
    onScopeDispose(dispose)
  }

  refreshWindow()
  const coreSubscription = controller.core.subscribe(() => scheduleRefresh())

  return {
    ...controller,
    scrollTop,
    rowHeight,
    viewportHeight,
    totalHeight,
    visibleWindow,
    visibleRows,
    registerNodes: refreshAfter(controller.registerNodes),
    select: refreshAfter(controller.select),
    requestSelect: refreshAfter(controller.requestSelect),
    clearSelection: refreshAfter(controller.clearSelection),
    focus: refreshAfter(controller.focus),
    requestFocus: refreshAfter(controller.requestFocus),
    focusFirst: refreshAfter(controller.focusFirst),
    requestFocusFirst: refreshAfter(controller.requestFocusFirst),
    focusLast: refreshAfter(controller.focusLast),
    requestFocusLast: refreshAfter(controller.requestFocusLast),
    focusNext: refreshAfter(controller.focusNext),
    requestFocusNext: refreshAfter(controller.requestFocusNext),
    focusPrevious: refreshAfter(controller.focusPrevious),
    requestFocusPrevious: refreshAfter(controller.requestFocusPrevious),
    expand: refreshAfter(controller.expand),
    requestExpand: refreshAfter(controller.requestExpand),
    collapse: refreshAfter(controller.collapse),
    requestCollapse: refreshAfter(controller.requestCollapse),
    toggle: refreshAfter(controller.toggle),
    requestToggle: refreshAfter(controller.requestToggle),
    expandPath: refreshAfter(controller.expandPath),
    setSearchQuery: refreshAfter(controller.setSearchQuery),
    clearSearchQuery: refreshAfter(controller.clearSearchQuery),
    setScrollTop,
    setViewportHeight,
    scrollToIndex,
    scrollToValue,
    refreshWindow,
    dispose,
  }
}

function rowsEqual<Value>(
  current: ReadonlyArray<VirtualTreeviewRow<Value>>,
  next: ReadonlyArray<VirtualTreeviewRow<Value>>,
): boolean {
  if (current.length !== next.length) {
    return false
  }
  for (let index = 0; index < current.length; index += 1) {
    const currentRow = current[index]!
    const nextRow = next[index]!
    if (
      !Object.is(currentRow.value, nextRow.value) ||
      !Object.is(currentRow.parent, nextRow.parent) ||
      currentRow.index !== nextRow.index ||
      currentRow.top !== nextRow.top ||
      currentRow.height !== nextRow.height ||
      currentRow.depth !== nextRow.depth ||
      currentRow.childCount !== nextRow.childCount ||
      currentRow.disabled !== nextRow.disabled ||
      currentRow.expanded !== nextRow.expanded ||
      currentRow.selected !== nextRow.selected ||
      currentRow.active !== nextRow.active ||
      currentRow.matched !== nextRow.matched
    ) {
      return false
    }
  }
  return true
}

function normalizePositiveNumber(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function normalizeNonNegativeNumber(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function requestFrame(callback: () => void): FrameHandle {
  const request = globalThis.requestAnimationFrame
  if (typeof request === "function") {
    return request(() => callback())
  }
  return globalThis.setTimeout(callback, 0)
}

function cancelFrame(handle: FrameHandle): void {
  const cancel = globalThis.cancelAnimationFrame
  if (typeof cancel === "function") {
    cancel(handle as number)
    return
  }
  globalThis.clearTimeout(handle)
}
