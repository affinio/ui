<script setup lang="ts">
import { computed, ref } from "vue"
import { deserializeDiagramDocument, type DiagramDocument, type DiagramPoint, type DiagramSceneInput, type DiagramTable, type DiagramTableBorderPreset } from "@affino/diagram-core"
import { DiagramTableView, useDiagramEngine, useDiagramPointerController, useDiagramTable, useDiagramViewport, type DiagramInteractionPreviewMode } from "@affino/diagram-vue"
import { useDiagramCanvasGestures } from "./useDiagramCanvasGestures"

const tableId = "table-editor-fixture"
const stage = ref<HTMLElement | null>(null)
const activeCell = ref({ row: 0, column: 0 })
const rangeSelection = ref({ anchor: { row: 0, column: 0 }, active: { row: 0, column: 0 } })
const resizePolicy = ref<"fixed" | "flexible">("flexible")
const interactionPreviewMode = ref<DiagramInteractionPreviewMode>("live")
const status = ref("Select a cell to edit its content or change the table structure.")
const savedDocument = ref<DiagramDocument | null>(null)
const initialScene: DiagramSceneInput = {
  viewport: { x: 0, y: 0, width: 980, height: 650, zoom: 1 },
  selection: { ids: [tableId], primaryId: tableId },
  tables: [{
    id: tableId, kind: "table", x: 170, y: 160, width: 620, height: 266, rowCount: 5, columnCount: 4,
    header: { text: "Workspace inventory", height: 44, horizontalAlign: "left", verticalAlign: "middle" },
    rowHeights: [48, 52, 62, 48, 56], columnWidths: [140, 210, 140, 130],
    style: { grid: { visible: true, stroke: { color: "#82928a", width: 1, style: "solid" } }, border: { visible: true, stroke: { color: "#43584f", width: 1.5, style: "solid" }, radius: 6 }, cellPadding: 10 },
    cells: [
      [{ text: "ID", horizontalAlign: "left", style: { borders: { right: { visible: true, stroke: { color: "#b42318", width: 4, style: "solid" } } } } }, { text: "Name", horizontalAlign: "left", style: { borders: { left: { visible: true, stroke: { color: "#2563eb", width: 2, style: "dashed" } } } } }, { text: "Owner", horizontalAlign: "left" }, { text: "Status", horizontalAlign: "left" }],
      [{ text: "WS-101" }, { text: "North campus" }, { text: "Facilities" }, { text: "Active" }],
      [{ text: "WS-102" }, { text: "Research annex" }, { text: "Engineering" }, { text: "Review" }],
      [{ text: "WS-103" }, { text: "Operations center" }, { text: "IT" }, { text: "Active" }],
      [{ text: "WS-104" }, { text: "Archive building" }, { text: "Records" }, { text: "Planned" }],
    ],
  }],
}
const selectedFixture = ref<"basic" | "title-block" | "revision" | "transformed" | "stress">("basic")

function fixtureTable(rows: number, columns: number, idPrefix: string, values: (row: number, column: number) => string, merged: Array<{ row: number; column: number; rowSpan: number; columnSpan: number }> = []): DiagramTable {
  const cells = Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_, column) => ({ id: `${idPrefix}-${row}-${column}`, text: values(row, column) })))
  const columnWidths = Array.from({ length: columns }, (_, column) => 70 + column % 3 * 20)
  const rowHeights = Array.from({ length: rows }, (_, row) => 24 + row % 2 * 4)
  return {
    id: tableId, kind: "table" as const, x: 170, y: 160, width: columnWidths.reduce((sum, size) => sum + size, 0), height: rowHeights.reduce((sum, size) => sum + size, 0), rowCount: rows, columnCount: columns,
    columnWidths, rowHeights,
    style: { grid: { visible: true, stroke: { color: "#82928a", width: 1, style: "solid" as const } }, border: { visible: true, stroke: { color: "#43584f", width: 1.5, style: "solid" as const }, radius: 2 }, cellPadding: 6, overflow: "wrap" as const },
    cells: cells.map((line, row) => line.map((cell) => ({ ...cell, ...(row === 0 ? { horizontalAlign: "center" as const } : {}), ...(row === 0 ? { style: { background: "#e8efe9", text: { fontWeight: 700 } } } : {}) }))),
    merges: merged.map(({ row, column, rowSpan, columnSpan }) => ({ anchorCellId: cells[row]![column]!.id, rowSpan, columnSpan })),
  }
}

function fixtureScene(name: typeof selectedFixture.value): DiagramSceneInput {
  if (name === "basic") return initialScene
  if (name === "title-block") {
    const contents = [
      ["ENGINEERING DRAWING", "", "", ""],
      ["Logo / mark", "", "DRAWING NUMBER", "KNT-132-CD-001"],
      ["REVISION", "A", "DATE", "2026-11-27"],
      ["", "", "TITLE", "Pump station layout"],
      ["PREPARED", "Engineering", "CHECKED", "QA"],
    ]
    const table = fixtureTable(5, 4, "title", (row, column) => contents[row]![column]!)
    const cells = table.cells!.map((line, row) => line.map((cell, column) => ({
      ...cell,
      ...(row === 0 && column === 0 ? { metadata: { binding: { key: "document.title" } } } : {}),
      ...(row === 1 && column === 2 ? { metadata: { binding: { key: "document.number" } } } : {}),
    })))
    const merges = [
      { anchorCellId: cells[0]![0]!.id!, rowSpan: 1, columnSpan: 4 },
      { anchorCellId: cells[1]![0]!.id!, rowSpan: 1, columnSpan: 2 },
      { anchorCellId: cells[1]![2]!.id!, rowSpan: 1, columnSpan: 2 },
      { anchorCellId: cells[2]![0]!.id!, rowSpan: 2, columnSpan: 1 },
    ]
    return { viewport: initialScene.viewport, tables: [{ ...table, cells, merges }], selection: { ids: [tableId], primaryId: tableId } }
  }
  if (name === "revision") {
    const table = fixtureTable(10, 4, "revision", (row, column) => row === 0 ? ["REV", "DATE", "DESCRIPTION", "APPROVED"][column]! : [`${String.fromCharCode(64 + row)}`, `2026-0${row}-15`, `Revision ${row} — issued for review`, "QA"][column]!)
    const revisionTable: DiagramTable = { ...table, width: 520, columnWidths: [52, 112, 270, 86], rowHeights: Array(10).fill(24), height: 240 }
    return { viewport: initialScene.viewport, tables: [revisionTable], selection: { ids: [tableId], primaryId: tableId } }
  }
  if (name === "transformed") {
    const table = fixtureTable(5, 4, "transform", (row, column) => row === 0 ? ["ZONE", "TAG", "DESCRIPTION", "STATE"][column]! : [`${row}`, `EQ-${row}0${column}`, "Nested group transform test", "ACTIVE"][column]!)
    return {
      viewport: initialScene.viewport,
      tables: [table],
      shapes: [{ id: "fixture-marker", kind: "shape", shape: "rect", x: 680, y: 220, width: 60, height: 34 }],
      groups: [
        { id: "fixture-parent", kind: "group", childIds: ["fixture-nested"], x: 0, y: 0, rotation: -8 },
        { id: "fixture-nested", kind: "group", childIds: [tableId, "fixture-marker"], x: 0, y: 0, rotation: 18, flipX: true },
      ],
      selection: { ids: [tableId], primaryId: tableId },
    }
  }
  const rows = 25, columns = 12
  const merges = [] as Array<{ row: number; column: number; rowSpan: number; columnSpan: number }>
  for (let row = 0; row + 1 < rows; row += 5) for (let column = 0; column + 1 < columns; column += 4) merges.push({ row, column, rowSpan: 2, columnSpan: 2 })
  const table = fixtureTable(rows, columns, "stress", (row, column) => row === 0 ? `COL ${column + 1}` : `R${row + 1} C${column + 1} — sample`, merges)
  return { viewport: initialScene.viewport, tables: [table], selection: { ids: [tableId], primaryId: tableId } }
}

const diagram = useDiagramEngine(initialScene)
const table = useDiagramTable(diagram, tableId)
const viewport = useDiagramViewport(diagram, { element: stage })
const pointer = useDiagramPointerController(diagram, { toWorldPoint })
const gestures = useDiagramCanvasGestures(stage, viewport, () => pointer.cancel())
const handledGestureEvents = new WeakSet<Event>()
const viewBox = computed(() => {
  const current = viewport.viewport.value
  const pan = pointer.state.value.tool === "pan" ? pointer.state.value.previewDelta : null
  return `${current.x - (pan?.x ?? 0)} ${current.y - (pan?.y ?? 0)} ${current.width} ${current.height}`
})
const zoomLabel = computed(() => `${Math.round(viewport.viewport.value.zoom * 100)}%`)
const selectedCell = computed(() => table.table.value?.cells?.[activeCell.value.row]?.[activeCell.value.column]?.text ?? "")
const selectedCellStyle = computed(() => table.table.value?.cells?.[activeCell.value.row]?.[activeCell.value.column] ?? table.table.value?.defaultCell ?? { text: "" })

function toWorldPoint(event: PointerEvent): DiagramPoint {
  const rect = stage.value?.getBoundingClientRect()
  const svg = stage.value?.querySelector("svg")
  const matrix = svg?.getScreenCTM()
  if (svg && matrix) {
    const point = svg.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const world = point.matrixTransform(matrix.inverse())
    return { x: world.x, y: world.y }
  }
  const current = viewport.viewport.value
  return rect ? { x: current.x + (event.clientX - rect.left) * current.width / rect.width, y: current.y + (event.clientY - rect.top) * current.height / rect.height } : { x: current.x, y: current.y }
}
function setCellText(text: string): void { table.updateCell(activeCell.value.row, activeCell.value.column, { text }); status.value = "Cell updated." }
function setHeader(text: string): void {
  const current = table.table.value?.header
  if (current) { table.updateHeader({ ...current, text }); status.value = "Table title updated." }
}
function saveDocument(): void { savedDocument.value = diagram.engine.serializeDocument(); status.value = "Document saved in Workbench memory." }
function restoreDocument(): void {
  if (!savedDocument.value) return
  diagram.engine.transact(() => deserializeDiagramDocument(savedDocument.value!))
  status.value = "Saved document restored."
}
function rotateTable(): void {
  const rotation = table.table.value?.rotation ?? 0
  diagram.dispatch({ type: "rotateEntities", entries: [{ id: tableId, rotation: rotation + 90 }] })
  status.value = "Table rotated 90 degrees."
}
function reflectTable(): void {
  diagram.dispatch({ type: "flipEntities", ids: [tableId], axis: "horizontal" })
  status.value = "Table reflected horizontally."
}
function setCustomTablePivot(): void {
  diagram.dispatch({ type: "setTransformOrigin", id: tableId, transformOrigin: { mode: "relative", x: 0.25, y: 0.75 }, preserveWorldGeometry: true })
  status.value = "Custom transform origin applied."
}
function resetView(): void { viewport.setViewport({ ...initialScene.viewport, x: 0, y: 0, zoom: 1 }) }
function loadFixture(name: typeof selectedFixture.value): void {
  selectedFixture.value = name
  diagram.engine.transact(() => fixtureScene(name))
  activeCell.value = { row: 0, column: 0 }
  rangeSelection.value = { anchor: activeCell.value, active: activeCell.value }
  status.value = `${name} fixture loaded.`
}
function addRow(): void { if (table.insertRow(table.table.value?.rowCount ?? 0)) status.value = "Row inserted." }
function removeRow(): void { if (table.deleteRow(activeCell.value.row)) status.value = "Selected row removed." }
function addColumn(): void { if (table.insertColumn(table.table.value?.columnCount ?? 0)) status.value = "Column inserted." }
function removeColumn(): void { if (table.deleteColumn(activeCell.value.column)) status.value = "Selected column removed." }
function selectActiveRow(): void { const row = activeCell.value.row; rangeSelection.value = { anchor: { row, column: 0 }, active: { row, column: (table.table.value?.columnCount ?? 1) - 1 } } }
function selectActiveColumn(): void { const column = activeCell.value.column; rangeSelection.value = { anchor: { row: 0, column }, active: { row: (table.table.value?.rowCount ?? 1) - 1, column } } }
function mergeRight(): void {
  const result = table.mergeCells(activeCell.value, { row: activeCell.value.row, column: activeCell.value.column + 1 })
  status.value = result ? "Cell merged with its right neighbor." : "Merge rejected. Resolve secondary cell content or choose the explicit keep-anchor operation."
}
function mergeSelection(): void {
  const result = table.mergeCells(rangeSelection.value.anchor, rangeSelection.value.active, "keep-anchor")
  status.value = result ? "Selected range merged with the anchor content and metadata kept." : "The selected range cannot be merged."
}
function unmerge(): void { if (table.unmergeCell(activeCell.value.row, activeCell.value.column)) status.value = "Merged cell split." }
function updateRangeStyle(style: NonNullable<NonNullable<typeof selectedCellStyle.value.style>>): void {
  const { anchor, active } = rangeSelection.value
  table.updateRange(anchor, active, { style })
}
function updateRangeTextStyle(style: NonNullable<NonNullable<typeof selectedCellStyle.value.style>['text']>): void {
  updateRangeStyle({ text: { ...(selectedCellStyle.value.style?.text ?? {}), ...style } })
}
function setRangeBorders(preset: string): void {
  const { anchor, active } = rangeSelection.value
  table.setBorders(anchor, active, preset as DiagramTableBorderPreset, { visible: true, stroke: { color: table.table.value?.style?.grid.stroke.color ?? "#82928a", width: table.table.value?.style?.grid.stroke.width ?? 1 } })
}
function updateGridColor(color: string): void { table.updateStyle({ grid: { ...table.table.value!.style!.grid, stroke: { ...table.table.value!.style!.grid.stroke, color } } }) }
function updateGridWidth(width: number): void { table.updateStyle({ grid: { ...table.table.value!.style!.grid, stroke: { ...table.table.value!.style!.grid.stroke, width } } }) }
function capturePointerdown(event: PointerEvent): void {
  if (gestures.pointerDown(event)) { handledGestureEvents.add(event); event.stopPropagation() }
}
function capturePointermove(event: PointerEvent): void {
  if (gestures.pointerMove(event)) { handledGestureEvents.add(event); event.stopPropagation() }
}
function capturePointerup(event: PointerEvent): void { if (gestures.pointerUp(event)) handledGestureEvents.add(event) }
function capturePointercancel(event: PointerEvent): void { if (gestures.pointerCancel(event)) handledGestureEvents.add(event) }
function onPointerdown(event: PointerEvent): void { if (!handledGestureEvents.has(event)) pointer.getSvgPointerProps().onPointerdown(event) }
function onPointermove(event: PointerEvent): void { if (!handledGestureEvents.has(event)) pointer.getSvgPointerProps().onPointermove(event) }
function onPointerup(event: PointerEvent): void { if (!handledGestureEvents.has(event)) pointer.getSvgPointerProps().onPointerup(event) }
function onPointercancel(event: PointerEvent): void { if (!handledGestureEvents.has(event)) pointer.cancel() }
</script>

<template>
  <main class="table-editor">
    <header class="table-editor__header">
      <div><p class="eyebrow">Affino Diagram · table workbench</p><h1>Table constructor</h1><p>Edit cells and table structure beside the canvas.</p></div>
      <nav class="diagram-demo-nav" aria-label="Diagram demos">
        <RouterLink to="/diagram">Full generation</RouterLink><RouterLink to="/diagram/table" aria-current="page">Table constructor</RouterLink>
        <RouterLink to="/diagram/connectors">Ports + connectors</RouterLink><RouterLink to="/diagram/grid">Grid movement</RouterLink><RouterLink to="/diagram/canvas">Free canvas</RouterLink>
      </nav>
    </header>
    <div class="table-editor__workspace">
      <section class="table-editor__canvas" aria-label="Table canvas">
        <div class="table-editor__canvas-tools">
          <button type="button" @click="pointer.setTool('select')">Select / move table</button><button type="button" @click="pointer.setTool('pan')">Pan canvas</button>
          <button type="button" @click="diagram.dispatch({ type: 'undo' })">Undo</button><button type="button" @click="diagram.dispatch({ type: 'redo' })">Redo</button>
          <button type="button" @click="saveDocument">Save document</button><button type="button" :disabled="!savedDocument" @click="restoreDocument">Restore document</button>
          <button type="button" @click="rotateTable">Rotate table 90°</button><button type="button" @click="reflectTable">Reflect table</button><button type="button" @click="setCustomTablePivot">Custom pivot</button>
          <button type="button" @click="resetView">Reset view</button><output>{{ zoomLabel }}</output>
        </div>
        <div ref="stage" class="table-editor__stage">
          <svg :viewBox="viewBox" tabindex="0" aria-label="Editable table canvas" @pointerdown.capture="capturePointerdown" @pointermove.capture="capturePointermove" @pointerup.capture="capturePointerup" @pointercancel.capture="capturePointercancel" @pointerdown="onPointerdown" @pointermove="onPointermove" @pointerup="onPointerup" @pointercancel="onPointercancel" @lostpointercapture="onPointercancel" @wheel="gestures.wheel">
            <rect x="-2000" y="-2000" width="5000" height="5000" fill="#f6f7f4" pointer-events="none" />
            <DiagramTableView :id="tableId" :controller="diagram" :pointer="pointer" :show-toolbar="false" :resize-policy="resizePolicy" :interaction-preview-mode="interactionPreviewMode" v-model:active-cell="activeCell" v-model:range-selection="rangeSelection" />
          </svg>
        </div>
      </section>
      <aside class="table-editor__inspector" aria-label="Table constructor">
        <h2>Table constructor</h2>
        <label>Table fixture <select aria-label="Table fixture" v-model="selectedFixture" @change="loadFixture(($event.target as HTMLSelectElement).value as typeof selectedFixture)"><option value="basic">Basic Table</option><option value="title-block">Engineering title block</option><option value="revision">Revision Table</option><option value="transformed">Nested transformed Table</option><option value="stress">Stress Table (25 × 12)</option></select></label>
        <button type="button" @click="loadFixture(selectedFixture)">Reset fixture</button>
        <label>Title <input :value="table.table.value?.header?.text" @change="setHeader(($event.target as HTMLInputElement).value)" /></label>
        <label>Cell text <textarea :value="selectedCell" :aria-label="`Edit row ${activeCell.row + 1}, column ${activeCell.column + 1}`" @change="setCellText(($event.target as HTMLTextAreaElement).value)" /></label>
        <div class="table-editor__actions"><button type="button" @click="selectActiveRow">Select active row</button><button type="button" @click="selectActiveColumn">Select active column</button><button type="button" @click="addRow">Add row</button><button type="button" @click="removeRow">Remove selected row</button><button type="button" @click="addColumn">Add column</button><button type="button" @click="removeColumn">Remove selected column</button><button type="button" @click="mergeSelection">Merge selected (keep anchor)</button><button type="button" @click="mergeRight">Merge right (reject conflicts)</button><button type="button" @click="unmerge">Unmerge selected</button><button type="button" @click="diagram.dispatch({ type: 'updateTableCellRange', id: tableId, startRow: rangeSelection.anchor.row, endRow: rangeSelection.active.row, startColumn: rangeSelection.anchor.column, endColumn: rangeSelection.active.column, cell: { style: undefined } })">Reset range appearance</button></div>
        <label>Track resize policy <select v-model="resizePolicy"><option value="flexible">Flexible total size</option><option value="fixed">Fixed total size</option></select></label>
        <label>Interaction preview <select v-model="interactionPreviewMode" aria-label="Table interaction preview mode"><option value="live">Live</option><option value="ghost">Ghost</option><option value="outline">Outline</option></select></label>
        <label>Table width <input type="number" min="1" step="0.1" :value="table.table.value?.width" @change="table.setSize(Number(($event.target as HTMLInputElement).value), table.table.value?.height)" /></label>
        <label>Table height <input type="number" min="1" step="0.1" :value="table.table.value?.height" @change="table.setSize(table.table.value?.width, Number(($event.target as HTMLInputElement).value))" /></label>
        <label>Default cell padding <input type="number" min="0" step="0.1" :value="table.table.value?.style?.cellPadding ?? 8" @change="table.updateStyle({ cellPadding: Number(($event.target as HTMLInputElement).value) })" /></label>
        <label>Table background <input type="color" :value="table.table.value?.style?.background ?? '#ffffff'" @change="table.updateStyle({ background: ($event.target as HTMLInputElement).value })" /></label>
        <label>Default text overflow <select :value="table.table.value?.style?.overflow ?? 'clip'" @change="table.updateStyle({ overflow: ($event.target as HTMLSelectElement).value as 'clip' | 'wrap' | 'visible' })"><option value="clip">Clip</option><option value="wrap">Wrap</option><option value="visible">Visible</option></select></label>
        <label>Selected row height <input type="number" min="1" step="0.1" :value="table.table.value?.rowHeights?.[activeCell.row]" @change="table.resizeRowWithPolicy(activeCell.row, Number(($event.target as HTMLInputElement).value), resizePolicy)" /></label>
        <label>Selected column width <input type="number" min="1" step="0.1" :value="table.table.value?.columnWidths?.[activeCell.column]" @change="table.resizeColumnWithPolicy(activeCell.column, Number(($event.target as HTMLInputElement).value), resizePolicy)" /></label>
        <label>Cell alignment <select :value="selectedCellStyle.horizontalAlign ?? 'left'" @change="table.updateCell(activeCell.row, activeCell.column, { horizontalAlign: ($event.target as HTMLSelectElement).value as 'left' | 'center' | 'right' })"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
        <label>Vertical alignment <select :value="selectedCellStyle.verticalAlign ?? 'middle'" @change="table.updateCell(activeCell.row, activeCell.column, { verticalAlign: ($event.target as HTMLSelectElement).value as 'top' | 'middle' | 'bottom' })"><option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option></select></label>
        <label>Cell background <input type="color" :value="selectedCellStyle.style?.background ?? '#ffffff'" @change="updateRangeStyle({ background: ($event.target as HTMLInputElement).value })" /></label>
        <label>Font family <input :value="selectedCellStyle.style?.text?.fontFamily ?? table.table.value?.style?.text?.fontFamily ?? 'Arial'" @change="updateRangeTextStyle({ fontFamily: ($event.target as HTMLInputElement).value })" /></label>
        <label>Font size <input type="number" min="1" step="0.5" :value="selectedCellStyle.style?.text?.fontSize ?? table.table.value?.style?.text?.fontSize ?? 14" @change="updateRangeTextStyle({ fontSize: Number(($event.target as HTMLInputElement).value) })" /></label>
        <label>Font weight <select :value="selectedCellStyle.style?.text?.fontWeight ?? table.table.value?.style?.text?.fontWeight ?? 400" @change="updateRangeTextStyle({ fontWeight: Number(($event.target as HTMLSelectElement).value) })"><option :value="400">Regular</option><option :value="600">Semibold</option><option :value="700">Bold</option></select></label>
        <label>Font style <select :value="selectedCellStyle.style?.text?.fontStyle ?? table.table.value?.style?.text?.fontStyle ?? 'normal'" @change="updateRangeTextStyle({ fontStyle: ($event.target as HTMLSelectElement).value as 'normal' | 'italic' })"><option value="normal">Normal</option><option value="italic">Italic</option></select></label>
        <label>Text color <input type="color" :value="selectedCellStyle.style?.text?.color ?? table.table.value?.style?.text?.color ?? '#263b32'" @change="updateRangeTextStyle({ color: ($event.target as HTMLInputElement).value })" /></label>
        <label>Cell top padding <input type="number" min="0" step="0.1" :value="selectedCellStyle.style?.padding?.top ?? table.table.value?.style?.cellPadding ?? 8" @change="updateRangeStyle({ padding: { top: Number(($event.target as HTMLInputElement).value) } })" /></label>
        <label>Cell right padding <input type="number" min="0" step="0.1" :value="selectedCellStyle.style?.padding?.right ?? table.table.value?.style?.cellPadding ?? 8" @change="updateRangeStyle({ padding: { right: Number(($event.target as HTMLInputElement).value) } })" /></label>
        <label>Cell bottom padding <input type="number" min="0" step="0.1" :value="selectedCellStyle.style?.padding?.bottom ?? table.table.value?.style?.cellPadding ?? 8" @change="updateRangeStyle({ padding: { bottom: Number(($event.target as HTMLInputElement).value) } })" /></label>
        <label>Cell left padding <input type="number" min="0" step="0.1" :value="selectedCellStyle.style?.padding?.left ?? table.table.value?.style?.cellPadding ?? 8" @change="updateRangeStyle({ padding: { left: Number(($event.target as HTMLInputElement).value) } })" /></label>
        <label>Cell text overflow <select :value="selectedCellStyle.style?.overflow ?? 'clip'" @change="updateRangeStyle({ overflow: ($event.target as HTMLSelectElement).value as 'clip' | 'wrap' | 'visible' })"><option value="clip">Clip</option><option value="wrap">Wrap</option><option value="visible">Visible</option></select></label>
        <label>Range border preset <select aria-label="Range border preset" @change="setRangeBorders(($event.target as HTMLSelectElement).value)"><option value="all">All borders</option><option value="outside">Outside borders</option><option value="inside">Inside borders</option><option value="top">Top border</option><option value="right">Right border</option><option value="bottom">Bottom border</option><option value="left">Left border</option><option value="none">No borders</option><option value="reset">Reset borders</option></select></label>
        <label>Grid color <input type="color" :value="table.table.value?.style?.grid.stroke.color ?? '#8a9690'" @change="updateGridColor(($event.target as HTMLInputElement).value)" /></label>
        <label>Grid width <input type="number" min="0" max="8" step="0.5" :value="table.table.value?.style?.grid.stroke.width ?? 1" @change="updateGridWidth(Number(($event.target as HTMLInputElement).value))" /></label>
        <p class="table-editor__status" role="status">{{ status }}</p>
      </aside>
    </div>
  </main>
</template>

<style scoped>
.table-editor { min-height: 0; flex: 1 1 auto; display: flex; flex-direction: column; gap: .8rem; color: #263b32; }
.table-editor__header { display:flex; justify-content:space-between; align-items:end; flex-wrap:wrap; gap:1rem; }
.table-editor__header h1 { margin:0; font-size:clamp(1.6rem,3vw,2.3rem); }.table-editor__header p:last-child { margin:.35rem 0 0; color:#64736b; }
.eyebrow { margin:0 0 .3rem; color:#65746d; font-size:.72rem; font-weight:800; letter-spacing:.15em; text-transform:uppercase; }
.diagram-demo-nav { display:flex; flex-wrap:wrap; gap:.35rem; }.diagram-demo-nav a { padding:.45rem .65rem; border:1px solid #d4ddd6; border-radius:999px; color:#2d5146; text-decoration:none; font-size:.78rem; font-weight:700; }.diagram-demo-nav a[aria-current="page"] { color:white; background:#285247; }
.table-editor__workspace { display:grid; grid-template-columns:minmax(0,1fr) 300px; gap:.8rem; min-height:0; flex:1; }
.table-editor__canvas { display:flex; flex-direction:column; min-width:0; min-height:0; gap:.5rem; }.table-editor__canvas-tools { display:flex; flex-wrap:wrap; gap:.4rem; align-items:center; }.table-editor button,.table-editor input,.table-editor select,.table-editor textarea { font:inherit; }.table-editor button { padding:.4rem .6rem; border:1px solid #d0d9d2; border-radius:.45rem; background:#fff; color:#29493e; cursor:pointer; }.table-editor__canvas-tools output { margin-left:auto; color:#596a61; font-variant-numeric:tabular-nums; }
.table-editor__stage { flex:1; min-height:26rem; overflow:hidden; border:1px solid #cbd6ce; border-radius:.8rem; background:#f6f7f4; }.table-editor__stage svg { display:block; width:100%; height:100%; min-height:26rem; touch-action:none; user-select:none; -webkit-user-select:none; }
.table-editor__inspector { display:flex; flex-direction:column; gap:.75rem; padding:.9rem; overflow:auto; border:1px solid #d8e0d9; border-radius:.8rem; background:#fffefa; }.table-editor__inspector h2 { margin:0; font-size:1.05rem; }.table-editor__inspector label { display:grid; gap:.3rem; color:#53645b; font-size:.82rem; font-weight:700; }.table-editor__inspector input:not([type=color]),.table-editor__inspector select,.table-editor__inspector textarea { width:100%; box-sizing:border-box; padding:.45rem .55rem; border:1px solid #ccd7ce; border-radius:.4rem; color:#253930; background:white; }.table-editor__inspector textarea { min-height:5rem; resize:vertical; }.table-editor__actions { display:grid; grid-template-columns:1fr 1fr; gap:.35rem; }.table-editor__actions button { min-height:2.4rem; font-size:.76rem; }.table-editor__status { min-height:2.5rem; margin:auto 0 0; color:#52675d; font-size:.82rem; }
@media(max-width:900px) { .table-editor__workspace { grid-template-columns:1fr; }.table-editor__inspector { max-height:40vh; }.table-editor__stage { min-height:48vh; } }
</style>
