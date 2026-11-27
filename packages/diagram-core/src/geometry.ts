import type { DiagramAffineTransform, DiagramCardinalDirection, DiagramContentOverrides, DiagramEdge, DiagramEdgeEndpoint, DiagramEntities, DiagramGeometry, DiagramGroup, DiagramId, DiagramMetadata, DiagramOrthogonalRouteOptions, DiagramOrthogonalRouteResult, DiagramPoint, DiagramPort, DiagramPortAnchor, DiagramRect, DiagramTable, DiagramTableCellPadding, DiagramTableCellPosition, DiagramTableCellStyle, DiagramText, DiagramTextMeasurementProvider, DiagramVisualStyle, TransformOrigin } from "./types.js"
import { flattenPathContour, pathContourBoundsPoints, transformPathContour, translatePathContour } from "./pathOperations.js"
import { resolveDiagramStyle } from "./renderStyle.js"
import { cloneDiagramMetadata } from "./metadata.js"

/** Returns an explicit override (including an empty string), or the authoritative value when absent. */
export function resolveDiagramTextContent(overrides: DiagramContentOverrides | undefined, entityId: DiagramId, authoritativeText: string): string {
  return overrides?.textByEntityId?.has(entityId) ? overrides.textByEntityId.get(entityId)! : authoritativeText
}

export function rectIntersects(a: DiagramRect, b: DiagramRect): boolean {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y
}

export function rectContainsPoint(rect: DiagramRect, point: DiagramPoint, radius = 0): boolean {
  return point.x >= rect.x - radius
    && point.x <= rect.x + rect.width + radius
    && point.y >= rect.y - radius
    && point.y <= rect.y + rect.height + radius
}

export function rectFromPoints(points: ReadonlyArray<DiagramPoint>): DiagramRect {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const point of points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  if (!points.length) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function inflateRect(rect: DiagramRect, amount: number): DiagramRect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  }
}

export function rectCenter(rect: DiagramRect): DiagramPoint {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

/** Resolved, render-neutral geometry for the current rectangular table model. */
/** Active logical cell. Covered IDs are retained in the model but are not active visible content while merged. */
export type DiagramTableResolvedCellStyle = Readonly<{ background: string | null; padding: DiagramTableCellPadding; text: DiagramVisualStyle; borders: NonNullable<DiagramTableCellStyle["borders"]>; overflow: "clip" | "visible" | "wrap" }>
export type DiagramTableVisibleCell = Readonly<{ row: number; column: number; anchorCellId: string; rowSpan: number; columnSpan: number; bounds: DiagramRect; contentBounds: DiagramRect; metadata?: DiagramMetadata; coveredCellIds: ReadonlyArray<string>; text: string; lines: ReadonlyArray<string>; linePositions: ReadonlyArray<DiagramPoint>; lineHeight: number; textAnchor: "start" | "middle" | "end"; overflowed: boolean; horizontalAlign: "left" | "center" | "right"; verticalAlign: "top" | "middle" | "bottom"; style: DiagramTableResolvedCellStyle }>
export type DiagramTableGridBoundary = Readonly<{ axis: "horizontal" | "vertical"; start: DiagramPoint; end: DiagramPoint; border: Readonly<{ visible: boolean; color: string; width: number; style: "solid" | "dashed" | "dotted"; ownerCellId?: string }> }>
export type DiagramTableLayout = Readonly<{
  bounds: DiagramRect
  columnBounds: ReadonlyArray<DiagramRect>
  rowBounds: ReadonlyArray<DiagramRect>
  cellBounds: ReadonlyArray<ReadonlyArray<DiagramRect>>
  cellContentBounds: ReadonlyArray<ReadonlyArray<DiagramRect>>
  cellAnchors: ReadonlyArray<ReadonlyArray<DiagramTableCellPosition>>
  visibleCells: ReadonlyArray<DiagramTableVisibleCell>
  gridBoundaries: ReadonlyArray<DiagramTableGridBoundary>
  /** Cumulative local edges; an exact internal edge belongs to the following track. */
  columnEdges: ReadonlyArray<number>
  rowEdges: ReadonlyArray<number>
  expandRange: (start: DiagramTableCellPosition, end: DiagramTableCellPosition) => Readonly<{ start: DiagramTableCellPosition; end: DiagramTableCellPosition }>
}>

/** Resolve all table track, cell, and content bounds in document units. Padding is clamped to avoid negative content geometry. */
export type DiagramTableLayoutOptions = Readonly<{ textMeasurementProvider?: DiagramTextMeasurementProvider; contentOverrides?: DiagramContentOverrides }>

export function resolveDiagramTableLayout(table: DiagramTable, options: DiagramTableLayoutOptions = {}): DiagramTableLayout {
  const columns = table.columnWidths ?? Array(table.columnCount).fill(table.width / table.columnCount) as number[]
  const rows = table.rowHeights ?? Array(table.rowCount).fill(table.height / table.rowCount) as number[]
  const columnBounds = columns.map((width, index) => ({ x: table.x + sumBefore(columns, index), y: table.y, width, height: rows.reduce((sum, value) => sum + value, 0) }))
  const rowBounds = rows.map((height, index) => ({ x: table.x, y: table.y + sumBefore(rows, index), width: columns.reduce((sum, value) => sum + value, 0), height }))
  const cellBounds = rows.map((height, row) => columns.map((width, column) => ({ x: columnBounds[column]!.x, y: rowBounds[row]!.y, width, height })))
  const cellAnchors = rows.map((_, row) => columns.map((_, column) => ({ row, column })))
  const cellIds = table.cells ?? []
  const columnEdges = [table.x]
  for (const width of columns) columnEdges.push(columnEdges[columnEdges.length - 1]! + width)
  const rowEdges = [table.y]
  for (const height of rows) rowEdges.push(rowEdges[rowEdges.length - 1]! + height)
  const idToPosition = new Map<string, DiagramTableCellPosition>()
  cellIds.forEach((line, row) => line.forEach((cell, column) => { if (cell.id) idToPosition.set(cell.id, { row, column }) }))
  const regions = table.merges ?? []
  for (const region of regions) {
    const anchor = idToPosition.get(region.anchorCellId)
    if (!anchor) continue
    const regionBounds = { x: columnBounds[anchor.column]!.x, y: rowBounds[anchor.row]!.y,
      width: columns.slice(anchor.column, anchor.column + region.columnSpan).reduce((sum, value) => sum + value, 0),
      height: rows.slice(anchor.row, anchor.row + region.rowSpan).reduce((sum, value) => sum + value, 0) }
    for (let row = anchor.row; row < anchor.row + region.rowSpan; row += 1) for (let column = anchor.column; column < anchor.column + region.columnSpan; column += 1) {
      cellAnchors[row]![column] = anchor
      cellBounds[row]![column] = regionBounds
    }
  }
  const cellStyles = rows.map((_, row) => columns.map((_, column) => resolveDiagramTableCellStyle(table, row, column)))
  const cellContentBounds = cellBounds.map((line, row) => line.map((cell, column) => {
    const resolvedStyle = cellStyles[row]?.[column]
    if (!resolvedStyle) throw new TypeError(`Invalid table track/style matrix ${rows.length}x${columns.length} at ${row},${column}; styles=${cellStyles.map((entry) => entry.length).join(",")}`)
    return contentBoundsForPadding(cell, resolvedStyle.padding)
  }))
  const visibleCells: DiagramTableVisibleCell[] = []
  for (let row = 0; row < table.rowCount; row += 1) for (let column = 0; column < table.columnCount; column += 1) {
    const anchor = cellAnchors[row]![column]!
    if (anchor.row !== row || anchor.column !== column) continue
    const merge = regions.find((region) => region.anchorCellId === cellIds[row]?.[column]?.id)
    const anchorCellId = cellIds[row]?.[column]?.id ?? `${row}:${column}`
    const coveredCellIds: string[] = []
    if (merge) for (let coveredRow = row; coveredRow < row + merge.rowSpan; coveredRow += 1) for (let coveredColumn = column; coveredColumn < column + merge.columnSpan; coveredColumn += 1) {
      if (coveredRow === row && coveredColumn === column) continue
      coveredCellIds.push(cellIds[coveredRow]?.[coveredColumn]?.id ?? `${coveredRow}:${coveredColumn}`)
    }
    const metadata = cellIds[row]?.[column]?.metadata
    const cell = cellIds[row]?.[column]
    const authoritativeText = cell?.text ?? table.defaultCell?.text ?? ""
    const tableOverrides = options.contentOverrides?.textByTableCellId?.get(table.id)
    const text = cell?.id && tableOverrides?.has(cell.id) ? tableOverrides.get(cell.id)! : authoritativeText
    const horizontalAlign = cell?.horizontalAlign ?? table.defaultCell?.horizontalAlign ?? "left"
    const verticalAlign = cell?.verticalAlign ?? table.defaultCell?.verticalAlign ?? "middle"
    const textLayout = layoutTableCellText(text, cellContentBounds[row]![column]!, cellStyles[row]![column]!, horizontalAlign, verticalAlign, options.textMeasurementProvider)
    visibleCells.push({ row, column, anchorCellId, rowSpan: merge?.rowSpan ?? 1, columnSpan: merge?.columnSpan ?? 1, bounds: cellBounds[row]![column]!, contentBounds: cellContentBounds[row]![column]!, ...(metadata ? { metadata: cloneDiagramMetadata(metadata) } : {}), coveredCellIds, text, ...textLayout, horizontalAlign, verticalAlign, style: cellStyles[row]![column]! })
  }
  const gridBoundaries: DiagramTableGridBoundary[] = []
  for (let column = 1; column < table.columnCount; column += 1) for (let row = 0; row < table.rowCount; row += 1) {
    if (cellAnchors[row]![column - 1]!.row === cellAnchors[row]![column]!.row && cellAnchors[row]![column - 1]!.column === cellAnchors[row]![column]!.column) continue
    const leftAnchor = cellAnchors[row]![column - 1]!, rightAnchor = cellAnchors[row]![column]!
    const leftCell = cellIds[leftAnchor.row]?.[leftAnchor.column], rightCell = cellIds[rightAnchor.row]?.[rightAnchor.column]
    const explicit = leftCell?.style?.borders?.right ? { cell: leftCell, border: leftCell.style.borders.right } : rightCell?.style?.borders?.left ? { cell: rightCell, border: rightCell.style.borders.left } : null
    gridBoundaries.push({ axis: "vertical", start: { x: columnBounds[column]!.x, y: rowBounds[row]!.y }, end: { x: columnBounds[column]!.x, y: rowBounds[row]!.y + rows[row]! }, border: resolvedBoundaryBorder(table, explicit?.border, explicit?.cell.id) })
  }
  for (let row = 1; row < table.rowCount; row += 1) for (let column = 0; column < table.columnCount; column += 1) {
    if (cellAnchors[row - 1]![column]!.row === cellAnchors[row]![column]!.row && cellAnchors[row - 1]![column]!.column === cellAnchors[row]![column]!.column) continue
    const topAnchor = cellAnchors[row - 1]![column]!, bottomAnchor = cellAnchors[row]![column]!
    const topCell = cellIds[topAnchor.row]?.[topAnchor.column], bottomCell = cellIds[bottomAnchor.row]?.[bottomAnchor.column]
    const explicit = topCell?.style?.borders?.bottom ? { cell: topCell, border: topCell.style.borders.bottom } : bottomCell?.style?.borders?.top ? { cell: bottomCell, border: bottomCell.style.borders.top } : null
    gridBoundaries.push({ axis: "horizontal", start: { x: columnBounds[column]!.x, y: rowBounds[row]!.y }, end: { x: columnBounds[column]!.x + columns[column]!, y: rowBounds[row]!.y }, border: resolvedBoundaryBorder(table, explicit?.border, explicit?.cell.id) })
  }
  for (const region of visibleCells) {
    const cell = cellIds[region.row]?.[region.column]
    const sides = cell?.style?.borders
    const { x, y, width, height } = region.bounds
    if (region.row === 0 && sides?.top) gridBoundaries.push({ axis: "horizontal", start: { x, y }, end: { x: x + width, y }, border: resolvedBoundaryBorder(table, sides.top, cell?.id) })
    if (region.column + region.columnSpan === table.columnCount && sides?.right) gridBoundaries.push({ axis: "vertical", start: { x: x + width, y }, end: { x: x + width, y: y + height }, border: resolvedBoundaryBorder(table, sides.right, cell?.id) })
    if (region.row + region.rowSpan === table.rowCount && sides?.bottom) gridBoundaries.push({ axis: "horizontal", start: { x, y: y + height }, end: { x: x + width, y: y + height }, border: resolvedBoundaryBorder(table, sides.bottom, cell?.id) })
    if (region.column === 0 && sides?.left) gridBoundaries.push({ axis: "vertical", start: { x, y }, end: { x, y: y + height }, border: resolvedBoundaryBorder(table, sides.left, cell?.id) })
  }
  const expandRange = (start: DiagramTableCellPosition, end: DiagramTableCellPosition) => {
    let minRow = Math.min(start.row, end.row), maxRow = Math.max(start.row, end.row)
    let minColumn = Math.min(start.column, end.column), maxColumn = Math.max(start.column, end.column)
    let changed = true
    while (changed) {
      changed = false
      for (const region of regions) {
        const anchor = idToPosition.get(region.anchorCellId)
        if (!anchor || anchor.row > maxRow || anchor.row + region.rowSpan - 1 < minRow || anchor.column > maxColumn || anchor.column + region.columnSpan - 1 < minColumn) continue
        const nextMinRow = Math.min(minRow, anchor.row), nextMaxRow = Math.max(maxRow, anchor.row + region.rowSpan - 1)
        const nextMinColumn = Math.min(minColumn, anchor.column), nextMaxColumn = Math.max(maxColumn, anchor.column + region.columnSpan - 1)
        changed ||= nextMinRow !== minRow || nextMaxRow !== maxRow || nextMinColumn !== minColumn || nextMaxColumn !== maxColumn
        minRow = nextMinRow; maxRow = nextMaxRow; minColumn = nextMinColumn; maxColumn = nextMaxColumn
      }
    }
    return { start: { row: minRow, column: minColumn }, end: { row: maxRow, column: maxColumn } }
  }
  return { bounds: { x: table.x, y: table.y, width: columns.reduce((sum, value) => sum + value, 0), height: rows.reduce((sum, value) => sum + value, 0) }, columnBounds, rowBounds, cellBounds, cellContentBounds, cellAnchors, visibleCells, gridBoundaries, columnEdges, rowEdges, expandRange }
}

function resolvedBoundaryBorder(table: DiagramTable, explicit?: NonNullable<DiagramTableCellStyle["borders"]>["top"], ownerCellId?: string): DiagramTableGridBoundary["border"] {
  const base = table.style?.grid?.stroke ?? { color: "#d1d5db", width: 1, style: "solid" as const }
  return { visible: explicit ? explicit.visible : table.style?.grid?.visible ?? true, color: explicit?.stroke?.color ?? base.color, width: explicit?.stroke?.width ?? base.width, style: explicit?.stroke?.style ?? base.style, ...(ownerCellId ? { ownerCellId } : {}) }
}

/** Resolve table defaults with the active cell override. Row/column defaults are not represented by the current table model. */
export function resolveDiagramTableCellStyle(table: DiagramTable, row: number, column: number): DiagramTableResolvedCellStyle {
  const cell = table.cells?.[row]?.[column] ?? table.defaultCell
  const override = cell?.style
  const defaultPadding = table.style?.cellPadding ?? 8
  const padding: DiagramTableCellPadding = {
    top: override?.padding?.top ?? defaultPadding,
    right: override?.padding?.right ?? defaultPadding,
    bottom: override?.padding?.bottom ?? defaultPadding,
    left: override?.padding?.left ?? defaultPadding,
  }
  return {
    background: override && Object.prototype.hasOwnProperty.call(override, "background") ? override.background ?? null : table.style?.background ?? null,
    padding,
    text: { ...(table.style?.text ?? {}), ...(override?.text ?? {}) },
    borders: { ...(override?.borders ?? {}) },
    overflow: override?.overflow ?? table.style?.overflow ?? "clip",
  }
}

function layoutTableCellText(text: string, content: DiagramRect, style: DiagramTableResolvedCellStyle, horizontalAlign: "left" | "center" | "right", verticalAlign: "top" | "middle" | "bottom", provider?: DiagramTextMeasurementProvider): { lines: ReadonlyArray<string>; linePositions: ReadonlyArray<DiagramPoint>; lineHeight: number; textAnchor: "start" | "middle" | "end"; overflowed: boolean } {
  const fontSize = style.text.fontSize ?? 14
  const fallbackMeasure = (line: string) => Array.from(line).reduce((width, character) => width + (character.codePointAt(0)! > 0xff ? fontSize : fontSize * 0.56), 0)
  const metric = (line: string) => {
    if (!provider) return { width: fallbackMeasure(line), lineHeight: fontSize * 1.2, ascent: fontSize * 0.8, descent: fontSize * 0.2 }
    const result = provider.measureText(line, style.text)
    if (![result.width, result.lineHeight, result.ascent ?? 0, result.descent ?? 0].every(Number.isFinite) || result.width < 0 || result.lineHeight <= 0) throw new TypeError("Text measurement provider returned invalid metrics")
    return { width: result.width, lineHeight: result.lineHeight, ascent: result.ascent ?? fontSize * 0.8, descent: result.descent ?? fontSize * 0.2 }
  }
  const measure = (line: string) => metric(line).width
  const explicitLines = text.split("\n")
  const lines = style.overflow === "wrap" ? explicitLines.flatMap((line) => wrapTableLine(line, content.width, measure)) : explicitLines
  const sample = metric("Mg")
  const lineHeight = sample.lineHeight
  const lineBlockHeight = lines.length * lineHeight
  const anchorX = horizontalAlign === "left" ? content.x : horizontalAlign === "right" ? content.x + content.width : content.x + content.width / 2
  const textAnchor = horizontalAlign === "left" ? "start" : horizontalAlign === "right" ? "end" : "middle"
  const firstY = verticalAlign === "top"
    ? content.y + sample.ascent
    : verticalAlign === "bottom"
      ? content.y + content.height - lineBlockHeight + sample.ascent
      : content.y + (content.height - lineBlockHeight) / 2 + sample.ascent
  const linePositions = lines.map((_, index) => ({ x: anchorX, y: firstY + index * lineHeight }))
  const overflowed = text.length > 0 && (lines.some((line) => measure(line) > content.width + 1e-9) || lineBlockHeight > content.height + 1e-9)
  return { lines, linePositions, lineHeight, textAnchor, overflowed }
}

function wrapTableLine(line: string, maxWidth: number, measure: (text: string) => number): string[] {
  if (!line || maxWidth <= 0) return [line]
  const result: string[] = []
  let current = ""
  for (const word of line.split(/(\s+)/).filter(Boolean)) {
    if (current && measure(current + word) <= maxWidth) { current += word; continue }
    if (!current && measure(word) <= maxWidth) { current = word; continue }
    if (current) result.push(current.trimEnd())
    current = ""
    if (measure(word) <= maxWidth) current = word.trimStart()
    else {
      for (const character of Array.from(word)) {
        if (current && measure(current + character) > maxWidth) { result.push(current); current = "" }
        current += character
      }
    }
  }
  result.push(current.trimEnd())
  return result
}

function contentBoundsForPadding(cell: DiagramRect, padding: DiagramTableCellPadding): DiagramRect {
  const horizontalTotal = padding.left + padding.right
  const horizontalScale = horizontalTotal > cell.width && horizontalTotal > 0 ? cell.width / horizontalTotal : 1
  const verticalTotal = padding.top + padding.bottom
  const verticalScale = verticalTotal > cell.height && verticalTotal > 0 ? cell.height / verticalTotal : 1
  const left = padding.left * horizontalScale, right = padding.right * horizontalScale
  const top = padding.top * verticalScale, bottom = padding.bottom * verticalScale
  return { x: cell.x + left, y: cell.y + top, width: Math.max(0, cell.width - left - right), height: Math.max(0, cell.height - top - bottom) }
}

function sumBefore(values: ReadonlyArray<number>, index: number): number {
  let total = 0
  for (let i = 0; i < index; i += 1) total += values[i]!
  return total
}

export function distance(a: DiagramPoint, b: DiagramPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Routes an orthogonal connector through an exact rectilinear visibility grid (not a raster approximation). */
export function routeOrthogonalConnector(source: DiagramPoint, target: DiagramPoint, options: DiagramOrthogonalRouteOptions = {}): DiagramOrthogonalRouteResult {
  const requestedTerminalLead = options.terminalLead ?? 12
  const requestedClearance = options.clearance ?? 0
  const requestedWaypoints = [...(options.waypoints ?? []), ...(options.routeHint ? [options.routeHint] : [])]
  const strictSize = options.strictGrid === true ? options.gridSize : undefined
  if (options.strictGrid && (!Number.isFinite(strictSize) || strictSize! <= 0)) throw new RangeError("Strict-grid connector routing requires a positive finite gridSize")
  const grid = options.strictGrid ? strictSize! : undefined
  const snap = (value: number) => grid ? Math.round(value / grid) * grid : value
  const floor = (value: number) => grid ? Math.floor(value / grid) * grid : value
  const ceil = (value: number) => grid ? Math.ceil(value / grid) * grid : value
  const routeSource = source
  const routeTarget = target
  const terminalLead = grid ? ceil(requestedTerminalLead) : requestedTerminalLead
  const clearance = grid ? ceil(requestedClearance) : requestedClearance
  const waypoints = grid ? requestedWaypoints.map((point) => ({ x: snap(point.x), y: snap(point.y) })) : requestedWaypoints
  const validDirection = (direction: DiagramOrthogonalRouteOptions["sourceDirection"]) => direction === undefined || ["north", "east", "south", "west"].includes(direction)
  const validObstacle = (obstacle: NonNullable<DiagramOrthogonalRouteOptions["obstacles"]>[number]) => obstacle.bounds.width >= 0 && obstacle.bounds.height >= 0
  const existingRoutes = options.existingRoutes ?? []
  if (![source.x, source.y, target.x, target.y, requestedTerminalLead, requestedClearance, strictSize ?? 1, ...requestedWaypoints.flatMap((point) => [point.x, point.y]), ...(options.obstacles ?? []).flatMap(({ bounds }) => [bounds.x, bounds.y, bounds.width, bounds.height]), ...existingRoutes.flatMap((route) => route.points.flatMap((point) => [point.x, point.y]))].every(Number.isFinite)
    || requestedTerminalLead < 0 || requestedClearance < 0
    || (options.maxBends !== undefined && (!Number.isInteger(options.maxBends) || options.maxBends < 0))
    || (options.maxRouteBends !== undefined && (!Number.isInteger(options.maxRouteBends) || options.maxRouteBends < 0))
    || (options.firstAxis !== undefined && options.firstAxis !== "horizontal" && options.firstAxis !== "vertical")
    || (options.mode !== undefined && options.mode !== "auto" && options.mode !== "manual")
    || !validDirection(options.sourceDirection) || !validDirection(options.targetDirection)
    || (options.tieBreak !== undefined && !["coordinates", "horizontal-first", "vertical-first"].includes(options.tieBreak))
    || (options.obstacles ?? []).some((obstacle) => !validObstacle(obstacle))) {
    throw new RangeError("Connector points, clearance, and terminal lead must be finite; clearance and lead must be non-negative")
  }
  if (options.strategy === "simple") return routeSimpleOrthogonalConnector(source, target, options)
  const dx = routeTarget.x - routeSource.x, dy = routeTarget.y - routeSource.y
  const inferredAxis = Math.abs(dx) >= Math.abs(dy) ? "horizontal" : "vertical"
  const firstAxis = options.firstAxis ?? axisForDirection(options.sourceDirection) ?? inferredAxis
  const sourceDirection = options.sourceDirection ?? axisDirection(firstAxis, dx, dy, false)
  const targetDirection = options.targetDirection ?? sourceDirection
  const sourceStub = offsetInDirection(routeSource, sourceDirection, terminalLead)
  const targetStub = offsetInDirection(routeTarget, oppositeDirection(targetDirection), terminalLead)
  const obstacles = (options.obstacles ?? []).map(({ bounds }) => {
    const inflated = inflateRect(bounds, clearance)
    if (!grid) return inflated
    const left = floor(inflated.x), top = floor(inflated.y)
    const right = ceil(inflated.x + inflated.width), bottom = ceil(inflated.y + inflated.height)
    return { x: left, y: top, width: right - left, height: bottom - top }
  })
  if (obstacles.some((obstacle) => segmentCrossesRectInterior(routeSource, sourceStub, obstacle) || segmentCrossesRectInterior(targetStub, routeTarget, obstacle))) {
    return { points: [], path: [], firstAxis, diagnostics: [{ code: "escape-direction-conflict", message: "A terminal lead crosses an inflated obstacle; adjust the escape direction or clearance." }] }
  }
  const stops = [sourceStub, ...waypoints, targetStub]
  const routed: DiagramPoint[] = [routeSource, sourceStub]
  const diagnostics: DiagramOrthogonalRouteResult["diagnostics"][number][] = []
  let usedBends = 0
  for (let index = 0; index < stops.length - 1; index += 1) {
    const start = stops[index]!, end = stops[index + 1]!
    const remainingBends = options.maxBends === undefined ? undefined : Math.max(0, options.maxBends - usedBends)
    const route = routeVisibilityLeg(start, end, obstacles, options.existingRoutes, undefined, undefined, options.tieBreak, remainingBends)
    if (!route) {
      const withoutBendCap = options.maxBends === undefined ? null : routeOrthogonalConnector(routeSource, routeTarget, { ...options, maxBends: undefined })
      const bendCapRejected = Boolean(withoutBendCap?.path.length && !withoutBendCap.diagnostics.some((entry) => entry.code === "no-route" || entry.code === "escape-direction-conflict" || entry.code === "waypoint-blocked"))
      diagnostics.push(bendCapRejected
        ? { code: "bend-limit", message: `No collision-free orthogonal route satisfies maxBends=${options.maxBends}.` }
        : { code: index === 0 ? "escape-direction-conflict" : waypoints.length ? "waypoint-blocked" : "no-route", message: "No collision-free orthogonal route satisfies the endpoint, waypoint, and obstacle constraints." })
      return { points: [], path: [], firstAxis, diagnostics }
    }
    routed.push(...route.slice(1))
    usedBends += countOrthogonalBends(route)
  }
  routed.push(routeTarget)
  const path = dedupeAdjacentPoints(routed)
  if (options.maxRouteBends !== undefined && countOrthogonalBends(path) > options.maxRouteBends) {
    return { points: [], path: [], firstAxis, diagnostics: [{ code: "bend-limit", message: `No collision-free orthogonal route satisfies maxRouteBends=${options.maxRouteBends}.` }] }
  }
  if (distance(sourceStub, targetStub) < terminalLead * 2 && terminalLead > 0) diagnostics.push({ code: "terminal-leads-overlap", message: "Terminal lead segments overlap or reverse; reduce terminalLead or adjust the escape directions." })
  return { points: path.slice(1, -1), path, firstAxis, diagnostics }
}

/** Small deterministic route-family solver used by interactive connectors. It never scans obstacles. */
export function routeSimpleOrthogonalConnector(source: DiagramPoint, target: DiagramPoint, options: DiagramOrthogonalRouteOptions = {}): DiagramOrthogonalRouteResult {
  const waypoints = [...(options.waypoints ?? [])]
  const stops = [source, ...waypoints, target]
  const path: DiagramPoint[] = []
  for (let leg = 0; leg < stops.length - 1; leg += 1) {
    const start = stops[leg]!, end = stops[leg + 1]!
    const startDirection = leg === 0 ? options.sourceDirection : undefined
    const endDirection = leg === stops.length - 2 ? options.targetDirection : undefined
    const preserveHint = options.routeHint && !(waypoints.length === 0 && (source.x === target.x || source.y === target.y)) ? options.routeHint : undefined
    const candidates = simpleLegCandidates(start, end, startDirection, endDirection, options.firstAxis, options.terminalLead ?? 0, leg === 0 ? preserveHint : undefined)
    const candidate = candidates.find((points) => options.maxBends === undefined || countOrthogonalBends(points) <= options.maxBends!)
    if (!candidate) {
      const axis = Math.abs(target.x - source.x) >= Math.abs(target.y - source.y) ? "horizontal" : "vertical"
      const code = options.maxBends !== undefined && simpleLegCandidates(start, end, startDirection, endDirection, options.firstAxis, options.terminalLead ?? 0).length
        ? "bend-limit" : "no-route"
      return { points: [], path: [], firstAxis: axis, diagnostics: [{ code, message: "No simple orthogonal route satisfies the endpoint directions and constraints." }] }
    }
    path.push(...(leg ? candidate.slice(1) : candidate))
  }
  const normalized = normalizeOrthogonalRoute(path)
  if (!normalized || (options.maxBends !== undefined && countOrthogonalBends(normalized) > options.maxBends) || (options.maxRouteBends !== undefined && countOrthogonalBends(normalized) > options.maxRouteBends)) {
    const axis = Math.abs(target.x - source.x) >= Math.abs(target.y - source.y) ? "horizontal" : "vertical"
    const bendLimit = options.maxBends !== undefined && countOrthogonalBends(normalized ?? []) > options.maxBends || options.maxRouteBends !== undefined && countOrthogonalBends(normalized ?? []) > options.maxRouteBends
    return { points: [], path: [], firstAxis: axis, diagnostics: [{ code: bendLimit ? "bend-limit" : "no-route", message: "The normalized route violates an orthogonal routing constraint." }] }
  }
  const firstAxis = normalized.length < 2 || Math.abs(normalized[1]!.x - normalized[0]!.x) >= Math.abs(normalized[1]!.y - normalized[0]!.y) ? "horizontal" : "vertical"
  return { points: normalized.slice(1, -1), path: normalized, firstAxis, diagnostics: [] }
}

/** Shared boundary for route normalization and the Core orthogonality invariant. */
export function normalizeOrthogonalRoute(points: ReadonlyArray<DiagramPoint>, tolerance = 1e-7): DiagramPoint[] | null {
  if (!points.length || points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null
  const result: DiagramPoint[] = []
  for (const point of points) {
    const previous = result[result.length - 1]
    if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) <= tolerance) continue
    if (previous && Math.abs(point.x - previous.x) > tolerance && Math.abs(point.y - previous.y) > tolerance) return null
    while (result.length >= 2) {
      const a = result[result.length - 2]!, b = result[result.length - 1]!
      const horizontal = Math.abs(a.y - b.y) <= tolerance && Math.abs(b.y - point.y) <= tolerance
      const vertical = Math.abs(a.x - b.x) <= tolerance && Math.abs(b.x - point.x) <= tolerance
      if (!horizontal && !vertical) break
      const reversal = horizontal
        ? (b.x - a.x) * (point.x - b.x) < -tolerance * tolerance
        : (b.y - a.y) * (point.y - b.y) < -tolerance * tolerance
      if (reversal) return null
      result.pop()
    }
    result.push(point)
  }
  return result
}

/** Keeps manually owned orthogonal interior points fixed while repairing changed endpoint legs. */
export function resolveManualOrthogonalPath(source: DiagramPoint, points: ReadonlyArray<DiagramPoint>, target: DiagramPoint): DiagramPoint[] | null {
  if (![source, ...points, target].every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))) return null
  const interior = points.map((point) => ({ ...point }))
  if (interior.length > 1) {
    const first = interior[0]!, next = interior[1]!
    if (source.x !== first.x && source.y !== first.y) {
      if (first.x === next.x) first.y = source.y
      else if (first.y === next.y) first.x = source.x
    }
    const last = interior[interior.length - 1]!, previous = interior[interior.length - 2]!
    if (last.x !== target.x && last.y !== target.y) {
      if (previous.x === last.x) last.y = target.y
      else if (previous.y === last.y) last.x = target.x
    }
  }
  const route = [source, ...interior, target]
  if (route.length < 2) return null
  const adjusted: DiagramPoint[] = [route[0]!]
  for (let index = 1; index < route.length; index += 1) {
    const previous = adjusted[adjusted.length - 1]!, next = route[index]!
    if (Math.abs(previous.x - next.x) > 1e-7 && Math.abs(previous.y - next.y) > 1e-7) {
      const corner = index === 1 ? { x: next.x, y: previous.y }
        : index === route.length - 1 ? { x: previous.x, y: next.y }
          : { x: next.x, y: previous.y }
      adjusted.push(corner)
    }
    adjusted.push(next)
  }
  return normalizeOrthogonalRoute(adjusted)
}

function simpleLegCandidates(start: DiagramPoint, end: DiagramPoint, sourceDirection?: DiagramOrthogonalRouteOptions["sourceDirection"], targetDirection?: DiagramOrthogonalRouteOptions["targetDirection"], firstAxis?: DiagramOrthogonalRouteOptions["firstAxis"], lead = 0, preferred?: DiagramPoint): DiagramPoint[][] {
  if (sameRoutePoint(start, end)) return sourceDirection || targetDirection ? [] : [[start, end]]
  const sourceStub = sourceDirection && lead > 0 ? offsetInDirection(start, sourceDirection, lead) : start
  const targetStub = targetDirection && lead > 0 ? offsetInDirection(end, oppositeDirection(targetDirection), lead) : end
  const sx = sourceStub.x, sy = sourceStub.y, tx = targetStub.x, ty = targetStub.y
  const candidates: DiagramPoint[][] = []
  if (sx === tx || sy === ty) candidates.push([start, ...(sourceStub === start ? [] : [sourceStub]), ...(targetStub === end ? [] : [targetStub]), end])
  candidates.push([start, { x: tx, y: sy }, end], [start, { x: sx, y: ty }, end])
  if (preferred && !sameRoutePoint(preferred, start) && !sameRoutePoint(preferred, end)) {
    candidates.push([start, preferred, { x: preferred.x, y: end.y }, end], [start, preferred, { x: end.x, y: preferred.y }, end])
  }
  const middleX = (sx + tx) / 2, middleY = (sy + ty) / 2
  candidates.push([start, ...(sourceStub === start ? [] : [sourceStub]), { x: middleX, y: sy }, { x: middleX, y: ty }, ...(targetStub === end ? [] : [targetStub]), end])
  candidates.push([start, ...(sourceStub === start ? [] : [sourceStub]), { x: sx, y: middleY }, { x: tx, y: middleY }, ...(targetStub === end ? [] : [targetStub]), end])
  const margin = Math.max(lead, Math.min(Math.abs(tx - sx), Math.abs(ty - sy), 24), 12)
  for (const laneX of [Math.min(sx, tx) - margin, Math.max(sx, tx) + margin]) candidates.push([start, ...(sourceStub === start ? [] : [sourceStub]), { x: laneX, y: sy }, { x: laneX, y: ty }, ...(targetStub === end ? [] : [targetStub]), end])
  for (const laneY of [Math.min(sy, ty) - margin, Math.max(sy, ty) + margin]) candidates.push([start, ...(sourceStub === start ? [] : [sourceStub]), { x: sx, y: laneY }, { x: tx, y: laneY }, ...(targetStub === end ? [] : [targetStub]), end])
  // When both terminals require horizontal travel, endpoint order can make every direct/L/Z/U family
  // violate one terminal. Add the smallest deterministic perimeter detour so the simple router still
  // returns a legal orthogonal route instead of an empty path when a connected host crosses past the other.
  if (sourceDirection && targetDirection && (sourceDirection === "east" || sourceDirection === "west") && (targetDirection === "east" || targetDirection === "west")) {
    const sourceSign = sourceDirection === "east" ? 1 : -1
    const escapeX = sx + sourceSign * margin
    for (const laneY of [Math.min(sy, ty) - margin, Math.max(sy, ty) + margin]) {
      candidates.push([start, ...(sourceStub === start ? [] : [sourceStub]), { x: escapeX, y: sy }, { x: escapeX, y: laneY }, { x: tx, y: laneY }, ...(targetStub === end ? [] : [targetStub]), end])
    }
  }
  if (sourceDirection && targetDirection && (sourceDirection === "north" || sourceDirection === "south") && (targetDirection === "north" || targetDirection === "south")) {
    const sourceSign = sourceDirection === "south" ? 1 : -1
    const escapeY = sy + sourceSign * margin
    for (const laneX of [Math.min(sx, tx) - margin, Math.max(sx, tx) + margin]) {
      candidates.push([start, ...(sourceStub === start ? [] : [sourceStub]), { x: sx, y: escapeY }, { x: laneX, y: escapeY }, { x: laneX, y: ty }, ...(targetStub === end ? [] : [targetStub]), end])
    }
  }
  const valid = candidates.flatMap((candidate) => {
    const normalized = normalizeOrthogonalRoute(candidate)
    return normalized && !hasCollinearBacktrack(normalized) && routeDirectionsMatch(normalized, sourceDirection, targetDirection) ? [normalized] : []
  })
  const unique = new Map(valid.map((candidate) => [candidate.map(pointKey).join(";"), candidate]))
  return [...unique.values()].sort((a, b) => {
    const aKeepsHint = Boolean(preferred && a.some((point) => sameRoutePoint(point, preferred)))
    const bKeepsHint = Boolean(preferred && b.some((point) => sameRoutePoint(point, preferred)))
    return Number(bKeepsHint) - Number(aKeepsHint)
      || countOrthogonalBends(a) - countOrthogonalBends(b)
      || routeLength(a) - routeLength(b)
      || (firstAxis === "vertical" ? routeFirstAxis(a) === "vertical" ? -1 : 1 : routeFirstAxis(a) === "horizontal" ? -1 : 1)
      || a.map(pointKey).join(";").localeCompare(b.map(pointKey).join(";"))
  })
}

function hasCollinearBacktrack(path: ReadonlyArray<DiagramPoint>): boolean {
  for (let index = 1; index < path.length - 1; index += 1) {
    const before = path[index - 1]!, current = path[index]!, after = path[index + 1]!
    const incoming = { x: current.x - before.x, y: current.y - before.y }
    const outgoing = { x: after.x - current.x, y: after.y - current.y }
    if ((incoming.x !== 0 && outgoing.x !== 0 && Math.sign(incoming.x) !== Math.sign(outgoing.x))
      || (incoming.y !== 0 && outgoing.y !== 0 && Math.sign(incoming.y) !== Math.sign(outgoing.y))) return true
  }
  return false
}

function routeDirectionsMatch(path: ReadonlyArray<DiagramPoint>, sourceDirection?: DiagramOrthogonalRouteOptions["sourceDirection"], targetDirection?: DiagramOrthogonalRouteOptions["targetDirection"]): boolean {
  const first = path.find((point, index) => index > 0 && !sameRoutePoint(path[index - 1]!, point))
  let lastIndex = path.length - 2
  while (lastIndex >= 0 && sameRoutePoint(path[lastIndex]!, path[path.length - 1]!)) lastIndex -= 1
  const firstSegment = first ? { x: first.x - path[0]!.x, y: first.y - path[0]!.y } : null
  const lastSegment = lastIndex >= 0 ? { x: path[path.length - 1]!.x - path[lastIndex]!.x, y: path[path.length - 1]!.y - path[lastIndex]!.y } : null
  const matches = (vector: DiagramPoint | null, direction?: DiagramOrthogonalRouteOptions["sourceDirection"]) => !direction || Boolean(vector && (direction === "east" ? vector.x > 0 && vector.y === 0 : direction === "west" ? vector.x < 0 && vector.y === 0 : direction === "south" ? vector.y > 0 && vector.x === 0 : vector.y < 0 && vector.x === 0))
  return matches(firstSegment, sourceDirection) && matches(lastSegment, targetDirection)
}

function routeFirstAxis(path: ReadonlyArray<DiagramPoint>): "horizontal" | "vertical" { return Math.abs(path[1]!.x - path[0]!.x) >= Math.abs(path[1]!.y - path[0]!.y) ? "horizontal" : "vertical" }
function routeLength(path: ReadonlyArray<DiagramPoint>): number { return path.slice(1).reduce((sum, point, index) => sum + distance(path[index]!, point), 0) }
function sameRoutePoint(a: DiagramPoint, b: DiagramPoint): boolean { return Math.abs(a.x - b.x) <= 1e-7 && Math.abs(a.y - b.y) <= 1e-7 }

function countOrthogonalBends(points: ReadonlyArray<DiagramPoint>): number {
  let bends = 0
  let previousAxis: "x" | "y" | null = null
  for (let index = 1; index < points.length; index += 1) {
    const first = points[index - 1]!, second = points[index]!
    if (Math.abs(first.x - second.x) <= 1e-9 && Math.abs(first.y - second.y) <= 1e-9) continue
    const axis = Math.abs(first.x - second.x) > 1e-9 ? "x" : "y"
    if (previousAxis && previousAxis !== axis) bends += 1
    previousAxis = axis
  }
  return bends
}

type RouteState = { node: number; axis: 0 | 1 | 2; firstAxis: 0 | 1 | 2; bends: number; length: number; crossings: number; previous: RouteState | null }

function routeVisibilityLeg(start: DiagramPoint, end: DiagramPoint, obstacles: ReadonlyArray<DiagramRect>, existingRoutes: DiagramOrthogonalRouteOptions["existingRoutes"] = [], startDirection?: DiagramOrthogonalRouteOptions["sourceDirection"], endDirection?: DiagramOrthogonalRouteOptions["targetDirection"], tieBreak: DiagramOrthogonalRouteOptions["tieBreak"] = "coordinates", maxBends?: number): DiagramPoint[] | null {
  const xs = [...new Set([start.x, end.x, ...obstacles.flatMap((rect) => [rect.x, rect.x + rect.width])])].sort((a, b) => a - b)
  const ys = [...new Set([start.y, end.y, ...obstacles.flatMap((rect) => [rect.y, rect.y + rect.height])])].sort((a, b) => a - b)
  const points: DiagramPoint[] = []
  const indexByKey = new Map<string, number>()
  for (const y of ys) for (const x of xs) {
    const point = { x, y }
    if (obstacles.some((rect) => rectContainsPoint(rect, point, -1e-8))) continue
    indexByKey.set(pointKey(point), points.length); points.push(point)
  }
  const startIndex = indexByKey.get(pointKey(start)), endIndex = indexByKey.get(pointKey(end))
  if (startIndex === undefined || endIndex === undefined) return null
  const adjacency: Array<Array<{ node: number; axis: 1 | 2; length: number }>> = points.map(() => [])
  const rows = new Map<number, number[]>(), columns = new Map<number, number[]>()
  points.forEach((point, index) => {
    const row = rows.get(point.y) ?? []; row.push(index); rows.set(point.y, row)
    const column = columns.get(point.x) ?? []; column.push(index); columns.set(point.x, column)
  })
  const connectAdjacent = (sets: Map<number, number[]>, axis: 1 | 2) => {
    for (const entries of sets.values()) {
      entries.sort((a, b) => axis === 1 ? points[a]!.x - points[b]!.x : points[a]!.y - points[b]!.y)
      for (let index = 1; index < entries.length; index += 1) {
        const a = entries[index - 1]!, b = entries[index]!, pa = points[a]!, pb = points[b]!
        if (obstacles.some((rect) => segmentCrossesRectInterior(pa, pb, rect))) continue
        const length = distance(pa, pb)
        adjacency[a]!.push({ node: b, axis, length }); adjacency[b]!.push({ node: a, axis, length })
      }
    }
  }
  connectAdjacent(rows, 1); connectAdjacent(columns, 2)
  const initialAxis = directionAxis(startDirection), requiredEndAxis = directionAxis(endDirection)
  const initial: RouteState = { node: startIndex, axis: initialAxis, firstAxis: 0, bends: 0, length: 0, crossings: 0, previous: null }
  const best = new Map<string, RouteState>([[`${startIndex}:${initialAxis}`, initial]])
  const pending: RouteState[] = []
  pushRouteState(pending, initial, tieBreak)
  while (pending.length) {
    const current = popRouteState(pending, tieBreak)!
    if (best.get(`${current.node}:${current.axis}`) !== current) continue
    if (current.node === endIndex && (!requiredEndAxis || current.axis === requiredEndAxis)) {
      const route: DiagramPoint[] = []
      for (let item: RouteState | null = current; item; item = item.previous) route.push(points[item.node]!)
      route.reverse()
      return simplifyOrthogonalPath(route)
    }
    for (const next of adjacency[current.node]!) {
      const from = points[current.node]!, to = points[next.node]!
      if ((current.node === startIndex && startDirection && (next.axis !== initialAxis || !matchesDirection(from, to, startDirection)))
        || (next.node === endIndex && requiredEndAxis && (next.axis !== requiredEndAxis || !matchesDirection(from, to, endDirection!)))) continue
      const state: RouteState = { node: next.node, axis: next.axis, firstAxis: current.firstAxis || next.axis, bends: current.bends + (current.axis !== 0 && current.axis !== next.axis ? 1 : 0), length: current.length + next.length, crossings: current.crossings + countRouteCrossings(from, to, existingRoutes), previous: current }
      if (maxBends !== undefined && state.bends > maxBends) continue
      const key = `${state.node}:${state.axis}`, existing = best.get(key)
      if (!existing || compareRouteStates(state, existing, tieBreak) < 0) { best.set(key, state); pushRouteState(pending, state, tieBreak) }
    }
  }
  return null
}

function pushRouteState(heap: RouteState[], value: RouteState, tieBreak: DiagramOrthogonalRouteOptions["tieBreak"]): void {
  let index = heap.length; heap.push(value)
  while (index > 0) {
    const parent = (index - 1) >> 1
    if (compareRouteStates(heap[parent]!, value, tieBreak) <= 0) break
    heap[index] = heap[parent]!; index = parent
  }
  heap[index] = value
}

function popRouteState(heap: RouteState[], tieBreak: DiagramOrthogonalRouteOptions["tieBreak"]): RouteState | undefined {
  const first = heap[0], last = heap.pop()
  if (!first || !last || !heap.length) return first
  let index = 0
  while (true) {
    const left = index * 2 + 1, right = left + 1
    if (left >= heap.length) break
    let child = left
    if (right < heap.length && compareRouteStates(heap[right]!, heap[left]!, tieBreak) < 0) child = right
    if (compareRouteStates(last, heap[child]!, tieBreak) <= 0) break
    heap[index] = heap[child]!; index = child
  }
  heap[index] = last
  return first
}

function compareRouteStates(a: RouteState, b: RouteState, tieBreak: DiagramOrthogonalRouteOptions["tieBreak"]): number {
  const directionPreference = tieBreak === "vertical-first" ? 2 : 1
  const firstAxisTie = (a.firstAxis === directionPreference ? 0 : 1) - (b.firstAxis === directionPreference ? 0 : 1)
  return a.bends - b.bends || a.length - b.length || a.crossings - b.crossings || firstAxisTie || a.axis - b.axis || a.node - b.node
}

function countRouteCrossings(start: DiagramPoint, end: DiagramPoint, routes: NonNullable<DiagramOrthogonalRouteOptions["existingRoutes"]>): number {
  let crossings = 0
  for (const route of routes) for (let index = 0; index < route.points.length - 1; index += 1) {
    const a = route.points[index]!, b = route.points[index + 1]!
    if (start.y === end.y && a.x === b.x && start.y > Math.min(a.y, b.y) && start.y < Math.max(a.y, b.y) && a.x > Math.min(start.x, end.x) && a.x < Math.max(start.x, end.x)) crossings += 1
    else if (start.x === end.x && a.y === b.y && start.x > Math.min(a.x, b.x) && start.x < Math.max(a.x, b.x) && a.y > Math.min(start.y, end.y) && a.y < Math.max(start.y, end.y)) crossings += 1
  }
  return crossings
}

function segmentCrossesRectInterior(a: DiagramPoint, b: DiagramPoint, rect: DiagramRect): boolean {
  if (a.y === b.y) return a.y > rect.y + 1e-8 && a.y < rect.y + rect.height - 1e-8 && Math.max(Math.min(a.x, b.x), rect.x) < Math.min(Math.max(a.x, b.x), rect.x + rect.width) - 1e-8
  if (a.x === b.x) return a.x > rect.x + 1e-8 && a.x < rect.x + rect.width - 1e-8 && Math.max(Math.min(a.y, b.y), rect.y) < Math.min(Math.max(a.y, b.y), rect.y + rect.height) - 1e-8
  return true
}

function simplifyOrthogonalPath(points: ReadonlyArray<DiagramPoint>): DiagramPoint[] {
  const result: DiagramPoint[] = []
  for (const point of points) {
    if (result.length && pointKey(result[result.length - 1]!) === pointKey(point)) continue
    while (result.length >= 2) {
      const a = result[result.length - 2]!, b = result[result.length - 1]!
      const collinear = (a.x === b.x && b.x === point.x) || (a.y === b.y && b.y === point.y)
      const reversal = (a.x === b.x && b.x === point.x && (b.y - a.y) * (point.y - b.y) < 0) || (a.y === b.y && b.y === point.y && (b.x - a.x) * (point.x - b.x) < 0)
      if (!collinear || reversal) break
      result.pop()
    }
    result.push(point)
  }
  return result
}

function pointKey(point: DiagramPoint): string { return `${point.x}\u0000${point.y}` }
function directionAxis(direction?: DiagramOrthogonalRouteOptions["sourceDirection"]): 0 | 1 | 2 { return !direction ? 0 : direction === "east" || direction === "west" ? 1 : 2 }
function axisForDirection(direction?: DiagramOrthogonalRouteOptions["sourceDirection"]): "horizontal" | "vertical" | undefined { return !direction ? undefined : directionAxis(direction) === 1 ? "horizontal" : "vertical" }
function offsetInDirection(point: DiagramPoint, direction: NonNullable<DiagramOrthogonalRouteOptions["sourceDirection"]>, amount: number): DiagramPoint {
  const vector = direction === "east" ? { x: 1, y: 0 } : direction === "west" ? { x: -1, y: 0 } : direction === "north" ? { x: 0, y: -1 } : { x: 0, y: 1 }
  return { x: point.x + vector.x * amount, y: point.y + vector.y * amount }
}
function axisDirection(axis: "horizontal" | "vertical", dx: number, dy: number, reverse: boolean): NonNullable<DiagramOrthogonalRouteOptions["sourceDirection"]> {
  if (axis === "horizontal") return (dx >= 0) !== reverse ? "east" : "west"
  return (dy >= 0) !== reverse ? "south" : "north"
}
function oppositeDirection(direction: NonNullable<DiagramOrthogonalRouteOptions["sourceDirection"]>): NonNullable<DiagramOrthogonalRouteOptions["sourceDirection"]> {
  return direction === "east" ? "west" : direction === "west" ? "east" : direction === "north" ? "south" : "north"
}
function matchesDirection(from: DiagramPoint, to: DiagramPoint, direction: NonNullable<DiagramOrthogonalRouteOptions["sourceDirection"]>): boolean {
  return direction === "east" ? to.x > from.x : direction === "west" ? to.x < from.x : direction === "south" ? to.y > from.y : to.y < from.y
}

function dedupeAdjacentPoints(points: ReadonlyArray<DiagramPoint>): DiagramPoint[] {
  return points.filter((point, index) => index === 0 || point.x !== points[index - 1]?.x || point.y !== points[index - 1]?.y)
}

/** Returns the zero-based table cell at a world-space point, or null when outside the table. */
export function getDiagramTableCellAt(table: DiagramTable, point: DiagramPoint, parentTransform?: DiagramAffineTransform, resolvedLayout?: DiagramTableLayout): DiagramTableCellPosition | null {
  if (parentTransform) {
    const determinant = parentTransform.a * parentTransform.d - parentTransform.b * parentTransform.c
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return null
    const x = point.x - parentTransform.e
    const y = point.y - parentTransform.f
    point = { x: (parentTransform.d * x - parentTransform.c * y) / determinant, y: (-parentTransform.b * x + parentTransform.a * y) / determinant }
  }
  const headerHeight = table.header?.height ?? 0
  const bounds = { x: table.x, y: table.y - headerHeight, width: table.width, height: table.height + headerHeight }
  const origin = resolveTransformOrigin(bounds, table.transformOrigin)
  const local = inverseTransformPointAround(point, origin, table.rotation ?? 0, table.flipX === true, table.flipY === true)
  point = local
  if (point.x < table.x || point.y < table.y || point.x > table.x + table.width || point.y > table.y + table.height) return null
  const layout = resolvedLayout ?? resolveDiagramTableLayout(table)
  const column = findTrackIndex(point.x, layout.columnEdges)
  const row = findTrackIndex(point.y, layout.rowEdges)
  return layout.cellAnchors[row]![column]!
}

function findTrackIndex(coordinate: number, edges: ReadonlyArray<number>): number {
  let low = 0, high = edges.length - 1
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (coordinate < edges[mid]!) high = mid - 1
    else low = mid
  }
  return Math.min(edges.length - 2, Math.max(0, low))
}

export function createEntityGeometry(id: DiagramId, entities: DiagramEntities, cache?: DiagramGeometryResolutionCache, contentOverrides?: DiagramContentOverrides): DiagramGeometry | null {
  const localGeometry = createEntityGeometryRaw(id, entities, cache, contentOverrides)
  const parentTransform = resolveEntityParentTransform(id, entities, cache)
  const text = entities.textsById.get(id)
  const geometry = localGeometry && text && text.orientationPolicy && text.orientationPolicy !== "inherit"
    ? resolveTextGeometry(localGeometry, text, parentTransform ?? IDENTITY_AFFINE)
    : localGeometry && parentTransform ? transformGeometryByMatrix(localGeometry, parentTransform) : localGeometry
  if (!geometry) return null
  const entity = entities.nodesById.get(id) ?? entities.edgesById.get(id) ?? entities.textsById.get(id)
    ?? entities.shapesById.get(id) ?? entities.portsById.get(id) ?? entities.junctionsById.get(id)
    ?? entities.groupsById.get(id) ?? entities.tablesById.get(id)
  if (!entity) return geometry
  let style = resolveDiagramStyle(entity)
  if (entity.kind === "shape" && entity.pathContours?.length) {
    style = { ...style, fillRule: entity.pathContours.some((contour) => contour.hole) ? "evenodd" : style.fillRule ?? "evenodd" }
  }
  if (entity.kind === "text" && entity.fontSize !== undefined && entity.visualStyle?.fontSize === undefined) return { ...geometry, style: { ...style, fontSize: entity.fontSize } }
  return Object.keys(style).length ? { ...geometry, style } : geometry
}

/** Resolve geometry in the entity's parent coordinate space, excluding ancestor transforms. */
export function createLocalEntityGeometry(id: DiagramId, entities: DiagramEntities, cache?: DiagramGeometryResolutionCache): DiagramGeometry | null {
  const geometry = createEntityGeometryRaw(id, entities, cache)
  const offset = getParentOffset(id, entities)
  return geometry && offset ? transformGeometryByMatrix(geometry, translationAffine(offset)) : geometry
}

function resolveTextGeometry(geometry: DiagramGeometry, text: DiagramText, parent: DiagramAffineTransform): DiagramGeometry {
  const bounds = geometry.unrotatedBounds ?? geometry.bounds
  const pivot = geometry.localTransformOrigin ?? resolveTransformOrigin(bounds, text.transformOrigin)
  const local = pivotAffine(pivot, text.rotation ?? 0, text.flipX === true, text.flipY === true)
  const combined = composeDiagramAffine(parent, local)
  const reflected = combined.a * combined.d - combined.b * combined.c < 0
  const rawRotation = Math.atan2(combined.b, combined.a) * 180 / Math.PI
  const orientation = resolveTextGlyphOrientation(rawRotation, reflected, false, text.orientationPolicy ?? "inherit")
  const worldPivot = transformDiagramPoint(parent, transformDiagramPoint(local, pivot))
  const angle = orientation.rotation * Math.PI / 180
  const a = Math.cos(angle), b = Math.sin(angle), c = -Math.sin(angle), d = Math.cos(angle)
  const matrix = { a, b, c, d, e: worldPivot.x - a * pivot.x - c * pivot.y, f: worldPivot.y - b * pivot.x - d * pivot.y }
  const base = { ...rectGeometry(text.id, "text", bounds, 0, 3, false, false, 0, pivot), rotation: 0, flipX: false, flipY: false, localTransformOrigin: pivot }
  return transformGeometryByMatrix(base, matrix)
}

const IDENTITY_AFFINE: DiagramAffineTransform = Object.freeze({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })

export type DiagramGeometryResolutionCache = {
  parentsByChildId: Map<DiagramId, DiagramId>
  localGroupBoundsById: Map<DiagramId, DiagramRect | null>
  resolvingGroupIds: Set<DiagramId>
}

export function createDiagramGeometryResolutionCache(entities: DiagramEntities): DiagramGeometryResolutionCache {
  const parentsByChildId = new Map<DiagramId, DiagramId>()
  for (const group of entities.groupsById.values()) {
    // TODO(next-major): Remove legacy baked-group compatibility after persisted scenes have been normalized.
    if (group.x === undefined && group.y === undefined) continue
    for (const childId of group.childIds) parentsByChildId.set(childId, group.id)
  }
  return { parentsByChildId, localGroupBoundsById: new Map(), resolvingGroupIds: new Set() }
}

/** Compose affine transforms using column vectors: result(point) = outer(inner(point)). */
export function composeDiagramAffine(outer: DiagramAffineTransform, inner: DiagramAffineTransform): DiagramAffineTransform {
  return {
    a: outer.a * inner.a + outer.c * inner.b,
    b: outer.b * inner.a + outer.d * inner.b,
    c: outer.a * inner.c + outer.c * inner.d,
    d: outer.b * inner.c + outer.d * inner.d,
    e: outer.a * inner.e + outer.c * inner.f + outer.e,
    f: outer.b * inner.e + outer.d * inner.f + outer.f,
  }
}

export function transformDiagramPoint(matrix: DiagramAffineTransform, point: DiagramPoint): DiagramPoint {
  return { x: matrix.a * point.x + matrix.c * point.y + matrix.e, y: matrix.b * point.x + matrix.d * point.y + matrix.f }
}

export function resolveDiagramParentId(id: DiagramId, entities: DiagramEntities): DiagramId | null {
  for (const group of entities.groupsById.values()) if (group.childIds.includes(id)) return group.id
  return null
}

export function resolveLocalEntityTransform(id: DiagramId, entities: DiagramEntities, cache?: DiagramGeometryResolutionCache): DiagramAffineTransform {
  const group = entities.groupsById.get(id)
  if (group) {
    // TODO(next-major): Remove the legacy identity branch after persisted scenes have been normalized.
    if (group.x === undefined && group.y === undefined) return IDENTITY_AFFINE
    const bounds = resolveLocalGroupBounds(group, entities, cache)
    if (!bounds) return IDENTITY_AFFINE
    const origin = resolveTransformOrigin(bounds, group.transformOrigin)
    const x = group.x ?? 0, y = group.y ?? 0
    const base = pivotAffine(origin, group.rotation ?? 0, group.flipX === true, group.flipY === true, x, y)
    return group.parentOffset ? composeDiagramAffine(translationAffine(group.parentOffset), base) : base
  }
  const edge = entities.edgesById.get(id)
  const entity = entities.nodesById.get(id) ?? entities.shapesById.get(id) ?? entities.textsById.get(id) ?? entities.tablesById.get(id)
  if (!entity) return edge?.parentOffset ? translationAffine(edge.parentOffset) : IDENTITY_AFFINE
  const bounds = "kind" in entity && entity.kind === "table"
    ? { x: entity.x, y: entity.y - (entity.header?.height ?? 0), width: entity.width, height: entity.height + (entity.header?.height ?? 0) }
    : { x: entity.x, y: entity.y, width: entity.width ?? (entity.kind === "text" ? Math.max(1, entity.text.length) * (entity.fontSize ?? 12) * 0.6 : 0), height: entity.height ?? (entity.kind === "text" ? (entity.fontSize ?? 12) * 1.2 : 0) }
  const base = pivotAffine(resolveTransformOrigin(bounds, entity.transformOrigin), entity.rotation ?? 0, entity.flipX === true, entity.flipY === true)
  return entity.parentOffset ? composeDiagramAffine(translationAffine(entity.parentOffset), base) : base
}

export function resolveWorldEntityTransform(id: DiagramId, entities: DiagramEntities, cache?: DiagramGeometryResolutionCache): DiagramAffineTransform {
  return composeDiagramAffine(resolveParentTransform(id, entities, cache) ?? IDENTITY_AFFINE, resolveLocalEntityTransform(id, entities, cache))
}

/** Resolve ancestor transforms plus this entity's parent-local placement offset, excluding its own rotation/reflection. */
export function resolveEntityParentTransform(id: DiagramId, entities: DiagramEntities, cache?: DiagramGeometryResolutionCache): DiagramAffineTransform | null {
  const ancestor = resolveParentTransform(id, entities, cache)
  const offset = getParentOffset(id, entities)
  if (!ancestor) return offset ? translationAffine(offset) : null
  return offset ? composeDiagramAffine(ancestor, translationAffine(offset)) : ancestor
}

export function invertDiagramAffine(matrix: DiagramAffineTransform): DiagramAffineTransform | null {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) return null
  const a = matrix.d / determinant, b = -matrix.b / determinant, c = -matrix.c / determinant, d = matrix.a / determinant
  return { a, b, c, d, e: -(a * matrix.e + c * matrix.f), f: -(b * matrix.e + d * matrix.f) }
}

function pivotAffine(origin: DiagramPoint, rotation: number, flipX: boolean, flipY: boolean, x = 0, y = 0): DiagramAffineTransform {
  const angle = rotation * Math.PI / 180
  const sx = flipX ? -1 : 1, sy = flipY ? -1 : 1
  const cosine = stableTrig(Math.cos(angle)), sine = stableTrig(Math.sin(angle))
  const a = cosine * sx, b = sine * sx, c = -sine * sy, d = cosine * sy
  return { a, b, c, d, e: x + origin.x - a * origin.x - c * origin.y, f: y + origin.y - b * origin.x - d * origin.y }
}

function stableTrig(value: number): number {
  if (Math.abs(value) < 1e-12) return 0
  if (Math.abs(value - 1) < 1e-12) return 1
  if (Math.abs(value + 1) < 1e-12) return -1
  return value
}

/** Resolve the accumulated retained-group transform for flat geometry consumers. */
export function resolveParentTransform(id: DiagramId, entities: DiagramEntities, cache?: DiagramGeometryResolutionCache): DiagramAffineTransform | null {
  const parents = cache?.parentsByChildId ?? createDiagramGeometryResolutionCache(entities).parentsByChildId
  let parentId = parents.get(id)
  if (!parentId) return null
  const chain: DiagramId[] = []
  const seen = new Set<DiagramId>([id])
  while (parentId) {
    if (seen.has(parentId)) return null
    seen.add(parentId)
    chain.push(parentId)
    parentId = parents.get(parentId)
  }
  let result = IDENTITY_AFFINE
  for (const groupId of chain.reverse()) {
    const group = entities.groupsById.get(groupId)
    if (!group) continue
    result = composeDiagramAffine(result, resolveLocalEntityTransform(groupId, entities, cache))
  }
  return result
}

function transformGeometryByMatrix(geometry: DiagramGeometry, matrix: DiagramAffineTransform): DiagramGeometry {
  const localCorners = geometry.corners ?? [
    { x: geometry.bounds.x, y: geometry.bounds.y },
    { x: geometry.bounds.x + geometry.bounds.width, y: geometry.bounds.y },
    { x: geometry.bounds.x + geometry.bounds.width, y: geometry.bounds.y + geometry.bounds.height },
    { x: geometry.bounds.x, y: geometry.bounds.y + geometry.bounds.height },
  ]
  const corners = localCorners.map((point) => transformDiagramPoint(matrix, point))
  const path = geometry.path?.map((point) => transformDiagramPoint(matrix, point))
  const pathContours = geometry.pathContours?.map((contour) => ({
    ...contour,
    segments: contour.segments.map((segment) => {
      if (segment.kind === "line") return { ...segment, start: transformDiagramPoint(matrix, segment.start), end: transformDiagramPoint(matrix, segment.end) }
      if (segment.kind === "cubic") return { ...segment, start: transformDiagramPoint(matrix, segment.start), control1: transformDiagramPoint(matrix, segment.control1), control2: transformDiagramPoint(matrix, segment.control2), end: transformDiagramPoint(matrix, segment.end) }
      const center = transformDiagramPoint(matrix, segment.center)
      const start = transformDiagramPoint(matrix, { x: segment.center.x + segment.radius * Math.cos(segment.startAngle * Math.PI / 180), y: segment.center.y + segment.radius * Math.sin(segment.startAngle * Math.PI / 180) })
      const endAngle = segment.startAngle + segment.sweepAngle
      const end = transformDiagramPoint(matrix, { x: segment.center.x + segment.radius * Math.cos(endAngle * Math.PI / 180), y: segment.center.y + segment.radius * Math.sin(endAngle * Math.PI / 180) })
      const startAngle = Math.atan2(start.y - center.y, start.x - center.x) * 180 / Math.PI
      let sweepAngle = Math.atan2(end.y - center.y, end.x - center.x) * 180 / Math.PI - startAngle
      if (matrix.a * matrix.d - matrix.b * matrix.c < 0) sweepAngle = -sweepAngle
      while (sweepAngle > 180) sweepAngle -= 360
      while (sweepAngle < -180) sweepAngle += 360
      return { ...segment, center, radius: Math.hypot(start.x - center.x, start.y - center.y), startAngle, sweepAngle }
    }),
  }))
  const bounds = pathContours?.length ? rectFromPoints(pathContours.flatMap(pathContourBoundsPoints)) : path?.length ? rectFromPoints(path) : rectFromPoints(corners)
  return {
    ...geometry,
    bounds,
    hitBounds: inflateRect(bounds, geometry.kind === "edge" ? 6 : 4),
    ...(geometry.corners ? { corners } : {}),
    ...(path ? { path } : {}),
    ...(pathContours ? { pathContours } : {}),
    ...(geometry.point ? { point: transformDiagramPoint(matrix, geometry.point) } : {}),
    ...(geometry.transformOrigin ? { transformOrigin: transformDiagramPoint(matrix, geometry.transformOrigin) } : {}),
    ...(geometry.localTransformOrigin ? { localTransformOrigin: geometry.localTransformOrigin } : {}),
    parentTransform: geometry.parentTransform ? composeDiagramAffine(matrix, geometry.parentTransform) : matrix,
  }
}

function createEntityGeometryRaw(id: DiagramId, entities: DiagramEntities, cache?: DiagramGeometryResolutionCache, contentOverrides?: DiagramContentOverrides): DiagramGeometry | null {
  const node = entities.nodesById.get(id)
  if (node) {
    const bounds = { x: node.x, y: node.y, width: node.width, height: node.height }
    return rectGeometry(id, "node", bounds, node.rotation ?? 0, 4, node.flipX, node.flipY, 0, resolveTransformOrigin(bounds, node.transformOrigin))
  }
  const port = entities.portsById.get(id)
  if (port) {
    const point = resolvePortPoint(port, entities)
    const radius = port.radius ?? 4
    const bounds = { x: point.x - radius, y: point.y - radius, width: radius * 2, height: radius * 2 }
    return { id, kind: "port", bounds, hitBounds: inflateRect(bounds, 4), point, hostId: diagramPortHostId(port), ...("anchor" in port && port.anchor ? { anchor: port.anchor } : {}) }
  }
  const junction = entities.junctionsById.get(id)
  if (junction) {
    const host = entities.edgesById.get(junction.hostEdgeId)
    if (!host) return null
    const point = junction.anchor.kind === "fixed" ? junction.anchor.point : pointAtRouteFraction(resolveEdgePath(host, entities), junction.anchor.fraction)
    const bounds = { x: point.x - 3, y: point.y - 3, width: 6, height: 6 }
    return { id, kind: "junction", bounds, hitBounds: inflateRect(bounds, 4), point, hostId: junction.hostEdgeId }
  }
  const edge = entities.edgesById.get(id)
  if (edge) {
    const path = resolveEdgePath(edge, entities)
    const bounds = rectFromPoints(path)
    const corners = edge.source.kind === "point" && edge.target.kind === "point" && !edge.points?.length && path.length === 2
      ? orientedLineFrameCorners(path[0]!, path[1]!, 6)
      : undefined
    return { id, kind: "edge", bounds, hitBounds: inflateRect(bounds, 6), path, ...(corners ? { corners } : {}) }
  }
  const text = entities.textsById.get(id)
  if (text) {
    const displayedText = resolveDiagramTextContent(contentOverrides, id, text.text)
    const width = text.width ?? Math.max(1, displayedText.length) * (text.fontSize ?? 12) * 0.6
    const height = text.height ?? (text.fontSize ?? 12) * 1.2
    const orientation = resolveTextGlyphOrientation(text.rotation ?? 0, text.flipX === true, text.flipY === true, text.orientationPolicy ?? "inherit")
    const bounds = { x: text.x, y: text.y, width, height }
    return rectGeometry(id, "text", bounds, orientation.rotation, 3, orientation.flipX, orientation.flipY, 0, resolveTransformOrigin(bounds, text.transformOrigin))
  }
  const shape = entities.shapesById.get(id)
  if (shape) {
    if (shape.pathContours?.length) {
      const transformOrigin = resolveTransformOrigin({ x: shape.x, y: shape.y, width: shape.width, height: shape.height }, shape.transformOrigin)
      const pathContours = shape.pathContours.map((contour) => transformPathContour(translatePathContour(contour, shape.x, shape.y), transformOrigin, shape.rotation ?? 0, shape.flipX, shape.flipY))
      const contours = pathContours.map((contour) => flattenPathContour(contour))
      const path = contours.flat()
      const bounds = rectFromPoints(pathContours.flatMap(pathContourBoundsPoints))
      return { id, kind: "shape", bounds, hitBounds: inflateRect(bounds, 6), path, pathContours, transformOrigin, localTransformOrigin: transformOrigin }
    }
    if (shape.shape === "line" && shape.points?.length) {
      const center = resolveTransformOrigin({ x: shape.x, y: shape.y, width: shape.width, height: shape.height }, shape.transformOrigin)
      const path = shape.points.map((point) => {
        const local = { x: shape.x + point.x, y: shape.y + point.y }
        return transformPointAround(local, center, shape.rotation ?? 0, shape.flipX === true, shape.flipY === true)
      })
      const bounds = rectFromPoints(path)
      return { id, kind: "shape", bounds, hitBounds: inflateRect(bounds, 6), path, transformOrigin: center, localTransformOrigin: center }
    }
    const bounds = { x: shape.x, y: shape.y, width: shape.width, height: shape.height }
    return rectGeometry(id, "shape", bounds, shape.rotation ?? 0, 3, shape.flipX, shape.flipY, shape.shape === "rect" ? shape.cornerRadius ?? 0 : 0, resolveTransformOrigin(bounds, shape.transformOrigin))
  }
  const group = entities.groupsById.get(id)
  if (group) {
    // TODO(next-major): Remove this branch; deserializeScene now normalizes compatible legacy groups.
    const bounds = resolveLocalGroupBounds(group, entities, cache)
    if (!bounds) return null
    const origin = resolveTransformOrigin(bounds, group.transformOrigin)
    const x = group.x ?? 0
    const y = group.y ?? 0
    const positioned = { x: bounds.x + x, y: bounds.y + y, width: bounds.width, height: bounds.height }
    const positionedOrigin = { x: origin.x + x, y: origin.y + y }
    const retained = group.x !== undefined || group.y !== undefined
    return { ...rectGeometry(id, "shape", positioned, retained ? group.rotation ?? 0 : 0, 6, retained ? group.flipX : false, retained ? group.flipY : false, 0, positionedOrigin), kind: "group" }
  }
  const table = entities.tablesById.get(id)
  if (table) {
    const headerHeight = table.header?.height ?? 0
    const bounds = { x: table.x, y: table.y - headerHeight, width: table.width, height: table.height + headerHeight }
    return rectGeometry(id, "table", bounds, table.rotation ?? 0, 3, table.flipX, table.flipY, 0, resolveTransformOrigin(bounds, table.transformOrigin))
  }
  return null
}

function resolveLocalGroupBounds(group: DiagramGroup, entities: DiagramEntities, cache?: DiagramGeometryResolutionCache): DiagramRect | null {
  if (cache?.localGroupBoundsById.has(group.id)) return cache.localGroupBoundsById.get(group.id) ?? null
  if (cache?.resolvingGroupIds.has(group.id)) return null
  cache?.resolvingGroupIds.add(group.id)
  const bounds = unionRects(group.childIds
    .filter((childId) => childId !== group.id)
    .map((childId) => createLocalEntityGeometry(childId, entities, cache)?.bounds)
    .filter((rect): rect is DiagramRect => Boolean(rect)))
  cache?.resolvingGroupIds.delete(group.id)
  cache?.localGroupBoundsById.set(group.id, bounds)
  return bounds
}

function getParentOffset(id: DiagramId, entities: DiagramEntities): DiagramPoint | undefined {
  return entities.nodesById.get(id)?.parentOffset ?? entities.edgesById.get(id)?.parentOffset ?? entities.textsById.get(id)?.parentOffset
    ?? entities.shapesById.get(id)?.parentOffset ?? entities.groupsById.get(id)?.parentOffset ?? entities.tablesById.get(id)?.parentOffset
}

function translationAffine(point: DiagramPoint): DiagramAffineTransform {
  return { a: 1, b: 0, c: 0, d: 1, e: point.x, f: point.y }
}

/** Resolve glyph orientation independently from the text anchor. Reflection parity is tested from both axes. */
export function resolveTextGlyphOrientation(rotation: number, flipX: boolean, flipY: boolean, policy: import("./types.js").TextOrientationPolicy): Readonly<{ rotation: number; flipX: boolean; flipY: boolean }> {
  if (policy === "inherit") return { rotation, flipX, flipY }
  if (!Number.isFinite(rotation)) return { rotation: 0, flipX: false, flipY: false }
  if (policy === "keep-horizontal") return { rotation: 0, flipX: false, flipY: false }

  // A reflected local X axis points in the opposite direction. Remove reflection first,
  // then choose the equivalent baseline in [-90°, 90°), mapping either boundary to +90°.
  const radians = rotation * Math.PI / 180
  const xx = Math.cos(radians) * (flipX ? -1 : 1)
  const yx = Math.sin(radians) * (flipX ? -1 : 1)
  const angle = Math.atan2(yx, xx) * 180 / Math.PI
  let normalized = ((angle % 360) + 360) % 360
  if (normalized > 180) normalized -= 360
  if (normalized > 90) normalized -= 180
  else if (normalized <= -90) normalized += 180
  return { rotation: Math.abs(normalized) < 1e-10 ? 0 : normalized, flipX: false, flipY: false }
}

function orientedLineFrameCorners(start: DiagramPoint, end: DiagramPoint, padding: number): ReadonlyArray<DiagramPoint> | undefined {
  const dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy)
  if (length <= 1e-8) return undefined
  const nx = -dy / length * padding, ny = dx / length * padding
  return [
    { x: start.x + nx, y: start.y + ny }, { x: end.x + nx, y: end.y + ny },
    { x: end.x - nx, y: end.y - ny }, { x: start.x - nx, y: start.y - ny },
  ]
}

export function resolveEdgePath(edge: DiagramEdge, entities: DiagramEntities): ReadonlyArray<DiagramPoint> {
  const routing = edge.routing
  if (routing?.mode === "auto") {
    const source = resolveEndpoint(edge.source, entities)
    const target = resolveEndpoint(edge.target, entities)
    const sourcePort = edge.source.kind === "port" ? entities.portsById.get(edge.source.portId) : undefined
    const targetPort = edge.target.kind === "port" ? entities.portsById.get(edge.target.portId) : undefined
    const sourcePortDirection = sourcePort ? resolvePortWorldDirection(sourcePort, entities) : "any"
    const targetPortDirection = targetPort ? resolvePortWorldDirection(targetPort, entities) : "any"
    // A non-cardinal transformed hard direction cannot be represented by an orthogonal terminal.
    if (sourcePortDirection === null || targetPortDirection === null) return []
    const excluded = new Set<DiagramId>()
    const directionalEndpointHosts = new Set<DiagramId>()
    for (const [endpoint, portDirection] of [[edge.source, sourcePortDirection], [edge.target, targetPortDirection]] as const) {
      if (endpoint.kind === "node") excluded.add(endpoint.nodeId)
      else if (endpoint.kind === "port") {
        const port = entities.portsById.get(endpoint.portId)
        if (port) {
          const hostId = diagramPortHostId(port)
          if (portDirection !== "any") directionalEndpointHosts.add(hostId)
          else excluded.add(hostId)
        }
      }
    }
    const fixedJunctions = [...entities.junctionsById.values()].flatMap((junction) =>
      junction.hostEdgeId === edge.id && junction.anchor.kind === "fixed" ? [junction.anchor.point] : [])
    const waypoints = [...(routing.waypoints ?? []), ...fixedJunctions]
    const obstacleIds = routing.strategy === "simple"
      ? [...directionalEndpointHosts]
      : [...new Set([
        ...entities.nodesById.keys(), ...entities.textsById.keys(), ...entities.tablesById.keys(),
        ...entities.shapesById.keys(),
      ])].filter((id) => !excluded.has(id) && !directionalEndpointHosts.has(id))
    const obstacles = obstacleIds.flatMap((id) => {
      const geometry = createEntityGeometry(id, entities)
      return geometry && routeObstacleMayAffect(geometry.bounds, source, target, waypoints, routing.clearance ?? 0, routing.terminalLead ?? 12) ? [{ id, bounds: geometry.bounds }] : []
    })
    const existingRoutes = routing.strategy === "simple" ? [] : [...entities.edgesById.values()]
      .filter((candidate) => candidate.id !== edge.id && candidate.routing?.mode !== "auto" && !routeDependsOnEdge(candidate, edge.id, entities))
      .map((candidate) => ({ id: candidate.id, points: resolveEdgePath(candidate, entities) }))
    const routeOptions = {
      strictGrid: routing.strictGrid,
      gridSize: routing.gridSize,
      firstAxis: routing.firstAxis,
      terminalLead: sourcePortDirection !== "any" || targetPortDirection !== "any"
        ? Math.max(routing.terminalLead ?? 12, 12)
        : routing.terminalLead ?? 0,
      sourceDirection: routing.sourceDirection ?? (sourcePortDirection === "any" ? undefined : sourcePortDirection),
      // Existing edge routing options express target travel direction; port directions are outward host normals.
      targetDirection: routing.targetDirection ?? (targetPortDirection === "any" ? undefined : oppositeDirection(targetPortDirection)),
      clearance: routing.strategy === "simple" && directionalEndpointHosts.size ? 0 : routing.clearance,
      maxBends: routing.maxBends,
      maxRouteBends: routing.maxRouteBends,
      tieBreak: routing.tieBreak,
      // Simple routing can cross unrelated scene objects, but must still
      // route around its own directionally attached endpoint hosts.
      strategy: routing.strategy === "simple" && obstacles.length ? "obstacle-aware" : routing.strategy,
      waypoints,
      routeHint: routing.routeHint,
      obstacles,
      existingRoutes,
    }
    let route = routeOrthogonalConnector(source, target, routeOptions)
    if (routing.routeHint && route.diagnostics.some((diagnostic) => diagnostic.code !== "terminal-leads-overlap")) {
      route = routeOrthogonalConnector(source, target, { ...routeOptions, routeHint: undefined })
    }
    if (!route.diagnostics.some((diagnostic) => diagnostic.code !== "terminal-leads-overlap")) return simplifyOrthogonalPath(route.path)
    return []
  }
  const source = resolveEndpoint(edge.source, entities)
  const target = resolveEndpoint(edge.target, entities)
  if (routing?.mode === "manual") return resolveManualOrthogonalPath(source, edge.points ?? [], target) ?? []
  return [source, ...(edge.points ?? []), target]
}

/** Resolve a port's cardinal outward direction in document coordinates. Omitted/ambiguous directions are unrestricted; non-cardinal transformed explicit directions return null. */
export function resolvePortWorldDirection(port: DiagramPort, entities: DiagramEntities): DiagramCardinalDirection | "any" | null {
  let direction = port.direction ?? "any" // legacy documents preserve unrestricted routing
  if (direction === "any") return "any"
  if (direction === "auto") {
    const hostId = diagramPortHostId(port)
    const bounds = getPortHostBounds(hostId, entities)
    const anchor = "nodeId" in port && port.nodeId ? { x: port.x, y: port.y } : "anchor" in port && port.anchor?.kind === "local" ? port.anchor : null
    if (!bounds || !anchor) return "any"
    const epsilon = 1e-7
    const matches = [
      ...(Math.abs(anchor.x) <= epsilon ? ["west" as const] : []),
      ...(Math.abs(anchor.x - bounds.width) <= epsilon ? ["east" as const] : []),
      ...(Math.abs(anchor.y) <= epsilon ? ["north" as const] : []),
      ...(Math.abs(anchor.y - bounds.height) <= epsilon ? ["south" as const] : []),
    ]
    if (matches.length !== 1) return "any"
    direction = matches[0]!
  }
  const transform = resolveWorldEntityTransform(diagramPortHostId(port), entities)
  const local = direction === "east" ? { x: 1, y: 0 } : direction === "west" ? { x: -1, y: 0 } : direction === "south" ? { x: 0, y: 1 } : { x: 0, y: -1 }
  const x = transform.a * local.x + transform.c * local.y
  const y = transform.b * local.x + transform.d * local.y
  const epsilon = 1e-8
  if (Math.abs(y) <= epsilon && Math.abs(x) > epsilon) return x > 0 ? "east" : "west"
  if (Math.abs(x) <= epsilon && Math.abs(y) > epsilon) return y > 0 ? "south" : "north"
  return null
}

function routeDependsOnEdge(edge: DiagramEdge, targetEdgeId: DiagramId, entities: DiagramEntities): boolean {
  const visited = new Set<DiagramId>()
  const endpointHost = (endpoint: DiagramEdgeEndpoint): DiagramId | null => {
    if (endpoint.kind === "junction") {
      const junction = entities.junctionsById.get(endpoint.junctionId)
      return junction?.anchor.kind === "route" ? junction.hostEdgeId : null
    }
    if (endpoint.kind !== "port") return null
    const port = entities.portsById.get(endpoint.portId)
    const hostId = port ? diagramPortHostId(port) : ""
    return entities.edgesById.has(hostId) ? hostId : null
  }
  const visit = (candidate: DiagramEdge): boolean => {
    if (visited.has(candidate.id)) return false
    visited.add(candidate.id)
    for (const endpoint of [candidate.source, candidate.target]) {
      const hostId = endpointHost(endpoint)
      if (hostId === targetEdgeId) return true
      const host = hostId ? entities.edgesById.get(hostId) : undefined
      if (host && visit(host)) return true
    }
    return false
  }
  return visit(edge)
}

function routeObstacleMayAffect(bounds: DiagramRect, source: DiagramPoint, target: DiagramPoint, waypoints: ReadonlyArray<DiagramPoint>, clearance: number, terminalLead: number): boolean {
  const stops = [source, ...waypoints, target]
  for (let index = 1; index < stops.length; index += 1) {
    const leg = rectFromPoints([stops[index - 1]!, stops[index]!])
    const margin = Math.max(leg.width, leg.height, clearance, terminalLead, 1) * 2 + clearance
    if (rectIntersects(bounds, inflateRect(leg, margin))) return true
  }
  return false
}

export function resolveEndpoint(endpoint: DiagramEdgeEndpoint, entities: DiagramEntities): DiagramPoint {
  if (endpoint.kind === "point") {
    return endpoint.point
  }
  if (endpoint.kind === "port") {
    const port = entities.portsById.get(endpoint.portId)
    return port ? resolvePortPoint(port, entities) : { x: 0, y: 0 }
  }
  if (endpoint.kind === "junction") {
    const junction = entities.junctionsById.get(endpoint.junctionId)
    const host = junction ? entities.edgesById.get(junction.hostEdgeId) : undefined
    return junction && host ? junction.anchor.kind === "fixed" ? junction.anchor.point : pointAtRouteFraction(resolveEdgePath(host, entities), junction.anchor.fraction) : { x: 0, y: 0 }
  }
  const node = entities.nodesById.get(endpoint.nodeId)
  return node ? rectCenter({ x: node.x, y: node.y, width: node.width, height: node.height }) : { x: 0, y: 0 }
}

export function resolvePortPoint(port: DiagramPort, entities: DiagramEntities): DiagramPoint {
  if ("nodeId" in port && port.nodeId) {
    const node = entities.nodesById.get(port.nodeId)
    if (!node) return { x: port.x, y: port.y }
    const point = { x: node.x + port.x, y: node.y + port.y }
    const bounds = { x: node.x, y: node.y, width: node.width, height: node.height }
    return applyParentPoint(port.nodeId, transformPointAround(point, resolveTransformOrigin(bounds, node.transformOrigin), node.rotation ?? 0, node.flipX === true, node.flipY === true), entities)
  }
  const host = "hostId" in port ? port.hostId : undefined
  const anchor = "anchor" in port ? port.anchor : undefined
  if (!host || !anchor) return { x: 0, y: 0 }
  if (anchor.kind === "vertex") return applyParentPoint(host, resolveShapeVertex(host, anchor.index, entities) ?? { x: 0, y: 0 }, entities)
  if (anchor.kind === "route") {
    const edge = entities.edgesById.get(host)
    return edge ? applyParentPoint(host, pointAtRouteFraction(resolveEdgePath(edge, entities), anchor.fraction), entities) : { x: 0, y: 0 }
  }
  const bounds = getPortHostBounds(host, entities)
  if (!bounds) return { x: anchor.x, y: anchor.y }
  const group = entities.groupsById.get(host)
  if (group) {
    const local = { x: bounds.x + anchor.x, y: bounds.y + anchor.y }
    // TODO(next-major): Remove the baked-group branch once all supported legacy groups normalize.
    const retained = group.x !== undefined || group.y !== undefined
    const transformed = retained
      ? transformPointAround(local, resolveTransformOrigin(bounds, group.transformOrigin), group.rotation ?? 0, group.flipX === true, group.flipY === true)
      : local
    return applyParentPoint(host, { x: transformed.x + (retained ? group.x ?? 0 : 0), y: transformed.y + (retained ? group.y ?? 0 : 0) }, entities)
  }
  const entity = entities.nodesById.get(host) ?? entities.shapesById.get(host) ?? entities.textsById.get(host) ?? entities.tablesById.get(host)
  const local = { x: bounds.x + anchor.x, y: bounds.y + anchor.y }
  if (entity && "width" in entity && "height" in entity) {
    return applyParentPoint(host, transformPointAround(local, resolveTransformOrigin(bounds, entity.transformOrigin), entity.rotation ?? 0, entity.flipX === true, entity.flipY === true), entities)
  }
  return applyParentPoint(host, local, entities)
}

function applyParentPoint(id: DiagramId, point: DiagramPoint, entities: DiagramEntities): DiagramPoint {
  const offset = getParentOffset(id, entities)
  if (offset) point = { x: point.x + offset.x, y: point.y + offset.y }
  const matrix = resolveParentTransform(id, entities)
  return matrix ? transformDiagramPoint(matrix, point) : point
}

export function diagramPortHostId(port: DiagramPort): DiagramId {
  if ("nodeId" in port && typeof port.nodeId === "string") return port.nodeId
  return (port as Extract<DiagramPort, { hostId: DiagramId }>).hostId ?? ""
}

export function isValidDiagramPortAnchor(hostId: DiagramId, anchor: DiagramPortAnchor, entities: DiagramEntities): boolean {
  if (!anchor || typeof anchor !== "object") return false
  if (anchor.kind === "vertex") {
    const shape = entities.shapesById.get(hostId)
    const vertices = shape?.points ?? (shape?.shape === "line" ? [{ x: 0, y: 0 }, { x: shape.width, y: shape.height }] : null)
    return Boolean(vertices && Number.isInteger(anchor.index) && anchor.index >= 0 && anchor.index < vertices.length)
  }
  if (anchor.kind === "route") return entities.edgesById.has(hostId) && Number.isFinite(anchor.fraction) && anchor.fraction >= 0 && anchor.fraction <= 1
  if (entities.edgesById.has(hostId)) return false
  if (![anchor.x, anchor.y].every(Number.isFinite)) return false
  // Group-local ports can remain attached just outside descendant bounds after children are reparented.
  if (entities.groupsById.has(hostId)) return true
  const bounds = getPortHostBounds(hostId, entities)
  return Boolean(bounds && anchor.x >= 0 && anchor.y >= 0 && anchor.x <= bounds.width && anchor.y <= bounds.height)
}

function getPortHostBounds(hostId: DiagramId, entities: DiagramEntities): DiagramRect | null {
  const node = entities.nodesById.get(hostId)
  if (node) return { x: node.x, y: node.y, width: node.width, height: node.height }
  const shape = entities.shapesById.get(hostId)
  if (shape) return { x: shape.x, y: shape.y, width: shape.width, height: shape.height }
  const text = entities.textsById.get(hostId)
  if (text) return { x: text.x, y: text.y, width: text.width ?? Math.max(1, text.text.length) * (text.fontSize ?? 12) * 0.6, height: text.height ?? (text.fontSize ?? 12) * 1.2 }
  const table = entities.tablesById.get(hostId)
  if (table) return { x: table.x, y: table.y, width: table.width, height: table.height }
  const group = entities.groupsById.get(hostId)
  if (group) return unionRects(group.childIds.map((id) => createLocalEntityGeometry(id, entities)?.bounds).filter((rect): rect is DiagramRect => Boolean(rect)))
  const edge = entities.edgesById.get(hostId)
  if (edge) return rectFromPoints(resolveEdgePath(edge, entities))
  return null
}

export function pointAtRouteFraction(path: ReadonlyArray<DiagramPoint>, fraction: number): DiagramPoint {
  if (path.length < 2) return path[0] ?? { x: 0, y: 0 }
  const lengths = path.slice(1).map((point, index) => distance(path[index]!, point))
  const total = lengths.reduce((sum, length) => sum + length, 0)
  if (total <= 1e-9) return path[0]!
  let offset = Math.max(0, Math.min(1, fraction)) * total
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index]!
    if (offset <= length || index === lengths.length - 1) {
      const ratio = length > 0 ? Math.max(0, Math.min(1, offset / length)) : 0
      const start = path[index]!, end = path[index + 1]!
      return { x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio }
    }
    offset -= length
  }
  return path[path.length - 1]!
}

function resolveShapeVertex(hostId: DiagramId, index: number, entities: DiagramEntities): DiagramPoint | null {
  const shape = entities.shapesById.get(hostId)
  if (!shape) return null
  const vertices = shape.points ?? (shape.shape === "line" ? [{ x: 0, y: 0 }, { x: shape.width, y: shape.height }] : null)
  const point = vertices?.[index]
  if (!point) return null
  const bounds = { x: shape.x, y: shape.y, width: shape.width, height: shape.height }
  const center = resolveTransformOrigin(bounds, shape.transformOrigin)
  const worldPoint = { x: shape.x + point.x, y: shape.y + point.y }
  return transformPointAround(worldPoint, center, shape.rotation ?? 0, shape.flipX === true, shape.flipY === true)
}

export function resolveTransformOrigin(bounds: DiagramRect, origin?: TransformOrigin): DiagramPoint {
  if (!origin) return rectCenter(bounds)
  return origin.mode === "relative"
    ? { x: bounds.x + bounds.width * origin.x, y: bounds.y + bounds.height * origin.y }
    : { x: bounds.x + origin.x, y: bounds.y + origin.y }
}

export function transformPointAround(point: DiagramPoint, origin: DiagramPoint, rotation = 0, flipX = false, flipY = false): DiagramPoint {
  const reflected = { x: origin.x + (point.x - origin.x) * (flipX ? -1 : 1), y: origin.y + (point.y - origin.y) * (flipY ? -1 : 1) }
  return rotatePoint(reflected, origin, rotation)
}

export function inverseTransformPointAround(point: DiagramPoint, origin: DiagramPoint, rotation = 0, flipX = false, flipY = false): DiagramPoint {
  const rotated = rotatePoint(point, origin, -rotation)
  return { x: origin.x + (rotated.x - origin.x) * (flipX ? -1 : 1), y: origin.y + (rotated.y - origin.y) * (flipY ? -1 : 1) }
}

function rectGeometry(id: DiagramId, kind: "node" | "shape" | "text" | "table", bounds: DiagramRect, rotation: number, hitPadding: number, flipX = false, flipY = false, cornerRadius = 0, origin = rectCenter(bounds)): DiagramGeometry {
  const normalizedRotation = normalizeRotation(rotation)
  const center = rectCenter(bounds)
  const originIsCenter = Math.abs(center.x - origin.x) < 1e-10 && Math.abs(center.y - origin.y) < 1e-10
  if (!normalizedRotation && originIsCenter) {
    return { id, kind, bounds, hitBounds: inflateRect(bounds, hitPadding), unrotatedBounds: bounds, rotation: 0, flipX, flipY, ...(kind === "shape" ? { cornerRadius } : {}) }
  }
  const corners = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height },
  ].map((point) => transformPointAround(point, origin, normalizedRotation, flipX, flipY))
  const rotatedBounds = rectFromPoints(corners)
  return { id, kind, bounds: rotatedBounds, hitBounds: inflateRect(rotatedBounds, hitPadding), unrotatedBounds: bounds, corners, rotation: normalizedRotation, flipX, flipY, transformOrigin: origin, localTransformOrigin: origin, ...(kind === "shape" ? { cornerRadius } : {}) }
}

export function rotatedRectCorners(rect: DiagramRect, rotation: number): ReadonlyArray<DiagramPoint> {
  const center = rectCenter(rect)
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ].map((point) => rotatePoint(point, center, rotation))
}

export function rotatePoint(point: DiagramPoint, center: DiagramPoint, rotation: number): DiagramPoint {
  const normalizedRotation = normalizeRotation(rotation)
  if (!normalizedRotation) return point
  const angle = normalizedRotation * (Math.PI / 180)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const dx = point.x - center.x
  const dy = point.y - center.y
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos }
}

function normalizeRotation(rotation: number): number {
  const normalized = rotation % 360
  return normalized < 0 ? normalized + 360 : normalized
}

function unionRects(rects: ReadonlyArray<DiagramRect>): DiagramRect | null {
  if (!rects.length) return null
  const minX = Math.min(...rects.map((rect) => rect.x))
  const minY = Math.min(...rects.map((rect) => rect.y))
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width))
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height))
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
