export type AxisOrientation = "vertical" | "horizontal"

export interface AxisVirtualizerContext<TMeta> {
  axis: AxisOrientation
  viewportSize: number
  scrollOffset: number
  virtualizationEnabled: boolean
  estimatedItemSize: number
  totalCount: number
  overscan: number
  meta: TMeta
}

export interface AxisVirtualizerInternalContext<TMeta> extends AxisVirtualizerContext<TMeta> {
  visibleCount: number
  poolSize: number
  overscanLeading: number
  overscanTrailing: number
}

export interface AxisVirtualizerRange<TPayload> {
  start: number
  end: number
  payload: TPayload
}

export interface AxisVirtualizerState<TPayload> {
  axis: AxisOrientation
  offset: number
  viewportSize: number
  totalCount: number
  startIndex: number
  endIndex: number
  visibleCount: number
  poolSize: number
  overscanLeading: number
  overscanTrailing: number
  payload: TPayload
}

export interface AxisVirtualizerStrategy<TMeta, TPayload> {
  computeVisibleCount(context: AxisVirtualizerContext<TMeta>): number
  clampScroll(value: number, context: AxisVirtualizerInternalContext<TMeta>): number
  computeRange(
    offset: number,
    context: AxisVirtualizerInternalContext<TMeta>,
    target: AxisVirtualizerRange<TPayload>,
  ): AxisVirtualizerRange<TPayload>
  getOffsetForIndex?(index: number, context: AxisVirtualizerInternalContext<TMeta>): number
}

export interface AxisVirtualizer<TMeta, TPayload> {
  update(context: AxisVirtualizerContext<TMeta>): AxisVirtualizerState<TPayload>
  getState(): AxisVirtualizerState<TPayload>
  getOffsetForIndex(index: number, context: AxisVirtualizerInternalContext<TMeta>): number
  isIndexVisible(index: number): boolean
}

