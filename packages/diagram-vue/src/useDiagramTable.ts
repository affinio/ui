import { computed } from "vue"
import type { ComputedRef } from "vue"
import type { DiagramId, DiagramTable, DiagramTableCell, DiagramTableStyleUpdate } from "@affino/diagram-core"
import type { DiagramEngineController } from "./useDiagramEngine.js"

export type DiagramTableController = Readonly<{
  table: ComputedRef<DiagramTable | null>
  insertRow: (index: number, cells?: ReadonlyArray<DiagramTableCell>) => boolean
  deleteRow: (index: number) => boolean
  insertColumn: (index: number, cells?: ReadonlyArray<DiagramTableCell>) => boolean
  deleteColumn: (index: number) => boolean
  resizeRow: (index: number, height: number) => boolean
  resizeColumn: (index: number, width: number) => boolean
  updateCell: (row: number, column: number, cell: Partial<DiagramTableCell>) => boolean
  updateStyle: (style: DiagramTableStyleUpdate) => boolean
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
    updateCell: (row, column, cell) => dispatch({ type: "updateTableCell", id, row, column, cell }),
    updateStyle: (style) => dispatch({ type: "updateTableStyle", id, style }),
  }
}
