import { computed } from "vue"
import type { ComputedRef } from "vue"
import type { DiagramId, DiagramTable, DiagramTableBorderPreset, DiagramTableCell, DiagramTableCellBorder, DiagramTableHeader, DiagramTableStyleUpdate } from "@affino/diagram-core"
import type { DiagramEngineController } from "./useDiagramEngine.js"

export type DiagramTableController = Readonly<{
  table: ComputedRef<DiagramTable | null>
  insertRow: (index: number, cells?: ReadonlyArray<DiagramTableCell>) => boolean
  deleteRow: (index: number) => boolean
  insertColumn: (index: number, cells?: ReadonlyArray<DiagramTableCell>) => boolean
  deleteColumn: (index: number) => boolean
  resizeRow: (index: number, height: number) => boolean
  resizeColumn: (index: number, width: number) => boolean
  resizeRowWithPolicy: (index: number, height: number, policy: "fixed" | "flexible") => boolean
  resizeColumnWithPolicy: (index: number, width: number, policy: "fixed" | "flexible") => boolean
  setSize: (width?: number, height?: number) => boolean
  updateCell: (row: number, column: number, cell: Partial<DiagramTableCell>) => boolean
  updateRange: (start: { row: number; column: number }, end: { row: number; column: number }, cell: Partial<DiagramTableCell>) => boolean
  setBorders: (start: { row: number; column: number }, end: { row: number; column: number }, preset: DiagramTableBorderPreset, border?: DiagramTableCellBorder) => boolean
  updateStyle: (style: DiagramTableStyleUpdate) => boolean
  updateHeader: (header: DiagramTableHeader | null) => boolean
  mergeCells: (start: { row: number; column: number }, end: { row: number; column: number }, contentPolicy?: "reject-non-empty" | "keep-anchor") => boolean
  unmergeCell: (row: number, column: number) => boolean
}>

export function useDiagramTable(controller: DiagramEngineController, id: DiagramId): DiagramTableController {
  const table = computed(() => controller.scene.value.entities.tablesById.get(id) ?? null)
  const dispatch = (command: Parameters<DiagramEngineController["dispatch"]>[0]) => controller.dispatch(command).changed
  return {
    table,
    insertRow: (index, cells) => dispatch({ type: "insertTableRow", id, index, cells }),
    deleteRow: (index) => dispatch({ type: "deleteTableRow", id, index }),
    insertColumn: (index, cells) => dispatch({ type: "insertTableColumn", id, index, cells }),
    deleteColumn: (index) => dispatch({ type: "deleteTableColumn", id, index }),
    resizeRow: (index, height) => dispatch({ type: "resizeTableRow", id, index, height }),
    resizeColumn: (index, width) => dispatch({ type: "resizeTableColumn", id, index, width }),
    resizeRowWithPolicy: (index, height, policy) => dispatch({ type: "resizeTableRow", id, index, height, policy }),
    resizeColumnWithPolicy: (index, width, policy) => dispatch({ type: "resizeTableColumn", id, index, width, policy }),
    setSize: (width, height) => dispatch({ type: "setTableSize", id, width, height, distribution: "proportional" }),
    updateCell: (row, column, cell) => dispatch({ type: "updateTableCell", id, row, column, cell }),
    updateRange: (start, end, cell) => dispatch({ type: "updateTableCellRange", id, startRow: start.row, endRow: end.row, startColumn: start.column, endColumn: end.column, cell }),
    setBorders: (start, end, preset, border) => dispatch({ type: "setTableCellBorders", id, startRow: start.row, endRow: end.row, startColumn: start.column, endColumn: end.column, preset, border }),
    updateStyle: (style) => dispatch({ type: "updateTableStyle", id, style }),
    updateHeader: (header) => dispatch({ type: "updateTableHeader", id, header }),
    mergeCells: (start, end, contentPolicy) => dispatch({ type: "mergeTableCells", id, startRow: start.row, endRow: end.row, startColumn: start.column, endColumn: end.column, contentPolicy }),
    unmergeCell: (row, column) => dispatch({ type: "unmergeTableCell", id, row, column }),
  }
}
