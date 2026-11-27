<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from "vue"
import { createDiagramDocumentPresentationSource, createDiagramEngine } from "@affino/diagram-core"
import { DiagramTableView, getSvgEntityProps, getSvgPortAnchorEditPreviewProps, useDiagramEngine, useDiagramPointerController, useDiagramVisibleEntities, useDiagramViewport } from "@affino/diagram-vue"

const templateDocument = {
  viewport: { x: -20, y: -10, width: 760, height: 500, zoom: 1 },
  shapes: [{ id: "shared-shape", kind: "shape" as const, shape: "rect" as const, x: 80, y: 80, width: 230, height: 120, cornerRadius: 8 }],
  texts: [{ id: "template-label", kind: "text" as const, x: 100, y: 120, text: "Template label", width: 180, height: 28, orientationPolicy: "keep-readable" as const }],
  tables: [{ id: "template-table", kind: "table" as const, x: 340, y: 130, width: 280, height: 120, rowCount: 2, columnCount: 2, columnWidths: [110, 170], rowHeights: [60, 60], cells: [[{ id: "merged-title", text: "Template title" }, { id: "covered-title", text: "Covered" }], [{ id: "first-value", text: "Example" }, { id: "second-value", text: "Value" }]], merges: [{ anchorCellId: "merged-title", rowSpan: 1, columnSpan: 2 }] }],
}
const foregroundEngine = createDiagramEngine({
  viewport: templateDocument.viewport,
  nodes: [{ id: "foreground-terminal-host", kind: "node", x: 520, y: 390, width: 130, height: 72, portIds: ["foreground-terminal"] }],
  ports: [{ id: "foreground-terminal", kind: "port", nodeId: "foreground-terminal-host", x: 130, y: 36, direction: "east", metadata: { label: "Reposition me" } }],
  shapes: [{ id: "shared-shape", kind: "shape", shape: "ellipse", x: 120, y: 260, width: 150, height: 90 }],
  tables: [{ id: "editable-table", kind: "table", x: 340, y: 300, width: 280, height: 72, rowCount: 1, columnCount: 2, cells: [[{ id: "edit-a", text: "Edit me" }, { id: "edit-b", text: "Foreground" }]] }],
})
const diagram = useDiagramEngine({ engine: foregroundEngine })
const pointer = useDiagramPointerController(diagram, {
  toWorldPoint: (event) => {
    const svg = event.currentTarget as SVGSVGElement | null
    const matrix = svg?.getScreenCTM()
    if (!matrix) return { x: event.clientX, y: event.clientY }
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
    return { x: point.x, y: point.y }
  },
})
const foreground = useDiagramVisibleEntities(diagram)
const designSource = createDiagramDocumentPresentationSource(templateDocument)
const previewSource = createDiagramDocumentPresentationSource(templateDocument)
const alternateSource = createDiagramDocumentPresentationSource(templateDocument)
const overrides = shallowRef({ textByEntityId: new Map([["template-label", "Resolved template data"]]), textByTableCellId: new Map([["template-table", new Map([["merged-title", "Resolved merged heading"], ["first-value", "Read only sample"], ["second-value", "Data"]])]]) })
const alternateOverrides = { textByTableCellId: new Map([["template-table", new Map([["merged-title", "Alternate merged heading"]])]]) }
const design = useDiagramVisibleEntities(designSource)
const preview = useDiagramVisibleEntities(previewSource, { contentOverrides: overrides })
const alternate = useDiagramVisibleEntities(alternateSource, { contentOverrides: { textByEntityId: new Map([["template-label", "Independent context B"]]), textByTableCellId: new Map([["template-table", new Map([["merged-title", "Alternate merged heading"]])]]) } })
const activeContext = ref<"design" | "preview">("preview")
const visibleTemplate = computed(() => activeContext.value === "preview" ? preview.projection.value : design.projection.value)
const stage = ref<HTMLDivElement | null>(null)
const viewport = useDiagramViewport(diagram, { element: stage })
const viewBox = computed(() => { const value = viewport.viewport.value; return `${value.x} ${value.y} ${value.width} ${value.height}` })
const foregroundShape = computed(() => foreground.projection.value.shapes.find((entry) => entry.id === "shared-shape"))
const foregroundPorts = computed(() => foreground.projection.value.ports)
const portPreview = computed(() => pointer.state.value.portAnchorEditPreview)
const immutableSerialized = JSON.stringify(designSource.getScene().entities.textsById.get("template-label"))

function selectForeground() { diagram.dispatch({ type: "setSelection", selection: { ids: ["shared-shape"], primaryId: "shared-shape" } }) }
function moveForeground() { diagram.dispatch({ type: "moveEntities", ids: ["shared-shape"], delta: { x: 24, y: 12 } }) }
function zoom(factor: number) {
  const current = viewport.viewport.value
  const zoom = Math.max(0.4, Math.min(2.5, current.zoom * factor))
  const ratio = current.zoom / zoom
  viewport.setViewport({ x: current.x + (current.width - current.width * ratio) / 2, y: current.y + (current.height - current.height * ratio) / 2, width: current.width * ratio, height: current.height * ratio, zoom })
}
function pan(x: number, y: number) { viewport.setViewport({ x: viewport.viewport.value.x + x, y: viewport.viewport.value.y + y }) }
function clearOverrides() { overrides.value = { textByEntityId: new Map(), textByTableCellId: new Map() } }
function restoreOverrides() { overrides.value = { textByEntityId: new Map([["template-label", "Resolved template data"]]), textByTableCellId: new Map([["template-table", new Map([["merged-title", "Resolved merged heading"], ["first-value", "Read only sample"], ["second-value", "Data"]])]]) } }
function undo() { diagram.dispatch({ type: "undo" }) }
function redo() { diagram.dispatch({ type: "redo" }) }
function beginPortEdit(event: PointerEvent) { pointer.beginPortAnchorEdit("foreground-terminal", event) }
onBeforeUnmount(() => { pointer.dispose(); foreground.dispose(); design.dispose(); preview.dispose(); alternate.dispose(); designSource.dispose(); previewSource.dispose(); alternateSource.dispose(); diagram.dispose() })
</script>

<template>
  <main class="presentation-workbench">
    <header>
      <div><h1>Shared scene presentation</h1><p>One editable drawing and two immutable template contexts share this viewport. The repeated shape ID is scoped to each source.</p></div>
      <div class="controls">
        <label>Template context <select v-model="activeContext"><option value="design">Design</option><option value="preview">Preview data</option></select></label>
        <button @click="clearOverrides">Clear overrides</button><button @click="restoreOverrides">Restore preview</button>
        <button @click="moveForeground">Move selected foreground shape</button><button @click="undo">Undo</button><button @click="redo">Redo</button>
        <button @click="zoom(1.25)">Zoom +</button><button @click="zoom(0.8)">Zoom −</button><button @click="pan(-40, -24)">Pan ↖</button><button @click="pan(40, 24)">Pan ↘</button>
      </div>
    </header>
    <div ref="stage" class="presentation-stage">
      <svg v-bind="pointer.getSvgPointerProps()" :viewBox="viewBox" preserveAspectRatio="none" aria-label="Shared editable and immutable Diagram scene">
        <rect x="-10000" y="-10000" width="20000" height="20000" fill="#f8fafc" />
        <g data-presentation-source="immutable-template" pointer-events="none">
          <g v-for="entity in visibleTemplate.ordered.filter(item => item.kind !== 'table')" :key="`${visibleTemplate.renderScopeId}:${entity.id}`" v-bind="getSvgEntityProps(entity)" :data-scene-entity="entity.id">
            <template v-if="entity.kind === 'shape' && entity.geometry.kind === 'shape'">
              <path v-if="entity.geometry.pathContours?.length" :d="String(getSvgEntityProps(entity).d ?? '')" fill="var(--template-fill, #dbeafe)" stroke="#3b5b7a" stroke-width="2" />
              <rect v-else-if="entity.geometry.unrotatedBounds" :x="entity.geometry.unrotatedBounds.x" :y="entity.geometry.unrotatedBounds.y" :width="entity.geometry.unrotatedBounds.width" :height="entity.geometry.unrotatedBounds.height" rx="8" fill="#dbeafe" stroke="#3b5b7a" stroke-width="2" />
            </template>
            <text v-else-if="entity.kind === 'text' && entity.geometry.unrotatedBounds" :x="entity.geometry.unrotatedBounds.x" :y="entity.geometry.unrotatedBounds.y + 18" font-size="16">{{ entity.displayText }}</text>
          </g>
          <DiagramTableView :presentation-source="activeContext === 'preview' ? previewSource : designSource" id="template-table" :content-overrides="activeContext === 'preview' ? overrides : undefined" />
        </g>
        <g data-presentation-context="alternate" data-presentation-source="immutable-template-alternate" pointer-events="none">
          <text x="790" y="18" font-size="14">Independent context B</text>
          <g transform="translate(790 30) scale(.42)">
            <text v-for="entity in alternate.projection.value.texts" :key="`${alternate.projection.value.renderScopeId}:${entity.id}`" v-bind="getSvgEntityProps(entity)">{{ entity.displayText }}</text>
            <DiagramTableView :presentation-source="alternateSource" id="template-table" :content-overrides="alternateOverrides" />
          </g>
        </g>
        <g data-presentation-source="editable-foreground">
          <g v-if="foregroundShape" :key="`${foreground.projection.value.renderScopeId}:${foregroundShape.id}`" v-bind="getSvgEntityProps(foregroundShape)" data-foreground-shape="shared-shape" tabindex="0" role="button" aria-label="Select foreground shape" @pointerdown.stop="selectForeground" @keydown.enter="selectForeground">
            <ellipse v-if="foregroundShape.geometry.kind === 'shape'" :cx="foregroundShape.geometry.bounds.x + foregroundShape.geometry.bounds.width / 2" :cy="foregroundShape.geometry.bounds.y + foregroundShape.geometry.bounds.height / 2" :rx="foregroundShape.geometry.bounds.width / 2" :ry="foregroundShape.geometry.bounds.height / 2" fill="#fef3c7" stroke="#a16207" stroke-width="3" />
          </g>
          <g v-for="entity in foreground.projection.value.nodes" :key="`${foreground.projection.value.renderScopeId}:${entity.id}`" v-bind="getSvgEntityProps(entity)">
            <rect v-if="entity.geometry.kind === 'node' && entity.geometry.unrotatedBounds" :x="entity.geometry.unrotatedBounds.x" :y="entity.geometry.unrotatedBounds.y" :width="entity.geometry.unrotatedBounds.width" :height="entity.geometry.unrotatedBounds.height" rx="8" fill="#ecfccb" stroke="#4d7c0f" stroke-width="2" />
          </g>
          <circle v-for="entity in foregroundPorts" :key="`${foreground.projection.value.renderScopeId}:${entity.id}`" v-bind="getSvgEntityProps(entity)" data-port-edit-handle="true" aria-label="Reposition foreground terminal" role="button" tabindex="0" @pointerdown.stop="beginPortEdit" />
          <circle v-if="portPreview" v-bind="getSvgPortAnchorEditPreviewProps(portPreview, 8)" />
          <DiagramTableView :controller="diagram" id="editable-table" :show-toolbar="false" />
        </g>
      </svg>
    </div>
    <p class="state">Foreground document revision: {{ diagram.scene.value.revision }} · selection: {{ diagram.scene.value.selection.ids.join(",") || "none" }} · immutable template label: {{ immutableSerialized }} · drag the foreground terminal to reposition it.</p>
  </main>
</template>

<style scoped>
.presentation-workbench{height:100%;min-height:0;display:flex;flex-direction:column;gap:12px;padding:16px;box-sizing:border-box;color:#172033}.presentation-workbench header{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.presentation-workbench h1{font-size:20px;margin:0 0 5px}.presentation-workbench p{margin:0;color:#5b6472}.controls{display:flex;justify-content:flex-end;align-items:center;gap:6px;flex-wrap:wrap}.controls button,.controls select{padding:6px 8px;border:1px solid #cbd5e1;border-radius:5px;background:white}.controls label{font-size:12px}.presentation-stage{flex:1;min-height:300px;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden}.presentation-stage svg{width:100%;height:100%;display:block}.state{font-size:12px}
</style>
