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

  let cachedBucketAvailable = -1
  let cachedBucketDirection = 0
  let cachedBucketLeading = 0
  let cachedBucketTrailing = 0

  function getState(): AxisVirtualizerState<TPayload> {
    return state
  }

  function update(context: AxisVirtualizerContext<TMeta>): AxisVirtualizerState<TPayload> {
    const totalCount = context.totalCount
    const viewportSize = context.viewportSize
    const scrollOffset = context.scrollOffset
    const estimatedItemSize = context.estimatedItemSize
    const overscanInput = context.overscan
    const virtualizationEnabled = context.virtualizationEnabled && totalCount > 0
    const visibleCount = virtualizationEnabled
      ? Math.max(1, strategy.computeVisibleCount(context))
      : totalCount
    const overscanBase = virtualizationEnabled ? Math.max(0, Math.round(overscanInput)) : 0
    const poolSize = virtualizationEnabled
      ? Math.min(totalCount, Math.max(visibleCount + overscanBase, visibleCount))
      : totalCount

    const availableOverscan = Math.max(poolSize - visibleCount, 0)
    let overscanLeading = 0
    let overscanTrailing = 0

    if (virtualizationEnabled && availableOverscan > 0) {
      const metaWithDirection = context.meta as { scrollDirection?: number } | undefined
      const rawDirection = typeof metaWithDirection?.scrollDirection === "number"
        ? metaWithDirection.scrollDirection
        : 0
      const normalizedDirection = clamp(rawDirection, -1, 1)
      if (availableOverscan === cachedBucketAvailable && normalizedDirection === cachedBucketDirection) {
        overscanLeading = cachedBucketLeading
        overscanTrailing = cachedBucketTrailing
      } else {
        const distribution = resolveOverscanBuckets({
          available: availableOverscan,
          direction: normalizedDirection,
        })
        overscanLeading = distribution.leading
        overscanTrailing = distribution.trailing
        cachedBucketAvailable = availableOverscan
        cachedBucketDirection = normalizedDirection
        cachedBucketLeading = overscanLeading
        cachedBucketTrailing = overscanTrailing
      }
    }

    internalContext.axis = axis
    internalContext.viewportSize = viewportSize
    internalContext.scrollOffset = scrollOffset
    internalContext.virtualizationEnabled = virtualizationEnabled
    internalContext.estimatedItemSize = estimatedItemSize
    internalContext.totalCount = totalCount
    internalContext.overscan = overscanInput
    internalContext.meta = context.meta
    internalContext.visibleCount = visibleCount
    internalContext.poolSize = poolSize
    internalContext.overscanLeading = overscanLeading
    internalContext.overscanTrailing = overscanTrailing

    const offset = strategy.clampScroll(scrollOffset, internalContext)
    const rangeResult = strategy.computeRange(offset, internalContext, range)
    const maxPoolStart = Math.max(totalCount - internalContext.poolSize, 0)
    const normalizedStart = clamp(rangeResult.start, 0, maxPoolStart)
    const normalizedEnd = Math.min(totalCount, Math.max(rangeResult.end, normalizedStart))
    const computedPoolSize = Math.max(normalizedEnd - normalizedStart, 0)

    state.offset = offset
    state.viewportSize = viewportSize
    state.totalCount = totalCount
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
