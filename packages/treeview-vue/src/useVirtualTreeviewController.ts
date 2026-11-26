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
  /** Visible values rendered in a fixed region above the scrollable virtual rows. */
  pinnedValues?: ReadonlyArray<Value>
}

export type VirtualTreeviewRow<Value = string> = Readonly<TreeviewNodeMeta<Value> & {
  /** Index within the pinned or scrollable row set. */
  index: number
  /** Index in the complete core-visible tree, including pinned values. */
  treeIndex: number
  top: number
  height: number
  pinned: boolean
}>

type FrameHandle = number | ReturnType<typeof globalThis.setTimeout>

export interface VirtualTreeviewController<Value = string> extends TreeviewController<Value> {
  readonly scrollTop: ShallowRef<number>
  readonly rowHeight: ShallowRef<number>
  readonly viewportHeight: ShallowRef<number>
  readonly totalHeight: ShallowRef<number>
  readonly visibleWindow: ShallowRef<ReadonlyArray<TreeviewNodeMeta<Value>>>
  readonly visibleRows: ShallowRef<ReadonlyArray<VirtualTreeviewRow<Value>>>
  readonly pinnedRows: ShallowRef<ReadonlyArray<VirtualTreeviewRow<Value>>>
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
    pinnedValues = [],
    ...treeOptions
  } = options
  const controller = useTreeviewController<Value>(treeOptions)
  const scrollTop = shallowRef(0)
  const rowHeight = shallowRef(normalizePositiveNumber(initialRowHeight, 32))
  const viewportHeight = shallowRef(normalizeNonNegativeNumber(initialViewportHeight, 320))
  const totalHeight = shallowRef(0)
  const visibleWindow = shallowRef<ReadonlyArray<TreeviewNodeMeta<Value>>>(Object.freeze([]))
  const visibleRows = shallowRef<ReadonlyArray<VirtualTreeviewRow<Value>>>(Object.freeze([]))
  const pinnedRows = shallowRef<ReadonlyArray<VirtualTreeviewRow<Value>>>(Object.freeze([]))
  const overscan = Math.max(0, Math.floor(normalizeNonNegativeNumber(initialOverscan, 4)))
  let frame: FrameHandle | null = null
  let disposed = false

  const getVisiblePinnedIndexes = (): number[] => {
    const seen = new Set<Value>()
    const indexes: number[] = []
    for (const value of pinnedValues) {
      if (seen.has(value)) continue
      seen.add(value)
      const index = controller.getVisibleIndex(value)
      if (index >= 0) indexes.push(index)
    }
    return indexes.sort((a, b) => a - b)
  }

  const getScrollableIndex = (treeIndex: number, pinnedIndexes: ReadonlyArray<number>): number => {
    let scrollIndex = treeIndex
    for (const pinnedIndex of pinnedIndexes) {
      if (pinnedIndex >= treeIndex) break
      scrollIndex -= 1
    }
    return scrollIndex
  }

  const getTreeIndex = (scrollIndex: number, pinnedIndexes: ReadonlyArray<number>): number => {
    let treeIndex = scrollIndex
    for (const pinnedIndex of pinnedIndexes) {
      if (pinnedIndex > treeIndex) break
      treeIndex += 1
    }
    return treeIndex
  }

  const refreshWindow = () => {
    const count = controller.getVisibleCount()
    const pinnedIndexes = getVisiblePinnedIndexes()
    const scrollableCount = Math.max(0, count - pinnedIndexes.length)
    const pinnedHeight = pinnedIndexes.length * rowHeight.value
    const scrollViewportHeight = Math.max(0, viewportHeight.value - pinnedHeight)
    totalHeight.value = scrollableCount * rowHeight.value
    const safeScrollTop = clamp(scrollTop.value, 0, Math.max(0, totalHeight.value - scrollViewportHeight))
    if (safeScrollTop !== scrollTop.value) {
      scrollTop.value = safeScrollTop
    }
    const firstVisibleIndex = Math.floor(safeScrollTop / rowHeight.value)
    const visibleRowCount = scrollViewportHeight === 0 ? 0 : Math.ceil(scrollViewportHeight / rowHeight.value)
    const start = Math.max(0, firstVisibleIndex - overscan)
    const lastVisibleIndex = Math.ceil((safeScrollTop + scrollViewportHeight) / rowHeight.value)
    const end = Math.min(scrollableCount, Math.max(firstVisibleIndex + visibleRowCount, lastVisibleIndex) + overscan)
    const metas: TreeviewNodeMeta<Value>[] = []
    const rows: VirtualTreeviewRow<Value>[] = []
    for (let index = start; index < end; index += 1) {
      const treeIndex = getTreeIndex(index, pinnedIndexes)
      const value = controller.getVisibleAt(treeIndex)
      if (value === null) continue
      const meta = controller.getNodeMeta(value)
      if (!meta) {
        continue
      }
      const top = index * rowHeight.value
      metas.push(meta)
      rows.push(Object.freeze({
        ...meta,
        index,
        treeIndex,
        top,
        height: rowHeight.value,
        pinned: false,
      }))
    }
    const pins: VirtualTreeviewRow<Value>[] = []
    pinnedIndexes.forEach((treeIndex, index) => {
      const value = controller.getVisibleAt(treeIndex)
      if (value === null) return
      const meta = controller.getNodeMeta(value)
      if (!meta) return
      pins.push(Object.freeze({
        ...meta,
        index,
        treeIndex,
        top: index * rowHeight.value,
        height: rowHeight.value,
        pinned: true,
      }))
    })
    if (!rowsEqual(visibleRows.value, rows)) {
      visibleWindow.value = Object.freeze(metas)
      visibleRows.value = Object.freeze(rows)
    }
    if (!rowsEqual(pinnedRows.value, pins)) pinnedRows.value = Object.freeze(pins)
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
    const treeIndex = Math.max(0, Math.trunc(index))
    const pinnedIndexes = getVisiblePinnedIndexes()
    if (pinnedIndexes.includes(treeIndex)) return
    setScrollTop(getScrollableIndex(treeIndex, pinnedIndexes) * rowHeight.value)
  }

  const scrollToValue = (value: Value) => {
    const index = controller.getVisibleIndex(value)
    if (index >= 0) {
      scrollToIndex(index)
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
  let topologyVersion = controller.core.getTopologyVersion()
  const coreSubscription = controller.core.subscribe(() => {
    const nextTopologyVersion = controller.core.getTopologyVersion()
    if (nextTopologyVersion !== topologyVersion) {
      const previousIndex = Math.floor(scrollTop.value / rowHeight.value)
      const previousAnchor = visibleRows.value.find((row) => row.index === previousIndex)
      if (previousAnchor) {
          const nextTreeIndex = controller.getVisibleIndex(previousAnchor.value)
          const nextScrollIndex = nextTreeIndex < 0 ? -1 : getScrollableIndex(nextTreeIndex, getVisiblePinnedIndexes())
          if (nextScrollIndex >= 0 && nextScrollIndex !== previousIndex) {
          const offset = scrollTop.value - previousIndex * rowHeight.value
            scrollTop.value = Math.max(0, nextScrollIndex * rowHeight.value + offset)
        }
      }
      topologyVersion = nextTopologyVersion
    }
    refreshWindow()
  })

  return {
    ...controller,
    scrollTop,
    rowHeight,
    viewportHeight,
    totalHeight,
    visibleWindow,
    visibleRows,
    pinnedRows,
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
      currentRow.treeIndex !== nextRow.treeIndex ||
      currentRow.top !== nextRow.top ||
      currentRow.height !== nextRow.height ||
      currentRow.pinned !== nextRow.pinned ||
      currentRow.depth !== nextRow.depth ||
      currentRow.childCount !== nextRow.childCount ||
      currentRow.hasChildren !== nextRow.hasChildren ||
      currentRow.childrenLoadState.status !== nextRow.childrenLoadState.status ||
      loadRequestId(currentRow.childrenLoadState) !== loadRequestId(nextRow.childrenLoadState) ||
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

function loadRequestId(state: TreeviewNodeMeta["childrenLoadState"]): number | null {
  return state.status === "loading" || state.status === "error" ? state.requestId : null
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
