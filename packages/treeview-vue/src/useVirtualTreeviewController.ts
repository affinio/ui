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
} from "./useTreeviewController"

export type VirtualTreeviewOptions<Value = string> = TreeviewOptions<Value> & {
  rowHeight?: number
  overscan?: number
  viewportHeight?: number
}

export interface VirtualTreeviewController<Value = string> extends TreeviewController<Value> {
  readonly scrollTop: ShallowRef<number>
  readonly rowHeight: ShallowRef<number>
  readonly viewportHeight: ShallowRef<number>
  readonly totalHeight: ShallowRef<number>
  readonly visibleWindow: ShallowRef<ReadonlyArray<TreeviewNodeMeta<Value>>>
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
  const overscan = Math.max(0, Math.floor(normalizeNonNegativeNumber(initialOverscan, 4)))
  let frame: ReturnType<typeof requestFrame> | null = null
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
    const end = Math.min(count, firstVisibleIndex + visibleRowCount + overscan)
    const rows = controller
      .getVisibleWindow(start, end)
      .map((value) => controller.getNodeMeta(value))
      .filter((meta): meta is TreeviewNodeMeta<Value> => meta !== null)
    visibleWindow.value = Object.freeze(rows)
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
    scrollTop.value = normalizeNonNegativeNumber(value, 0)
    scheduleRefresh()
  }

  const setViewportHeight = (value: number) => {
    viewportHeight.value = normalizeNonNegativeNumber(value, 0)
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

  const refreshAfter = <Args extends unknown[]>(callback: (...args: Args) => void) => {
    return (...args: Args) => {
      callback(...args)
      refreshWindow()
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
    controller.dispose()
  }

  if (getCurrentScope()) {
    onScopeDispose(dispose)
  }

  refreshWindow()

  return {
    ...controller,
    scrollTop,
    rowHeight,
    viewportHeight,
    totalHeight,
    visibleWindow,
    registerNodes: refreshAfter(controller.registerNodes),
    select: refreshAfter(controller.select),
    clearSelection: refreshAfter(controller.clearSelection),
    focus: refreshAfter(controller.focus),
    focusFirst: refreshAfter(controller.focusFirst),
    focusLast: refreshAfter(controller.focusLast),
    focusNext: refreshAfter(controller.focusNext),
    focusPrevious: refreshAfter(controller.focusPrevious),
    expand: refreshAfter(controller.expand),
    collapse: refreshAfter(controller.collapse),
    toggle: refreshAfter(controller.toggle),
    expandPath: refreshAfter(controller.expandPath),
    setScrollTop,
    setViewportHeight,
    scrollToIndex,
    scrollToValue,
    refreshWindow,
    dispose,
  }
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

function requestFrame(callback: () => void): number {
  const request = globalThis.requestAnimationFrame
  if (typeof request === "function") {
    return request(() => callback())
  }
  return globalThis.setTimeout(callback, 0)
}

function cancelFrame(handle: number): void {
  const cancel = globalThis.cancelAnimationFrame
  if (typeof cancel === "function") {
    cancel(handle)
    return
  }
  globalThis.clearTimeout(handle)
}
