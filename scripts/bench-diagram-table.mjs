import { createDiagramEngine, createDiagramInteractionController, getDiagramTableCellAt, resolveDiagramTableLayout } from "../packages/diagram-core/dist/index.js"
import { performance } from "node:perf_hooks"

const samples = 35
const percentile = (values, percent) => values.slice().sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * percent) - 1)]
const summary = (values) => ({ p50: +percentile(values, .5).toFixed(6), p95: +percentile(values, .95).toFixed(6), p99: +percentile(values, .99).toFixed(6), n: values.length, unit: "ms" })
const timed = (samples, operation) => {
  const output = []
  for (let index = 0; index < samples; index += 1) {
    const start = performance.now()
    operation(index)
    output.push(performance.now() - start)
  }
  return summary(output)
}
const timedBatched = (samples, operationsPerSample, operation) => {
  const output = []
  for (let sample = 0; sample < samples; sample += 1) {
    const start = performance.now()
    for (let index = 0; index < operationsPerSample; index += 1) operation(index)
    output.push((performance.now() - start) / operationsPerSample)
  }
  return summary(output)
}

for (const [rowCount, columnCount] of [[10, 10], [50, 20], [100, 50]]) {
  const columnWidths = Array.from({ length: columnCount }, (_, index) => 30 + index % 4 * 5)
  const rowHeights = Array.from({ length: rowCount }, (_, index) => 18 + index % 3)
  const table = {
    id: "table-bench",
    kind: "table",
    x: 0,
    y: 0,
    width: columnWidths.reduce((sum, size) => sum + size, 0),
    height: rowHeights.reduce((sum, size) => sum + size, 0),
    rowCount,
    columnCount,
    columnWidths,
    rowHeights,
    style: {
      grid: { visible: true, stroke: { color: "#777", width: 1, style: "solid" } },
      border: { visible: true, stroke: { color: "#222", width: 1, style: "solid" }, radius: 0 },
      cellPadding: 3,
    },
    cells: Array.from({ length: rowCount }, (_, row) => Array.from({ length: columnCount }, (_, column) => ({
      id: `c-${row}-${column}`,
      text: `R${row} C${column}`,
      style: { background: (row + column) % 2 ? "#fff" : "#fafafa", padding: { left: 2, right: 3, top: 1, bottom: 1 } },
    }))),
    merges: [],
  }
  for (let row = 0; row + 1 < rowCount; row += 10) for (let column = 0; column + 1 < columnCount; column += 5) table.merges.push({ anchorCellId: `c-${row}-${column}`, rowSpan: 2, columnSpan: 2 })
  const engine = createDiagramEngine({ tables: [table] })
  const interaction = createDiagramInteractionController(engine)
  const warmLayout = engine.getTableLayout(table.id)
  const localPoints = Array.from({ length: samples }, (_, index) => ({
    x: columnWidths.slice(0, index % columnCount).reduce((sum, size) => sum + size, 0) + 2,
    y: rowHeights.slice(0, index % rowCount).reduce((sum, size) => sum + size, 0) + 2,
  }))
  const timings = {
    coldLayout: timed(samples, () => resolveDiagramTableLayout(table)),
    cachedLayout: timedBatched(samples, 100, () => engine.getTableLayout(table.id)),
    uncachedHitTest: timed(samples, (index) => getDiagramTableCellAt(table, localPoints[index])),
    cachedHitTest: timedBatched(samples, 100, (index) => engine.getTableCellAt(table.id, localPoints[index % samples])),
    hitAfterInvalidation: timed(samples, (index) => {
      const column = index % columnCount
      engine.dispatch({ type: "resizeTableColumn", id: table.id, index: column, width: columnWidths[column] + .1 + index / 1000 })
      engine.getTableCellAt(table.id, localPoints[index])
    }),
    rangeExpansion: timed(samples, (index) => warmLayout.expandRange({ row: index % rowCount, column: index % columnCount }, { row: rowCount - 1, column: columnCount - 1 })),
    resizePreview: timed(samples, (index) => {
      const tableNow = engine.getScene().entities.tablesById.get(table.id)
      const layout = engine.getTableLayout(table.id)
      const column = index % (columnCount - 1)
      const point = { x: tableNow.x + layout.columnEdges[column + 1], y: tableNow.y + 2 }
      interaction.beginTableResizeHandle(table.id, "column", column, { id: 1, point }, "flexible")
      interaction.pointerMove({ id: 1, point: { x: point.x + .25, y: point.y } })
      interaction.cancel()
    }),
    resizeCommit: timed(samples, (index) => engine.dispatch({ type: "resizeTableColumn", id: table.id, index: index % columnCount, width: columnWidths[index % columnCount] + .25 })),
    styleUpdate: timed(samples, (index) => engine.dispatch({ type: "updateTableCellRange", id: table.id, startRow: 0, endRow: 0, startColumn: index % columnCount, endColumn: index % columnCount, cell: { style: { background: index % 2 ? "#fff" : "#f8f8f8" } } })),
    structuralInsertDelete: timed(samples, (index) => {
      const currentRows = engine.getScene().entities.tablesById.get(table.id).rowCount
      engine.dispatch({ type: "insertTableRow", id: table.id, index: currentRows })
      engine.dispatch({ type: "deleteTableRow", id: table.id, index: currentRows })
    }),
    serialization: timed(samples, () => JSON.stringify(engine.serializeDocument())),
  }
  console.log(`${rowCount}x${columnCount} ${JSON.stringify(timings)}`)
}
