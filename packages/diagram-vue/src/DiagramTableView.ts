import { computed, defineComponent, h, nextTick, onBeforeUnmount, ref, watch } from "vue"
import type { PropType, VNodeChild } from "vue"
import type { DiagramTable, DiagramTableCell, DiagramTableCellPosition, DiagramTableHorizontalAlignment, DiagramTableStyle, DiagramTableVerticalAlignment, DiagramTextMeasurementProvider } from "@affino/diagram-core"
import { resolveDiagramTableLayout, resolveTransformOrigin } from "@affino/diagram-core"
import type { DiagramEngineController } from "./useDiagramEngine.js"
import type { DiagramPointerController } from "./useDiagramPointerController.js"
import type { DiagramInteractionPreviewMode } from "./types.js"
import { svgTransform } from "./useDiagramRenderer.js"
import { useDiagramTable } from "./useDiagramTable.js"
import { createCanvasTextMeasurementProvider } from "./textMeasurement.js"

/** SVG-native table renderer with one accessible foreignObject editor and toolbar while selected. */
export const DiagramTableView = defineComponent({
  name: "DiagramTableView",
  props: {
    controller: { type: Object as PropType<DiagramEngineController>, required: true },
    /** Optional pointer controller used to project transient movement and resize previews. */
    pointer: { type: Object as PropType<DiagramPointerController>, required: false },
    /** Hides only the built-in formatting toolbar; defaults to visible. */
    showToolbar: { type: Boolean, default: true },
    /** Track boundary drag mode; flexible is the backwards-compatible default. */
    resizePolicy: { type: String as PropType<"fixed" | "flexible">, default: "flexible" },
    /** Controls the presentation of any Core-resolved edit candidate; table track previews use the same mode. */
    interactionPreviewMode: { type: String as PropType<DiagramInteractionPreviewMode>, default: "live" },
    /** Zero-based interface state. Defaults to the first cell and is never serialized. */
    activeCell: { type: Object as PropType<DiagramTableCellPosition | null>, default: undefined },
    /** Optional controlled rectangular selection; changes are emitted transiently and are never serialized. */
    rangeSelection: { type: Object as PropType<Readonly<{ anchor: DiagramTableCellPosition; active: DiagramTableCellPosition }> | null>, default: undefined },
    /** Optional text metrics. Browser Canvas metrics are used when available. */
    textMeasurementProvider: { type: Object as PropType<DiagramTextMeasurementProvider>, default: undefined },
    id: { type: String, required: true },
  },
  emits: { "update:activeCell": (_cell: DiagramTableCellPosition) => true, "update:rangeSelection": (_range: Readonly<{ anchor: DiagramTableCellPosition; active: DiagramTableCellPosition }>) => true },
  setup(props, { emit }) {
    const model = useDiagramTable(props.controller, props.id)
    const ownedTextProvider = props.textMeasurementProvider ? null : createCanvasTextMeasurementProvider()
    const textProvider = props.textMeasurementProvider ?? ownedTextProvider ?? undefined
    const textProviderRevision = ref(0)
    const unsubscribeTextProvider = textProvider?.subscribe?.(() => { textProviderRevision.value += 1 })
    onBeforeUnmount(() => {
      unsubscribeTextProvider?.()
      ownedTextProvider?.dispose()
    })
    const layoutFor = (table: DiagramTable) => {
      textProviderRevision.value
      return props.controller.scene.value.entities.tablesById.get(table.id) === table
        ? props.controller.engine.getTableLayout(table.id, textProvider) ?? resolveDiagramTableLayout(table, { textMeasurementProvider: textProvider })
        : resolveDiagramTableLayout(table, { textMeasurementProvider: textProvider })
    }
    const selected = computed(() => props.controller.scene.value.selection.ids.includes(props.id))
    const parentTransform = computed(() => {
      // Group-only changes keep the table model object stable; depend on the scene revision to refresh Core geometry.
      props.controller.scene.value
      return props.controller.engine.getGeometrySnapshot(props.id)?.parentTransform
    })
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
    const rangeSelection = ref<{ anchor: DiagramTableCellPosition; active: DiagramTableCellPosition }>(props.rangeSelection ?? { anchor: selectedCell.value, active: selectedCell.value })
    const rangeMessage = ref("")
    const rangeDragging = ref(false)
    const editing = ref<{ row: number; column: number; text: string } | null>(null)
    const headerEditing = ref<string | null>(null)
    const input = ref<HTMLTextAreaElement | null>(null)
    const tableRoot = ref<SVGGElement | null>(null)
    const clampCell = (cell: DiagramTableCellPosition, table: DiagramTable | null): DiagramTableCellPosition => table
      ? { row: Math.max(0, Math.min(table.rowCount - 1, Math.trunc(cell.row))), column: Math.max(0, Math.min(table.columnCount - 1, Math.trunc(cell.column))) }
      : { row: 0, column: 0 }
    const setActiveCell = (cell: DiagramTableCellPosition, table = model.table.value) => {
      const clamped = clampCell(cell, table)
      const next = table ? layoutFor(table).cellAnchors[clamped.row]![clamped.column]! : clamped
      selectedCell.value = next
      rangeSelection.value = { anchor: next, active: next }
      emit("update:activeCell", next)
      emit("update:rangeSelection", rangeSelection.value)
    }
    const setRange = (anchor: DiagramTableCellPosition, active: DiagramTableCellPosition, table = model.table.value, notify = true) => {
      if (!table) return
      const layout = layoutFor(table)
      const safeAnchor = clampCell(anchor, table)
      const safeActive = clampCell(active, table)
      const normalizedAnchor = layout.cellAnchors[safeAnchor.row]![safeAnchor.column]!
      const normalizedActive = layout.cellAnchors[safeActive.row]![safeActive.column]!
      rangeSelection.value = { anchor: normalizedAnchor, active: normalizedActive }
      selectedCell.value = normalizedActive
      if (notify) {
        emit("update:activeCell", selectedCell.value)
        emit("update:rangeSelection", rangeSelection.value)
      }
      rangeMessage.value = ""
    }
    const handleRangeMove = (event: PointerEvent) => {
      if (!rangeDragging.value) return
      const target = typeof document !== "undefined" ? document.elementFromPoint(event.clientX, event.clientY)?.closest<SVGRectElement>("[data-table-row][data-table-column]") : null
      const row = Number(target?.dataset.tableRow), column = Number(target?.dataset.tableColumn)
      if (Number.isInteger(row) && Number.isInteger(column)) setRange(rangeSelection.value.anchor, { row, column }, projectedTable.value)
    }
    watch(() => props.activeCell, (cell) => {
      const next = clampCell(cell ?? { row: 0, column: 0 }, model.table.value)
      if (next.row !== selectedCell.value.row || next.column !== selectedCell.value.column) setActiveCell(next)
    })
    watch(() => props.rangeSelection, (range) => {
      if (range && model.table.value) setRange(range.anchor, range.active, model.table.value, false)
    })
    watch(() => model.table.value && [model.table.value.rowCount, model.table.value.columnCount], () => {
      const table = model.table.value
      if (!table) return
      const anchor = clampCell(rangeSelection.value.anchor, table)
      const active = clampCell(rangeSelection.value.active, table)
      const next = clampCell(selectedCell.value, table)
      if (next.row !== selectedCell.value.row || next.column !== selectedCell.value.column) setActiveCell(next, table)
      else setRange(anchor, active, table)
    })
    watch(() => model.table.value?.merges, () => {
      const table = model.table.value
      if (!table) return
      const active = layoutFor(table).cellAnchors[selectedCell.value.row]?.[selectedCell.value.column]
      if (active && (active.row !== selectedCell.value.row || active.column !== selectedCell.value.column)) {
        selectedCell.value = active
        rangeSelection.value = { anchor: active, active }
        emit("update:activeCell", active)
        emit("update:rangeSelection", rangeSelection.value)
      }
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
      const target = layoutFor(table).cellAnchors[row]![column]!
      setActiveCell(target, table)
      editing.value = { ...target, text: initialText ?? currentCell(table, target.row, target.column).text }
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
      h("span", { style: visuallyHiddenStyle }, label), h("input", { type: "number", "aria-label": label, value, min, step: 0.1, onPointerdown: stopToolbarEvent, onChange: (event: Event) => { event.stopPropagation(); update(Number((event.target as HTMLInputElement).value)) }, style: inputStyle }),
    ])

    return () => {
      const candidateTable = projectedTable.value
      const committedTable = model.table.value
      const preserveCommitted = props.interactionPreviewMode !== "live"
        && props.pointer?.state.value.active === true
        && candidateTable !== committedTable
      const table = preserveCommitted ? committedTable : candidateTable
      if (!table) return null
      const style = table.style ?? defaultStyle
      const layout = layoutFor(table)
      const selectedRange = layout.expandRange(rangeSelection.value.anchor, rangeSelection.value.active)
      const range = { top: selectedRange.start.row, left: selectedRange.start.column, bottom: selectedRange.end.row, right: selectedRange.end.column }
      const padding = style.cellPadding ?? 8
      const headerHeight = table.header?.height ?? 0
      const outerBounds = { x: table.x, y: table.y - headerHeight, width: table.width, height: table.height + headerHeight }
      const children: VNodeChild[] = [
        h("rect", { x: outerBounds.x, y: outerBounds.y, width: outerBounds.width, height: outerBounds.height, rx: style.border.radius, fill: style.background ?? "var(--affino-diagram-table-surface, var(--affino-surface, #ffffff))", stroke: "none" }),
      ]
      for (const region of layout.visibleCells) if (region.style.background) children.push(h("rect", { x: region.bounds.x, y: region.bounds.y, width: region.bounds.width, height: region.bounds.height, fill: region.style.background, "pointer-events": "none", "data-table-cell-background": region.anchorCellId }))
      if (style.border.visible) children.push(h("rect", { x: outerBounds.x + style.border.stroke.width / 2, y: outerBounds.y + style.border.stroke.width / 2, width: Math.max(0, outerBounds.width - style.border.stroke.width), height: Math.max(0, outerBounds.height - style.border.stroke.width), rx: style.border.radius, fill: "none", stroke: style.border.stroke.color, "stroke-width": style.border.stroke.width, "stroke-dasharray": dash(style.border.stroke.style), "vector-effect": "non-scaling-stroke", "pointer-events": "none" }))
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
      for (const region of layout.visibleCells) {
          const { row, column } = region
          const cell = currentCell(table, row, column)
          const { x, y, width, height } = region.bounds
          const contentBounds = region.contentBounds
          const active = selectedCell.value.row === row && selectedCell.value.column === column
          const selectedInRange = row <= range.bottom && row + region.rowSpan - 1 >= range.top && column <= range.right && column + region.columnSpan - 1 >= range.left
          const isEditing = editing.value?.row === row && editing.value?.column === column
          const anchor = region.textAnchor
          const textX = region.linePositions[0]?.x ?? contentBounds.x
          const font = region.style.text
          const fontSize = font.fontSize ?? 14
          const textY = region.linePositions[0]?.y ?? contentBounds.y
          const clipId = `diagram-table-clip-${encodeURIComponent(table.id)}-${encodeURIComponent(region.anchorCellId)}`
          if (region.style.overflow !== "visible") children.push(h("defs", [h("clipPath", { id: clipId, clipPathUnits: "userSpaceOnUse" }, [h("rect", { x: contentBounds.x, y: contentBounds.y, width: contentBounds.width, height: contentBounds.height })])]))
          children.push(h("rect", { class: "affino-diagram-table-cell", x, y, width, height, fill: selectedInRange && selected.value ? "var(--affino-diagram-table-active-cell, color-mix(in srgb, var(--affino-accent, #3b82f6) 14%, transparent))" : "transparent", stroke: active && selected.value ? "var(--affino-focus-ring-color, var(--affino-accent, #3b82f6))" : "transparent", "stroke-width": active && selected.value ? 2 : 0, role: "gridcell", tabindex: active ? 0 : -1, "aria-selected": selectedInRange ? "true" : "false", "aria-rowspan": region.rowSpan > 1 ? region.rowSpan : undefined, "aria-colspan": region.columnSpan > 1 ? region.columnSpan : undefined, "data-table-row": row, "data-table-column": column, "aria-label": `Row ${row + 1}, column ${column + 1}: ${cell.text}`, onFocus: () => { if (!rangeDragging.value) setActiveCell({ row, column }, table) }, onPointerdown: (event: PointerEvent) => { event.stopPropagation(); if (editing.value) return; if (event.shiftKey) setRange(rangeSelection.value.anchor, { row, column }, table); else setRange({ row, column }, { row, column }, table); rangeDragging.value = true; try { (event.currentTarget as SVGRectElement).setPointerCapture(event.pointerId) } catch { /* pointer capture is unavailable in some renderers */ } }, onPointermove: handleRangeMove, onPointerup: (event: PointerEvent) => { rangeDragging.value = false; try { (event.currentTarget as SVGRectElement).releasePointerCapture(event.pointerId) } catch { /* pointer capture is unavailable in some renderers */ } }, onPointercancel: () => { rangeDragging.value = false }, onClick: (event: MouseEvent) => { event.stopPropagation(); if (event.detail === 0) { if (event.shiftKey) setRange(rangeSelection.value.anchor, { row, column }, table); else setRange({ row, column }, { row, column }, table) } }, onDblclick: (event: Event) => { event.stopPropagation(); beginEdit(table, row, column) }, onKeydown: (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (editing.value) cancelEdit(); else { rangeSelection.value = { anchor: selectedCell.value, active: selectedCell.value }; emit("update:rangeSelection", rangeSelection.value) }; return } onCellKey(event, table, row, column, beginEdit, setActiveCell) } }))
          if (!isEditing) children.push(h("text", { x: textX, y: textY, "text-anchor": anchor, fill: font.color ?? "var(--affino-diagram-table-text, currentColor)", "font-family": font.fontFamily, "font-size": fontSize, "font-weight": font.fontWeight, "font-style": font.fontStyle, "pointer-events": "none", "clip-path": region.style.overflow === "visible" ? undefined : `url(#${clipId})`, "data-table-cell-text": region.anchorCellId }, region.lines.map((line, index) => h("tspan", { x: region.linePositions[index]?.x ?? textX, y: region.linePositions[index]?.y ?? textY }, line))))
      }
      for (const boundary of layout.gridBoundaries) if (boundary.border.visible) children.push(h("line", { x1: boundary.start.x, y1: boundary.start.y, x2: boundary.end.x, y2: boundary.end.y, stroke: boundary.border.color, "stroke-width": boundary.border.width, "stroke-dasharray": dash(boundary.border.style), "vector-effect": "non-scaling-stroke", "pointer-events": "none", "data-border-owner": boundary.border.ownerCellId }))
      if (preserveCommitted && candidateTable) {
        const candidateLayout = layoutFor(candidateTable)
        const candidateHeaderHeight = candidateTable.header?.height ?? 0
        const candidateBounds = { x: candidateTable.x, y: candidateTable.y - candidateHeaderHeight, width: candidateTable.width, height: candidateTable.height + candidateHeaderHeight }
        const candidatePivot = tableGeometryPivot(props.controller, candidateTable, candidateBounds)
        const candidateTransform = svgTransform(candidateTable.rotation ?? 0, candidateTable.flipX === true, candidateTable.flipY === true, candidateBounds, candidatePivot)
        const overlay: VNodeChild[] = [h("rect", { x: candidateBounds.x, y: candidateBounds.y, width: candidateBounds.width, height: candidateBounds.height, fill: props.interactionPreviewMode === "ghost" ? "rgba(8, 123, 99, 0.08)" : "none", stroke: "#087b63", "stroke-width": 2, "stroke-dasharray": "7 4", "vector-effect": "non-scaling-stroke", "data-interaction-preview-geometry": "outer-bounds" })]
        if (candidateTable.header) overlay.push(h("line", { x1: candidateTable.x, y1: candidateTable.y, x2: candidateTable.x + candidateTable.width, y2: candidateTable.y, stroke: "#087b63", "stroke-width": 1.5, "stroke-dasharray": "6 4", "vector-effect": "non-scaling-stroke" }))
        for (const boundary of candidateLayout.gridBoundaries) overlay.push(h("line", { x1: boundary.start.x, y1: boundary.start.y, x2: boundary.end.x, y2: boundary.end.y, stroke: "#087b63", "stroke-width": 1.5, "stroke-dasharray": "6 4", "vector-effect": "non-scaling-stroke" }))
        if (props.interactionPreviewMode === "ghost") for (const region of candidateLayout.visibleCells) {
          const font = region.style.text
          overlay.push(h("text", { x: region.textAnchor === "middle" ? region.bounds.x + region.bounds.width / 2 : region.textAnchor === "end" ? region.contentBounds.x + region.contentBounds.width : region.contentBounds.x, y: region.linePositions[0]?.y ?? region.contentBounds.y, "text-anchor": region.textAnchor, fill: font.color ?? "#087b63", "font-size": font.fontSize ?? 12, "font-family": font.fontFamily, "font-weight": font.fontWeight, opacity: 0.65 }, region.lines.map((line, index) => h("tspan", { x: region.linePositions[index]?.x, y: region.linePositions[index]?.y }, line))))
        }
        children.push(h("g", { transform: candidateTransform, class: `diagram-table-interaction-preview diagram-table-interaction-preview--${props.interactionPreviewMode}`, "data-interaction-preview": props.interactionPreviewMode, "data-drag-preview": props.interactionPreviewMode, "aria-hidden": "true", "pointer-events": "none" }, overlay))
      }
      if (selected.value && props.pointer) {
        const zoom = props.controller.scene.value.viewport.zoom || 1
        const hitSize = 12 / zoom
        const startTableResize = (event: PointerEvent, axis: "row" | "column", index: number) => {
          event.preventDefault()
          event.stopPropagation()
          props.pointer?.beginTableResizeHandle(props.id, axis, index, event, props.resizePolicy)
        }
        const cancelTableResize = (event: KeyboardEvent) => {
          if (event.key !== "Escape") return
          event.preventDefault()
          event.stopPropagation()
          props.pointer?.cancel()
        }
        for (let column = 1; column < table.columnCount; column += 1) {
          const x = layout.columnBounds[column]!.x
          const segments = layout.gridBoundaries.filter((boundary) => boundary.axis === "vertical" && boundary.start.x === x)
          for (const segment of segments) children.push(h("rect", { x: x - hitSize / 2, y: segment.start.y, width: hitSize, height: segment.end.y - segment.start.y, fill: "transparent", cursor: "col-resize", role: "separator", "aria-orientation": "vertical", "aria-label": `Resize column ${column}`, tabindex: 0, "data-table-resize": "column", "data-table-boundary": column, onPointerdown: (event: PointerEvent) => startTableResize(event, "column", column - 1), onKeydown: cancelTableResize }))
        }
        for (let row = 1; row < table.rowCount; row += 1) {
          const y = layout.rowBounds[row]!.y
          const segments = layout.gridBoundaries.filter((boundary) => boundary.axis === "horizontal" && boundary.start.y === y)
          for (const segment of segments) children.push(h("rect", { x: segment.start.x, y: y - hitSize / 2, width: segment.end.x - segment.start.x, height: hitSize, fill: "transparent", cursor: "row-resize", role: "separator", "aria-orientation": "horizontal", "aria-label": `Resize row ${row}`, tabindex: 0, "data-table-resize": "row", "data-table-boundary": row, onPointerdown: (event: PointerEvent) => startTableResize(event, "row", row - 1), onKeydown: cancelTableResize }))
        }
      }
      const pivot = tableGeometryPivot(props.controller, table, outerBounds)
      const tableTransform = svgTransform(table.rotation ?? 0, table.flipX === true, table.flipY === true, outerBounds, pivot)
      const visualChildren = children.splice(0, children.length)
      children.push(h("style", tableCellFocusStyles), h("g", { transform: tableTransform }, visualChildren))
      const activeEdit = editing.value
      if (activeEdit) {
        const cellBounds = layout.cellContentBounds[activeEdit.row]![activeEdit.column]!
        const { x: cellX, y: cellY, width, height } = cellBounds
        const activeRegion = layout.visibleCells.find((region) => region.row === activeEdit.row && region.column === activeEdit.column)
        const activeStyle = activeRegion?.style
        const activeFont = activeStyle?.text ?? {}
        children.push(h("g", { transform: tableTransform }, [h("foreignObject", { x: cellX, y: cellY, width, height }, [h("textarea", {
          ref: input, value: activeEdit.text, "aria-label": `Edit row ${activeEdit.row + 1}, column ${activeEdit.column + 1}`,
          onPointerdown: stopToolbarEvent, onClick: stopToolbarEvent,
          onInput: (event: Event) => { if (editing.value) editing.value = { ...editing.value, text: (event.target as HTMLTextAreaElement).value } },
          onBlur: () => commitEdit(activeEdit),
          onKeydown: (event: KeyboardEvent) => {
            event.stopPropagation()
            if (event.key === "Escape") { event.preventDefault(); cancelEdit() }
            else if (event.key === "Enter" && event.shiftKey) { /* Shift+Enter inserts a newline. */ }
            else if (event.key === "Enter") { event.preventDefault(); commitEdit(activeEdit, true) }
            else if (event.key === "Tab") { event.preventDefault(); navigateEdit(table, 0, event.shiftKey ? -1 : 1, activeEdit) }
            else if (event.key === "ArrowUp") { event.preventDefault(); navigateEdit(table, -1, 0, activeEdit) }
            else if (event.key === "ArrowDown") { event.preventDefault(); navigateEdit(table, 1, 0, activeEdit) }
            else if (event.key === "ArrowLeft" && (event.target as HTMLTextAreaElement).selectionStart === 0) { event.preventDefault(); navigateEdit(table, 0, -1, activeEdit) }
            else if (event.key === "ArrowRight" && (event.target as HTMLTextAreaElement).selectionEnd === activeEdit.text.length) { event.preventDefault(); navigateEdit(table, 0, 1, activeEdit) }
          },
          style: { boxSizing: "border-box", width: "100%", height: "100%", border: "2px solid var(--affino-accent, #3b82f6)", borderRadius: "2px", padding: "0", resize: "none", background: "var(--affino-surface, #fff)", color: activeFont.color ?? "var(--affino-text, #111827)", fontFamily: activeFont.fontFamily, fontSize: activeFont.fontSize ? `${activeFont.fontSize}px` : "14px", fontWeight: activeFont.fontWeight, fontStyle: activeFont.fontStyle, textAlign: activeRegion?.horizontalAlign ?? "left", outline: "none", whiteSpace: activeStyle?.overflow === "wrap" ? "pre-wrap" : "pre", overflow: activeStyle?.overflow === "visible" ? "visible" : "hidden" },
        })])]))
      }
      if (headerEditing.value !== null && table.header) {
        const activeHeaderEdit = headerEditing.value
        children.push(h("g", { transform: tableTransform }, [h("foreignObject", { x: table.x, y: table.y - table.header.height, width: table.width, height: table.header.height }, [h("input", {
          value: activeHeaderEdit, "aria-label": "Edit table title", onPointerdown: stopToolbarEvent, onClick: stopToolbarEvent,
          onInput: (event: Event) => { if (headerEditing.value !== null) headerEditing.value = (event.target as HTMLInputElement).value },
          onBlur: () => commitHeaderEdit(activeHeaderEdit),
            onKeydown: (event: KeyboardEvent) => { event.stopPropagation(); if (event.key === "Escape" && !event.isComposing) { event.preventDefault(); cancelHeaderEdit() } else if (event.key === "Enter" && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); commitHeaderEdit(activeHeaderEdit) } },
          style: { boxSizing: "border-box", width: "100%", height: "100%", border: "2px solid var(--affino-accent, #3b82f6)", background: "var(--affino-surface, #fff)", color: "var(--affino-text, #111827)", font: "inherit", outline: "none" },
        })])]))
      }
      if (selected.value && props.showToolbar) children.push(toolbar(table, layout, style, selectedCell.value, range, model, button, select, checkbox, numberInput, stopToolbarEvent, () => { const changed = model.mergeCells({ row: range.top, column: range.left }, { row: range.bottom, column: range.right }); rangeMessage.value = changed ? "" : "Merge rejected: check the rectangular range and clear content outside its anchor." }, () => { model.unmergeCell(selectedCell.value.row, selectedCell.value.column) }, () => setRange({ row: selectedCell.value.row, column: 0 }, { row: selectedCell.value.row, column: table.columnCount - 1 }, table), () => setRange({ row: 0, column: selectedCell.value.column }, { row: table.rowCount - 1, column: selectedCell.value.column }, table)))
      if (rangeMessage.value) children.push(h("text", { x: table.x, y: table.y - 48, role: "status", fill: "#b91c1c", "font-size": 12 }, rangeMessage.value))
      const resolvedParentTransform = parentTransform.value
      return h("g", { ref: tableRoot, transform: resolvedParentTransform ? `matrix(${resolvedParentTransform.a} ${resolvedParentTransform.b} ${resolvedParentTransform.c} ${resolvedParentTransform.d} ${resolvedParentTransform.e} ${resolvedParentTransform.f})` : undefined, "data-diagram-id": table.id, "data-diagram-kind": "table", role: "grid", "aria-label": `Table ${table.id}`, "aria-rowcount": table.rowCount, "aria-colcount": table.columnCount, "data-selected": selected.value || undefined }, children)
    }
  },
})

function toolbar(table: DiagramTable, layout: ReturnType<typeof resolveDiagramTableLayout>, style: DiagramTableStyle, cell: { row: number; column: number }, range: { top: number; left: number; bottom: number; right: number }, model: ReturnType<typeof useDiagramTable>, button: (label: string, action: () => void) => VNodeChild, select: (label: string, value: string, values: ReadonlyArray<string>, update: (value: string) => void) => VNodeChild, checkbox: (label: string, checked: boolean, update: (value: boolean) => void) => VNodeChild, numberInput: (label: string, value: number, update: (value: number) => void, min?: number) => VNodeChild, stopToolbarEvent: (event: Event) => void, merge: () => void, unmerge: () => void, selectRow: () => void, selectColumn: () => void): VNodeChild {
  const selectedRegions = layout.visibleCells.filter((region) => region.row <= range.bottom && region.row + region.rowSpan - 1 >= range.top && region.column <= range.right && region.column + region.columnSpan - 1 >= range.left)
  const activeCell = currentCellValue(table, cell)
  const activeStyle = activeCell.style
  const updateRangeStyle = (update: NonNullable<DiagramTableCell["style"]>) => model.updateRange({ row: range.top, column: range.left }, { row: range.bottom, column: range.right }, { style: update })
  const controls: VNodeChild[] = [
    button("Select row", selectRow),
    button("Select column", selectColumn),
    ...(selectedRegions.length > 1 ? [button("Merge cells", merge)] : []),
    ...(table.merges?.some((region) => region.anchorCellId === activeCell.id) ? [button("Unmerge cells", unmerge)] : []),
    button(table.header ? "Remove table title" : "Add table title", () => model.updateHeader(table.header ? null : { text: "", height: 28, horizontalAlign: "left" })),
    ...(table.header ? [select("Title vertical alignment", table.header.verticalAlign ?? "middle", ["top", "middle", "bottom"], (value) => model.updateHeader({ ...table.header!, verticalAlign: value as DiagramTableVerticalAlignment }))] : []),
    button("Insert row", () => model.insertRow(cell.row + 1)),
    button("Delete row", () => model.deleteRow(cell.row)),
    button("Insert column", () => model.insertColumn(cell.column + 1)),
    button("Delete column", () => model.deleteColumn(cell.column)),
    numberInput("Row height", table.rowHeights?.[cell.row] ?? table.height / table.rowCount, (height) => model.resizeRow(cell.row, height), 1),
    numberInput("Column width", table.columnWidths?.[cell.column] ?? table.width / table.columnCount, (width) => model.resizeColumn(cell.column, width), 1),
    select("Horizontal text alignment", activeCell.horizontalAlign ?? "left", ["left", "center", "right"], (value) => model.updateRange({ row: range.top, column: range.left }, { row: range.bottom, column: range.right }, { horizontalAlign: value as DiagramTableHorizontalAlignment })),
    select("Vertical text alignment", activeCell.verticalAlign ?? "middle", ["top", "middle", "bottom"], (value) => model.updateRange({ row: range.top, column: range.left }, { row: range.bottom, column: range.right }, { verticalAlign: value as DiagramTableVerticalAlignment })),
    h("label", { style: fieldStyle }, [h("span", { style: visuallyHiddenStyle }, "Cell background"), h("input", { type: "color", "aria-label": "Cell background", value: colorInputValue(activeStyle?.background ?? style.background ?? "#ffffff"), onPointerdown: stopToolbarEvent, onChange: (event: Event) => updateRangeStyle({ background: (event.target as HTMLInputElement).value }), style: inputStyle })]),
    button("Clear cell background", () => updateRangeStyle({ background: null })),
    numberInput("Cell font size", activeStyle?.text?.fontSize ?? style.text?.fontSize ?? 14, (fontSize) => updateRangeStyle({ text: { fontSize } }), 1),
    h("label", { style: fieldStyle }, [h("span", { style: visuallyHiddenStyle }, "Cell text color"), h("input", { type: "color", "aria-label": "Cell text color", value: colorInputValue(activeStyle?.text?.color ?? style.text?.color ?? "#111827"), onPointerdown: stopToolbarEvent, onChange: (event: Event) => updateRangeStyle({ text: { color: (event.target as HTMLInputElement).value } }), style: inputStyle })]),
    ...(["top", "right", "bottom", "left"] as const).map((side) => numberInput(`Cell ${side} padding`, activeStyle?.padding?.[side] ?? style.cellPadding ?? 8, (value) => updateRangeStyle({ padding: { [side]: value } }), 0)),
    select("Cell text overflow", activeStyle?.overflow ?? style.overflow ?? "clip", ["clip", "wrap", "visible"], (value) => updateRangeStyle({ overflow: value as "clip" | "wrap" | "visible" })),
    select("Cell border preset", "all", ["all", "outside", "inside", "top", "right", "bottom", "left", "none", "reset"], (value) => model.setBorders({ row: range.top, column: range.left }, { row: range.bottom, column: range.right }, value as import("@affino/diagram-core").DiagramTableBorderPreset)),
    button("Reset cell style", () => model.updateRange({ row: range.top, column: range.left }, { row: range.bottom, column: range.right }, { style: undefined })),
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
function tableGeometryPivot(controller: DiagramEngineController, table: DiagramTable, bounds: Readonly<{ x: number; y: number; width: number; height: number }>) {
  const geometry = controller.engine.getGeometrySnapshot(table.id)
  return geometry?.localTransformOrigin ?? geometry?.transformOrigin ?? resolveTransformOrigin(bounds, table.transformOrigin)
}
function dash(style: DiagramTableStyle["grid"]["stroke"]["style"]): string | undefined { return style === "dashed" ? "6 4" : style === "dotted" ? "1 3" : undefined }
function colorInputValue(color: string): string { return /^#[0-9a-f]{6}$/i.test(color) ? color : "#64748b" }
const defaultStyle: DiagramTableStyle = { grid: { visible: true, stroke: { color: "#d1d5db", width: 1, style: "solid" } }, border: { visible: true, stroke: { color: "#9ca3af", width: 1, style: "solid" }, radius: 8 }, cellPadding: 8 }
const tableCellFocusStyles = `.affino-diagram-table-cell:focus{outline:none}.affino-diagram-table-cell:focus-visible{stroke:var(--affino-focus-ring-color,var(--affino-accent,#3b82f6));stroke-width:2;vector-effect:non-scaling-stroke}`
const buttonStyle = { border: "1px solid var(--affino-border, #d1d5db)", borderRadius: "5px", background: "var(--affino-surface, #fff)", color: "var(--affino-text, #111827)", fontSize: "12px", padding: "3px 6px", whiteSpace: "nowrap" }
const inputStyle = { boxSizing: "border-box", maxWidth: "72px", border: "1px solid var(--affino-border, #d1d5db)", borderRadius: "4px", background: "var(--affino-surface, #fff)", color: "var(--affino-text, #111827)", fontSize: "12px", padding: "3px" }
const fieldStyle = { display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "11px", whiteSpace: "nowrap" }
const toolbarStyle = { display: "flex", flexWrap: "nowrap", alignItems: "center", gap: "4px", overflowX: "auto", width: "100%", height: "100%", boxSizing: "border-box", padding: "3px", border: "1px solid var(--affino-border, #d1d5db)", borderRadius: "6px", background: "var(--affino-surface, #fff)", color: "var(--affino-text, #111827)", fontFamily: "inherit" }
const visuallyHiddenStyle = { position: "absolute", width: "1px", height: "1px", padding: 0, margin: "-1px", overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0 }
