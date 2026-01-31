export interface Anchor {
  rowIndex: number
  colIndex: number
}

/**
 * Axis-aligned rectangle expressed in grid coordinates.
 * Invariant: startRow <= endRow and startCol <= endCol.
 */
export interface SelectionArea {
  startRow: number
  endRow: number
  startCol: number
  endCol: number
}

export interface Range extends SelectionArea {
  anchor: Anchor
  focus: Anchor
}

export interface SelectionGrid {
  rowCount: number
  colCount: number
}

export interface GridSelectionPointLike<TRowKey = unknown> {
  rowIndex: number
  colIndex: number
  rowId?: TRowKey | null
}

export interface GridSelectionPoint<TRowKey = unknown> extends GridSelectionPointLike<TRowKey> {
  rowId: TRowKey | null
}

export interface GridSelectionRangeInput<TRowKey = unknown> extends SelectionArea {
  anchor?: GridSelectionPointLike<TRowKey>
  focus?: GridSelectionPointLike<TRowKey>
}

/**
 * Normalized selection range with resolved anchor/focus and optional row ids.
 * Consumers treat these objects as read-only snapshots.
 */
export interface GridSelectionRange<TRowKey = unknown> extends SelectionArea {
  anchor: GridSelectionPoint<TRowKey>
  focus: GridSelectionPoint<TRowKey>
  startRowId?: TRowKey | null
  endRowId?: TRowKey | null
}

export interface GridSelectionContext<TRowKey = unknown> {
  grid: SelectionGrid
  getRowIdByIndex?: (rowIndex: number) => TRowKey | null
}
