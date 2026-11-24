import { computed, defineComponent, h, nextTick, ref, watch } from "vue"
import type { PropType, VNodeChild } from "vue"
import type { DiagramTable, DiagramTableCell, DiagramTableCellPosition, DiagramTableHorizontalAlignment, DiagramTableStyle, DiagramTableVerticalAlignment } from "@affino/diagram-core"
import { rectFromPoints, rotatePoint } from "@affino/diagram-core"
import type { DiagramEngineController } from "./useDiagramEngine.js"
import type { DiagramPointerController } from "./useDiagramPointerController.js"
import { svgTransform } from "./useDiagramRenderer.js"
import { useDiagramTable } from "./useDiagramTable.js"

/** SVG-native table renderer with one accessible foreignObject editor and toolbar while selected. */
export const DiagramTableView = defineComponent({
  name: "DiagramTableView",
  props: {
    controller: { type: Object as PropType<DiagramEngineController>, required: true },
    /** Optional pointer controller used to project transient movement and resize previews. */
    pointer: { type: Object as PropType<DiagramPointerController>, required: false },
    /** Hides only the built-in formatting toolbar; defaults to visible. */
    showToolbar: { type: Boolean, default: true },
    /** Zero-based interface state. Defaults to the first cell and is never serialized. */
    activeCell: { type: Object as PropType<DiagramTableCellPosition | null>, default: undefined },
    id: { type: String, required: true },
  },
  emits: { "update:activeCell": (_cell: DiagramTableCellPosition) => true },
  setup(props, { emit }) {
    const model = useDiagramTable(props.controller, props.id)
    const selected = computed(() => props.controller.scene.value.selection.ids.includes(props.id))
    const pointerSnapshot = computed(() => props.pointer?.state.value ?? null)
    const projectedTable = computed(() => {
      const table = model.table.value
      const pointer = props.pointer
      const interaction = pointerSnapshot.value
      if (!table || !pointer || !interaction?.active) return table
      const tableResizePreview = interaction.tableResizePreview
      if (tableResizePreview?.id === table.id) return {
        ...table,
        width: tableResizePreview.width,
        height: tableResizePreview.height,
        columnWidths: [...tableResizePreview.columnWidths],
        rowHeights: [...tableResizePreview.rowHeights],
      }
      const geometry = pointer.interaction.getPreviewGeometry(props.id)
      if (!geometry || geometry.kind !== "table") return table
      const bounds = geometry.unrotatedBounds ?? geometry.bounds
      const headerHeight = table.header?.height ?? 0
      const previousOuterHeight = table.height + headerHeight
      const scaleX = table.width === 0 ? 1 : bounds.width / table.width
      const scaleY = previousOuterHeight === 0 ? 1 : bounds.height / previousOuterHeight
      const nextHeaderHeight = headerHeight * scaleY
      return {
        ...table,
        x: bounds.x,
        y: bounds.y + nextHeaderHeight,
        width: bounds.width,
        height: bounds.height - nextHeaderHeight,
        columnWidths: table.columnWidths?.map((size) => size * scaleX),
        rowHeights: table.rowHeights?.map((size) => size * scaleY),
        ...(table.header ? { header: { ...table.header, height: nextHeaderHeight } } : {}),
      }
    })
    const selectedCell = ref<DiagramTableCellPosition>(props.activeCell ?? { row: 0, column: 0 })
    const editing = ref<{ row: number; column: number; text: string } | null>(null)
    const headerEditing = ref<string | null>(null)
    const input = ref<HTMLInputElement | null>(null)
    const tableRoot = ref<SVGGElement | null>(null)
    const clampCell = (cell: DiagramTableCellPosition, table: DiagramTable | null): DiagramTableCellPosition => table
      ? { row: Math.max(0, Math.min(table.rowCount - 1, Math.trunc(cell.row))), column: Math.max(0, Math.min(table.columnCount - 1, Math.trunc(cell.column))) }
      : { row: 0, column: 0 }
    const setActiveCell = (cell: DiagramTableCellPosition, table = model.table.value) => {
      const next = clampCell(cell, table)
      selectedCell.value = next
      emit("update:activeCell", next)
    }
    watch(() => props.activeCell, (cell) => {
      const next = clampCell(cell ?? { row: 0, column: 0 }, model.table.value)
      if (next.row !== selectedCell.value.row || next.column !== selectedCell.value.column) setActiveCell(next)
    })
    watch(() => model.table.value && [model.table.value.rowCount, model.table.value.columnCount], () => {
      const next = clampCell(selectedCell.value, model.table.value)
      if (next.row !== selectedCell.value.row || next.column !== selectedCell.value.column) setActiveCell(next)
    })
    watch(editing, (value) => { if (value) void nextTick(() => input.value?.focus()) })
    watch(headerEditing, (value) => { if (value !== null) void nextTick(() => input.value?.focus()) })
    const focusCell = (row: number, column: number) => { void nextTick(() => tableRoot.value?.querySelector<SVGRectElement>(`[data-table-row="${row}"][data-table-column="${column}"]`)?.focus()) }

    const currentCell = (table: DiagramTable, row: number, column: number): DiagramTableCell => table.cells?.[row]?.[column] ?? table.defaultCell ?? { text: "" }
    const commitEdit = (expected?: { row: number; column: number; text: string }, restoreFocus = false) => {
      const edit = editing.value
      if (!edit || (expected && edit !== expected)) return false
      editing.value = null
      const changed = model.updateCell(edit.row, edit.column, { text: edit.text })
      if (restoreFocus) focusCell(edit.row, edit.column)
      return changed
    }
    const cancelEdit = () => { const edit = editing.value; editing.value = null; if (edit) focusCell(edit.row, edit.column) }
    const beginEdit = (table: DiagramTable, row: number, column: number, initialText?: string) => {
      setActiveCell({ row, column }, table)
      editing.value = { row, column, text: initialText ?? currentCell(table, row, column).text }
    }
    const beginHeaderEdit = (table: DiagramTable, initialText?: string) => { headerEditing.value = initialText ?? table.header?.text ?? "" }
    const commitHeaderEdit = (expected?: string) => {
      if (headerEditing.value === null || (expected !== undefined && headerEditing.value !== expected)) return false
      const text = headerEditing.value
      headerEditing.value = null
      const header = model.table.value?.header
      return header ? model.updateHeader({ ...header, text }) : false
    }
    const cancelHeaderEdit = () => { headerEditing.value = null }
    const navigateEdit = (table: DiagramTable, rowDelta: number, columnDelta: number, expected?: { row: number; column: number; text: string }) => {
      commitEdit(expected)
      const row = Math.max(0, Math.min(table.rowCount - 1, selectedCell.value.row + rowDelta))
      const column = Math.max(0, Math.min(table.columnCount - 1, selectedCell.value.column + columnDelta))
      beginEdit(table, row, column)
    }
    const stopToolbarEvent = (event: Event) => event.stopPropagation()
    const button = (label: string, action: () => void) => h("button", { type: "button", "aria-label": label, onPointerdown: stopToolbarEvent, onClick: (event: Event) => { event.stopPropagation(); action() }, style: buttonStyle }, label)
    const select = (label: string, value: string, values: ReadonlyArray<string>, update: (value: string) => void) => h("label", { style: fieldStyle }, [
      h("span", { style: visuallyHiddenStyle }, label),
      h("select", { "aria-label": label, value, onPointerdown: stopToolbarEvent, onChange: (event: Event) => { event.stopPropagation(); update((event.target as HTMLSelectElement).value) }, style: inputStyle }, values.map((entry) => h("option", { value: entry }, entry))),
    ])
    const checkbox = (label: string, checked: boolean, update: (value: boolean) => void) => h("label", { style: fieldStyle }, [
      h("input", { type: "checkbox", "aria-label": label, checked, onPointerdown: stopToolbarEvent, onChange: (event: Event) => { event.stopPropagation(); update((event.target as HTMLInputElement).checked) } }), label,
    ])
    const numberInput = (label: string, value: number, update: (value: number) => void, min = 0) => h("label", { style: fieldStyle }, [
      h("span", { style: visuallyHiddenStyle }, label), h("input", { type: "number", "aria-label": label, value, min, step: 1, onPointerdown: stopToolbarEvent, onChange: (event: Event) => { event.stopPropagation(); update(Number((event.target as HTMLInputElement).value)) }, style: inputStyle }),
    ])

    return () => {
      const table = projectedTable.value
      if (!table) return null
      const style = table.style ?? defaultStyle
      const columnOffsets = offsets(table.columnWidths ?? [], table.x)
      const rowOffsets = offsets(table.rowHeights ?? [], table.y)
      const padding = style.cellPadding ?? 8
      const headerHeight = table.header?.height ?? 0
      const outerBounds = { x: table.x, y: table.y - headerHeight, width: table.width, height: table.height + headerHeight }
      const children: VNodeChild[] = [
        h("rect", { x: outerBounds.x, y: outerBounds.y, width: outerBounds.width, height: outerBounds.height, rx: style.border.radius, fill: "var(--affino-diagram-table-surface, var(--affino-surface, #ffffff))", stroke: "none" }),
      ]
      if (table.header) {
        const header = table.header
        const headerY = table.y - header.height
        const headerAnchor = header.horizontalAlign === "center" ? "middle" : header.horizontalAlign === "right" ? "end" : "start"
        const headerTextX = headerAnchor === "start" ? table.x + padding : headerAnchor === "end" ? table.x + table.width - padding : table.x + table.width / 2
        const headerVertical = header.verticalAlign ?? "middle"
        const headerTextY = headerVertical === "top" ? headerY + padding : headerVertical === "bottom" ? headerY + header.height - padding : headerY + header.height / 2
        const headerBaseline = headerVertical === "top" ? "hanging" : headerVertical === "bottom" ? "text-after-edge" : "middle"
        children.push(h("rect", { x: table.x, y: headerY, width: table.width, height: header.height, fill: "transparent", role: "button", tabindex: 0, "aria-label": `Table title: ${header.text || "empty"}`, "data-table-header": "true", onClick: (event: Event) => { event.stopPropagation(); beginHeaderEdit(table) }, onDblclick: (event: Event) => { event.stopPropagation(); beginHeaderEdit(table) }, onKeydown: (event: KeyboardEvent) => onHeaderKey(event, beginHeaderEdit, table) }))
        children.push(h("text", { x: headerTextX, y: headerTextY, "text-anchor": headerAnchor, "dominant-baseline": headerBaseline, "data-table-header-text": "true", fill: "var(--affino-diagram-table-text, currentColor)", "font-size": 14, "pointer-events": "none" }, header.text))
        if (style.grid.visible) children.push(h("line", { x1: table.x, y1: table.y, x2: table.x + table.width, y2: table.y, stroke: style.grid.stroke.color, "stroke-width": style.grid.stroke.width, "stroke-dasharray": dash(style.grid.stroke.style), "vector-effect": "non-scaling-stroke", "pointer-events": "none" }))
      }
      if (style.grid.visible) {
        for (let column = 1; column < table.columnCount; column += 1) children.push(h("line", { x1: columnOffsets[column], y1: table.y, x2: columnOffsets[column], y2: table.y + table.height, stroke: style.grid.stroke.color, "stroke-width": style.grid.stroke.width, "stroke-dasharray": dash(style.grid.stroke.style), "vector-effect": "non-scaling-stroke", "pointer-events": "none" }))
        for (let row = 1; row < table.rowCount; row += 1) children.push(h("line", { x1: table.x, y1: rowOffsets[row], x2: table.x + table.width, y2: rowOffsets[row], stroke: style.grid.stroke.color, "stroke-width": style.grid.stroke.width, "stroke-dasharray": dash(style.grid.stroke.style), "vector-effect": "non-scaling-stroke", "pointer-events": "none" }))
      }
      for (let row = 0; row < table.rowCount; row += 1) {
        for (let column = 0; column < table.columnCount; column += 1) {
          const cell = currentCell(table, row, column)
          const x = columnOffsets[column]!
          const y = rowOffsets[row]!
          const width = table.columnWidths![column]!
          const height = table.rowHeights![row]!
          const active = selectedCell.value.row === row && selectedCell.value.column === column
          const isEditing = editing.value?.row === row && editing.value?.column === column
          const anchor = cell.horizontalAlign === "center" ? "middle" : cell.horizontalAlign === "right" ? "end" : "start"
          const textX = anchor === "start" ? x + padding : anchor === "end" ? x + width - padding : x + width / 2
          const textY = cell.verticalAlign === "top" ? y + padding : cell.verticalAlign === "bottom" ? y + height - padding : y + height / 2
          children.push(h("rect", { class: "affino-diagram-table-cell", x, y, width, height, fill: active && selected.value ? "var(--affino-diagram-table-active-cell, color-mix(in srgb, var(--affino-accent, #3b82f6) 14%, transparent))" : "transparent", stroke: active && selected.value ? "var(--affino-focus-ring-color, var(--affino-accent, #3b82f6))" : "transparent", "stroke-width": active && selected.value ? 2 : 0, role: "gridcell", tabindex: active ? 0 : -1, "aria-selected": active ? "true" : "false", "data-table-row": row, "data-table-column": column, "aria-label": `Row ${row + 1}, column ${column + 1}: ${cell.text}`, onFocus: () => setActiveCell({ row, column }, table), onClick: (event: Event) => { event.stopPropagation(); setActiveCell({ row, column }, table) }, onDblclick: (event: Event) => { event.stopPropagation(); beginEdit(table, row, column) }, onKeydown: (event: KeyboardEvent) => onCellKey(event, table, row, column, beginEdit, setActiveCell) }))
          if (!isEditing) children.push(h("text", { x: textX, y: textY, "text-anchor": anchor, "dominant-baseline": cell.verticalAlign === "top" ? "hanging" : cell.verticalAlign === "bottom" ? "auto" : "middle", fill: "var(--affino-diagram-table-text, currentColor)", "font-size": 14, "pointer-events": "none" }, cell.text))
        }
      }
      if (selected.value && props.pointer) {
        const zoom = props.controller.scene.value.viewport.zoom || 1
        const hitSize = 12 / zoom
        const startTableResize = (event: PointerEvent, axis: "row" | "column", index: number) => {
          event.preventDefault()
          event.stopPropagation()
          props.pointer?.beginTableResizeHandle(props.id, axis, index, event)
        }
        const cancelTableResize = (event: KeyboardEvent) => {
          if (event.key !== "Escape") return
          event.preventDefault()
          event.stopPropagation()
          props.pointer?.cancel()
        }
        for (let column = 1; column < table.columnCount; column += 1) {
          const x = columnOffsets[column]!
          children.push(h("rect", { x: x - hitSize / 2, y: table.y, width: hitSize, height: table.height, fill: "transparent", cursor: "col-resize", role: "separator", "aria-orientation": "vertical", "aria-label": `Resize column ${column}`, tabindex: 0, "data-table-resize": "column", "data-table-boundary": column, onPointerdown: (event: PointerEvent) => startTableResize(event, "column", column - 1), onKeydown: cancelTableResize }))
        }
        for (let row = 1; row < table.rowCount; row += 1) {
          const y = rowOffsets[row]!
          children.push(h("rect", { x: table.x, y: y - hitSize / 2, width: table.width, height: hitSize, fill: "transparent", cursor: "row-resize", role: "separator", "aria-orientation": "horizontal", "aria-label": `Resize row ${row}`, tabindex: 0, "data-table-resize": "row", "data-table-boundary": row, onPointerdown: (event: PointerEvent) => startTableResize(event, "row", row - 1), onKeydown: cancelTableResize }))
        }
      }
      if (style.border.visible) children.push(h("rect", { x: outerBounds.x + style.border.stroke.width / 2, y: outerBounds.y + style.border.stroke.width / 2, width: Math.max(0, outerBounds.width - style.border.stroke.width), height: Math.max(0, outerBounds.height - style.border.stroke.width), rx: style.border.radius, fill: "none", stroke: style.border.stroke.color, "stroke-width": style.border.stroke.width, "stroke-dasharray": dash(style.border.stroke.style), "vector-effect": "non-scaling-stroke", "pointer-events": "none" }))
      const tableTransform = svgTransform(table.rotation ?? 0, table.flipX === true, table.flipY === true, outerBounds)
      const visualChildren = children.splice(0, children.length)
      children.push(h("style", tableCellFocusStyles), h("g", { transform: tableTransform }, visualChildren))
      const activeEdit = editing.value
      if (activeEdit) {
        const cellX = columnOffsets[activeEdit.column]!
        const cellY = rowOffsets[activeEdit.row]!
        const width = table.columnWidths![activeEdit.column]!
        const height = table.rowHeights![activeEdit.row]!
        const editorBounds = projectTableCellBounds(table, { x: cellX, y: cellY, width, height })
        children.push(h("foreignObject", editorBounds, [h("input", {
          ref: input, value: activeEdit.text, "aria-label": `Edit row ${activeEdit.row + 1}, column ${activeEdit.column + 1}`,
          onPointerdown: stopToolbarEvent, onClick: stopToolbarEvent,
          onInput: (event: Event) => { if (editing.value) editing.value = { ...editing.value, text: (event.target as HTMLInputElement).value } },
          onBlur: () => commitEdit(activeEdit),
          onKeydown: (event: KeyboardEvent) => {
            event.stopPropagation()
            if (event.key === "Escape") { event.preventDefault(); cancelEdit() }
            else if (event.key === "Enter") { event.preventDefault(); commitEdit(activeEdit, true) }
            else if (event.key === "ArrowUp") { event.preventDefault(); navigateEdit(table, -1, 0, activeEdit) }
            else if (event.key === "ArrowDown") { event.preventDefault(); navigateEdit(table, 1, 0, activeEdit) }
            else if (event.key === "ArrowLeft" && (event.target as HTMLInputElement).selectionStart === 0) { event.preventDefault(); navigateEdit(table, 0, -1, activeEdit) }
            else if (event.key === "ArrowRight" && (event.target as HTMLInputElement).selectionEnd === activeEdit.text.length) { event.preventDefault(); navigateEdit(table, 0, 1, activeEdit) }
          },
          style: { boxSizing: "border-box", width: "100%", height: "100%", border: "2px solid var(--affino-accent, #3b82f6)", borderRadius: "2px", padding: `${padding}px`, background: "var(--affino-surface, #fff)", color: "var(--affino-text, #111827)", font: "inherit", outline: "none" },
        })]))
      }
      if (headerEditing.value !== null && table.header) {
        const editorBounds = projectTableCellBounds(table, { x: table.x, y: table.y - table.header.height, width: table.width, height: table.header.height })
        const activeHeaderEdit = headerEditing.value
        children.push(h("foreignObject", editorBounds, [h("input", {
          value: activeHeaderEdit, "aria-label": "Edit table title", onPointerdown: stopToolbarEvent, onClick: stopToolbarEvent,
          onInput: (event: Event) => { if (headerEditing.value !== null) headerEditing.value = (event.target as HTMLInputElement).value },
          onBlur: () => commitHeaderEdit(activeHeaderEdit),
            onKeydown: (event: KeyboardEvent) => { event.stopPropagation(); if (event.key === "Escape" && !event.isComposing) { event.preventDefault(); cancelHeaderEdit() } else if (event.key === "Enter" && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); commitHeaderEdit(activeHeaderEdit) } },
          style: { boxSizing: "border-box", width: "100%", height: "100%", border: "2px solid var(--affino-accent, #3b82f6)", background: "var(--affino-surface, #fff)", color: "var(--affino-text, #111827)", font: "inherit", outline: "none" },
        })]))
      }
      if (selected.value && props.showToolbar) children.push(toolbar(table, style, selectedCell.value, model, button, select, checkbox, numberInput, stopToolbarEvent))
      return h("g", { ref: tableRoot, "data-diagram-id": table.id, "data-diagram-kind": "table", role: "grid", "aria-label": `Table ${table.id}`, "aria-rowcount": table.rowCount, "aria-colcount": table.columnCount, "data-selected": selected.value || undefined }, children)
    }
  },
})

function toolbar(table: DiagramTable, style: DiagramTableStyle, cell: { row: number; column: number }, model: ReturnType<typeof useDiagramTable>, button: (label: string, action: () => void) => VNodeChild, select: (label: string, value: string, values: ReadonlyArray<string>, update: (value: string) => void) => VNodeChild, checkbox: (label: string, checked: boolean, update: (value: boolean) => void) => VNodeChild, numberInput: (label: string, value: number, update: (value: number) => void, min?: number) => VNodeChild, stopToolbarEvent: (event: Event) => void): VNodeChild {
  const controls: VNodeChild[] = [
    button(table.header ? "Remove table title" : "Add table title", () => model.updateHeader(table.header ? null : { text: "", height: 28, horizontalAlign: "left" })),
    ...(table.header ? [select("Title vertical alignment", table.header.verticalAlign ?? "middle", ["top", "middle", "bottom"], (value) => model.updateHeader({ ...table.header!, verticalAlign: value as DiagramTableVerticalAlignment }))] : []),
    button("Insert row", () => model.insertRow(cell.row + 1)),
    button("Delete row", () => model.deleteRow(cell.row)),
    button("Insert column", () => model.insertColumn(cell.column + 1)),
    button("Delete column", () => model.deleteColumn(cell.column)),
    numberInput("Row height", table.rowHeights?.[cell.row] ?? table.height / table.rowCount, (height) => model.resizeRow(cell.row, height), 1),
    numberInput("Column width", table.columnWidths?.[cell.column] ?? table.width / table.columnCount, (width) => model.resizeColumn(cell.column, width), 1),
    select("Horizontal text alignment", currentCellValue(table, cell).horizontalAlign ?? "left", ["left", "center", "right"], (value) => model.updateCell(cell.row, cell.column, { horizontalAlign: value as DiagramTableHorizontalAlignment })),
    select("Vertical text alignment", currentCellValue(table, cell).verticalAlign ?? "middle", ["top", "middle", "bottom"], (value) => model.updateCell(cell.row, cell.column, { verticalAlign: value as DiagramTableVerticalAlignment })),
    checkbox("Show table grid", style.grid.visible, (visible) => model.updateStyle({ grid: { visible } })),
    h("label", { style: fieldStyle }, [h("span", { style: visuallyHiddenStyle }, "Grid color"), h("input", { type: "color", "aria-label": "Grid color", value: colorInputValue(style.grid.stroke.color), onPointerdown: stopToolbarEvent, onClick: stopToolbarEvent, onChange: (event: Event) => model.updateStyle({ grid: { stroke: { color: (event.target as HTMLInputElement).value } } }), style: inputStyle })]),
    numberInput("Grid thickness", style.grid.stroke.width, (width) => model.updateStyle({ grid: { stroke: { width } } })),
    select("Grid line style", style.grid.stroke.style, ["solid", "dashed", "dotted"], (value) => model.updateStyle({ grid: { stroke: { style: value as DiagramTableStyle["grid"]["stroke"]["style"] } } })),
    checkbox("Show outer border", style.border.visible, (visible) => model.updateStyle({ border: { visible } })),
    h("label", { style: fieldStyle }, [h("span", { style: visuallyHiddenStyle }, "Border color"), h("input", { type: "color", "aria-label": "Border color", value: colorInputValue(style.border.stroke.color), onPointerdown: stopToolbarEvent, onClick: stopToolbarEvent, onChange: (event: Event) => model.updateStyle({ border: { stroke: { color: (event.target as HTMLInputElement).value } } }), style: inputStyle })]),
    numberInput("Border thickness", style.border.stroke.width, (width) => model.updateStyle({ border: { stroke: { width } } })),
    select("Border line style", style.border.stroke.style, ["solid", "dashed", "dotted"], (value) => model.updateStyle({ border: { stroke: { style: value as DiagramTableStyle["border"]["stroke"]["style"] } } })),
    numberInput("Border corner radius", style.border.radius, (radius) => model.updateStyle({ border: { radius } })),
  ]
  return h("foreignObject", { x: table.x, y: table.y - (table.header?.height ?? 0) - 42, width: 660, height: 40 }, [h("div", { role: "toolbar", "aria-label": "Table formatting", onPointerdown: (event: Event) => event.stopPropagation(), onClick: (event: Event) => event.stopPropagation(), style: toolbarStyle }, controls)])
}

function onHeaderKey(event: KeyboardEvent, beginEdit: (table: DiagramTable, initialText?: string) => void, table: DiagramTable): void {
  if (["Enter", "F2", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
    event.preventDefault()
    event.stopPropagation()
    if ((event.key === "Enter" || event.key === "F2") && table) beginEdit(table)
    return
  }
  if (isPrintableCellInput(event) && table) {
    event.preventDefault()
    event.stopPropagation()
    beginEdit(table, event.key)
  }
}

function onCellKey(event: KeyboardEvent, table: DiagramTable, row: number, column: number, beginEdit: (table: DiagramTable, row: number, column: number, initialText?: string) => void, setActiveCell: (cell: DiagramTableCellPosition, table?: DiagramTable) => void): void {
  const delta = event.key === "ArrowUp" ? [-1, 0] : event.key === "ArrowDown" ? [1, 0] : event.key === "ArrowLeft" ? [0, -1] : event.key === "ArrowRight" ? [0, 1] : null
  if (delta) {
    event.preventDefault()
    event.stopPropagation()
    const nextRow = Math.max(0, Math.min(table.rowCount - 1, row + delta[0]!))
    const nextColumn = Math.max(0, Math.min(table.columnCount - 1, column + delta[1]!))
    setActiveCell({ row: nextRow, column: nextColumn }, table)
    const grid = (event.currentTarget as Element | null)?.closest("[role=grid]")
    void nextTick(() => grid?.querySelector<SVGRectElement>(`[data-table-row="${nextRow}"][data-table-column="${nextColumn}"]`)?.focus())
    return
  }
  if (event.key === "Enter" || event.key === "F2") { event.preventDefault(); beginEdit(table, row, column); return }
  if (isPrintableCellInput(event)) {
    event.preventDefault()
    event.stopPropagation()
    beginEdit(table, row, column, event.key)
  }
}
function isPrintableCellInput(event: KeyboardEvent): boolean {
  return !event.isComposing
    && event.keyCode !== 229
    && !event.ctrlKey
    && !event.metaKey
    && !event.altKey
    && Array.from(event.key).length === 1
}
function currentCellValue(table: DiagramTable, cell: { row: number; column: number }): DiagramTableCell { return table.cells?.[cell.row]?.[cell.column] ?? table.defaultCell ?? { text: "" } }
function projectTableCellBounds(table: DiagramTable, cell: { x: number; y: number; width: number; height: number }): { x: number; y: number; width: number; height: number } {
  const outer = { x: table.x, y: table.y - (table.header?.height ?? 0), width: table.width, height: table.height + (table.header?.height ?? 0) }
  const center = { x: outer.x + outer.width / 2, y: outer.y + outer.height / 2 }
  const project = (point: { x: number; y: number }) => {
    const local = { x: center.x + (point.x - center.x) * (table.flipX ? -1 : 1), y: center.y + (point.y - center.y) * (table.flipY ? -1 : 1) }
    return rotatePoint(local, center, table.rotation ?? 0)
  }
  return rectFromPoints([
    project({ x: cell.x, y: cell.y }),
    project({ x: cell.x + cell.width, y: cell.y }),
    project({ x: cell.x + cell.width, y: cell.y + cell.height }),
    project({ x: cell.x, y: cell.y + cell.height }),
  ])
}
function offsets(sizes: ReadonlyArray<number>, start: number): number[] { const result = [start]; for (const size of sizes) result.push(result[result.length - 1]! + size); return result }
function dash(style: DiagramTableStyle["grid"]["stroke"]["style"]): string | undefined { return style === "dashed" ? "6 4" : style === "dotted" ? "1 3" : undefined }
function colorInputValue(color: string): string { return /^#[0-9a-f]{6}$/i.test(color) ? color : "#64748b" }
const defaultStyle: DiagramTableStyle = { grid: { visible: true, stroke: { color: "#d1d5db", width: 1, style: "solid" } }, border: { visible: true, stroke: { color: "#9ca3af", width: 1, style: "solid" }, radius: 8 }, cellPadding: 8 }
const tableCellFocusStyles = `.affino-diagram-table-cell:focus{outline:none}.affino-diagram-table-cell:focus-visible{stroke:var(--affino-focus-ring-color,var(--affino-accent,#3b82f6));stroke-width:2;vector-effect:non-scaling-stroke}`
const buttonStyle = { border: "1px solid var(--affino-border, #d1d5db)", borderRadius: "5px", background: "var(--affino-surface, #fff)", color: "var(--affino-text, #111827)", fontSize: "12px", padding: "3px 6px", whiteSpace: "nowrap" }
const inputStyle = { boxSizing: "border-box", maxWidth: "72px", border: "1px solid var(--affino-border, #d1d5db)", borderRadius: "4px", background: "var(--affino-surface, #fff)", color: "var(--affino-text, #111827)", fontSize: "12px", padding: "3px" }
const fieldStyle = { display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "11px", whiteSpace: "nowrap" }
const toolbarStyle = { display: "flex", flexWrap: "nowrap", alignItems: "center", gap: "4px", overflowX: "auto", width: "100%", height: "100%", boxSizing: "border-box", padding: "3px", border: "1px solid var(--affino-border, #d1d5db)", borderRadius: "6px", background: "var(--affino-surface, #fff)", color: "var(--affino-text, #111827)", fontFamily: "inherit" }
const visuallyHiddenStyle = { position: "absolute", width: "1px", height: "1px", padding: 0, margin: "-1px", overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0 }
