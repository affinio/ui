import { performance } from "node:perf_hooks"
import { createDiagramDocumentPresentationSource } from "../packages/diagram-core/dist/index.js"

const time = (callback) => { const start = performance.now(); callback(); return performance.now() - start }
const average = (callback, iterations = 20) => { const values = Array.from({ length: iterations }, (_, index) => time(() => callback(index))); return values.reduce((sum, value) => sum + value, 0) / values.length }
const tableOf = (id, cellCount) => ({
  id, kind: "table", x: 0, y: 0, width: 1200, height: Math.max(20, cellCount * 20), rowCount: cellCount, columnCount: 1,
  cells: Array.from({ length: cellCount }, (_, row) => [{ id: `${id}:cell:${row}`, text: `Cell ${row} source content` }]),
})
const reportTable = (cellCount) => {
  const table = tableOf(`t${cellCount}`, cellCount)
  const source = createDiagramDocumentPresentationSource({ tables: [table] })
  const initialMs = time(() => source.getTableLayout(table.id))
  const cachedMs = average(() => source.getTableLayout(table.id))
  const singleOverrideMs = average((iteration) => source.getPresentedTableLayout(table.id, { contentOverrides: { textByTableCellId: new Map([[table.id, new Map([[`${table.id}:cell:${Math.floor(cellCount / 2)}`, `Single change ${iteration}`]])]]) } }))
  const multiOverrideMs = average((iteration) => {
    const multiMap = new Map(Array.from({ length: Math.min(cellCount, Math.ceil(cellCount * 0.1)) }, (_, index) => [`${table.id}:cell:${index}`, `Resolved ${iteration} ${index}`]))
    source.getPresentedTableLayout(table.id, { contentOverrides: { textByTableCellId: new Map([[table.id, multiMap]]) } })
  })
  const clearSamples = Array.from({ length: 20 }, (_, iteration) => {
    source.getPresentedTableLayout(table.id, { contentOverrides: { textByTableCellId: new Map([[table.id, new Map([[`${table.id}:cell:0`, `Before clear ${iteration}`]])]]) } })
    return time(() => source.getPresentedTableLayout(table.id, {}))
  })
  const clearMs = clearSamples.reduce((sum, value) => sum + value, 0) / clearSamples.length
  source.dispose()
  return { cells: cellCount, initialMs, cachedMs, singleOverrideMs, multiOverrideMs, clearMs }
}

console.log(JSON.stringify({ runtime: process.version, unit: "milliseconds", tables: [100, 1000, 5000].map(reportTable) }, null, 2))

const multipleTables = Array.from({ length: 5 }, (_, index) => tableOf(`multi-${index}`, 1000))
const start = performance.now()
const multiSource = createDiagramDocumentPresentationSource({ tables: multipleTables })
for (const table of multipleTables) multiSource.getPresentedTableLayout(table.id)
const initialMultipleTablesMs = performance.now() - start
const cachedMultipleTablesMs = average(() => { for (const table of multipleTables) multiSource.getPresentedTableLayout(table.id) }, 10)
console.log(JSON.stringify({ tables: multipleTables.length, cellsPerTable: 1000, initialAllLayoutsMs: initialMultipleTablesMs, cachedAllLayoutsMs: cachedMultipleTablesMs }, null, 2))
multiSource.dispose()
