import { resolveOverscanBuckets } from "./overscanBuckets"
import type {
  AxisOrientation,
  AxisVirtualizer,
  AxisVirtualizerContext,
  AxisVirtualizerInternalContext,
  AxisVirtualizerRange,
  AxisVirtualizerState,
  AxisVirtualizerStrategy,
} from "./types"
import { clamp } from "../utils/clamp"

export function createAxisVirtualizer<TMeta, TPayload>(
  axis: AxisOrientation,
  strategy: AxisVirtualizerStrategy<TMeta, TPayload>,
  initialPayload: TPayload,
): AxisVirtualizer<TMeta, TPayload> {
  const state: AxisVirtualizerState<TPayload> = {
    axis,
    offset: 0,
    viewportSize: 0,
    totalCount: 0,
    startIndex: 0,
    endIndex: 0,
    visibleCount: 0,
    poolSize: 0,
    overscanLeading: 0,
    overscanTrailing: 0,
    payload: initialPayload,
  }

  const internalContext: AxisVirtualizerInternalContext<TMeta> = {
    axis,
    viewportSize: 0,
    scrollOffset: 0,
    virtualizationEnabled: false,
    estimatedItemSize: 0,
    totalCount: 0,
    overscan: 0,
    meta: undefined as unknown as TMeta,
    visibleCount: 0,
    poolSize: 0,
    overscanLeading: 0,
    overscanTrailing: 0,
  }

  const range: AxisVirtualizerRange<TPayload> = {
    start: 0,
    end: 0,
    payload: initialPayload,
  }

  function getState(): AxisVirtualizerState<TPayload> {
    return state
  }

  function update(context: AxisVirtualizerContext<TMeta>): AxisVirtualizerState<TPayload> {
    const virtualizationEnabled = context.virtualizationEnabled && context.totalCount > 0
    const visibleCount = virtualizationEnabled
      ? Math.max(1, strategy.computeVisibleCount(context))
      : context.totalCount
    const overscanBase = virtualizationEnabled ? Math.max(0, Math.round(context.overscan)) : 0
    const poolSize = virtualizationEnabled
      ? Math.min(context.totalCount, Math.max(visibleCount + overscanBase, visibleCount))
      : context.totalCount

    const availableOverscan = Math.max(poolSize - visibleCount, 0)
    let overscanLeading = 0
    let overscanTrailing = 0

    if (virtualizationEnabled && availableOverscan > 0) {
      const metaWithDirection = context.meta as { scrollDirection?: number } | undefined
      const rawDirection = typeof metaWithDirection?.scrollDirection === "number"
        ? metaWithDirection.scrollDirection
        : 0
      const distribution = resolveOverscanBuckets({
        available: availableOverscan,
        direction: rawDirection,
      })
      overscanLeading = distribution.leading
      overscanTrailing = distribution.trailing
    }

    internalContext.axis = axis
    internalContext.viewportSize = context.viewportSize
    internalContext.scrollOffset = context.scrollOffset
    internalContext.virtualizationEnabled = virtualizationEnabled
    internalContext.estimatedItemSize = context.estimatedItemSize
    internalContext.totalCount = context.totalCount
    internalContext.overscan = context.overscan
    internalContext.meta = context.meta
    internalContext.visibleCount = visibleCount
    internalContext.poolSize = poolSize
    internalContext.overscanLeading = overscanLeading
    internalContext.overscanTrailing = overscanTrailing

    const offset = strategy.clampScroll(context.scrollOffset, internalContext)
    const rangeResult = strategy.computeRange(offset, internalContext, range)
    const maxPoolStart = Math.max(context.totalCount - internalContext.poolSize, 0)
    const normalizedStart = clamp(rangeResult.start, 0, maxPoolStart)
    const normalizedEnd = Math.min(context.totalCount, Math.max(rangeResult.end, normalizedStart))
    const computedPoolSize = Math.max(normalizedEnd - normalizedStart, 0)

    state.offset = offset
    state.viewportSize = context.viewportSize
    state.totalCount = context.totalCount
    state.startIndex = normalizedStart
    state.endIndex = normalizedEnd
    state.visibleCount = visibleCount
    state.poolSize = computedPoolSize
    state.overscanLeading = overscanLeading
    state.overscanTrailing = overscanTrailing
    state.payload = rangeResult.payload

    return state
  }

  function getOffsetForIndex(index: number, context: AxisVirtualizerInternalContext<TMeta>): number {
    if (strategy.getOffsetForIndex) {
      return strategy.getOffsetForIndex(index, context)
    }
    const clampedIndex = clamp(index, 0, Math.max(context.totalCount - 1, 0))
    return clampedIndex * context.estimatedItemSize
  }

  function isIndexVisible(index: number): boolean {
    return index >= state.startIndex && index < state.endIndex
  }

  return {
    update,
    getState,
    getOffsetForIndex,
    isIndexVisible,
  }
}
