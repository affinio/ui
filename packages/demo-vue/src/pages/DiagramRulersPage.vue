<script setup lang="ts">
import { computed, ref } from "vue"
import { createDiagramEngine, type DiagramRulerUnit } from "@affino/diagram-core"
import { DiagramCursorIndicator, DiagramGuidePreview, DiagramGuidesOverlay, DiagramRuler, DiagramSelectionExtent, useDiagramEngine, useDiagramViewport } from "@affino/diagram-vue"

const initial = {
  viewport: { x: -160, y: -100, width: 900, height: 560, zoom: 1 },
  shapes: [
    { id: "ruler-demo-a", kind: "shape" as const, shape: "rect" as const, x: -40, y: 30, width: 180, height: 100 },
    { id: "ruler-demo-b", kind: "shape" as const, shape: "ellipse" as const, x: 300, y: 190, width: 120, height: 120 },
  ],
  guides: [{ id: "ruler-demo-guide-x", axis: "x" as const, position: 120 }],
}
const engine = createDiagramEngine(initial)
const diagram = useDiagramEngine({ engine })
const stageContainer = ref<HTMLDivElement | null>(null)
const viewport = useDiagramViewport(diagram, { element: stageContainer })
const unit = ref<DiagramRulerUnit>("px")
const originX = ref(0)
const originY = ref(0)
const cursor = ref<{ x: number; y: number } | null>(null)
const guidePreview = ref<{ axis: "x" | "y"; position: number } | null>(null)
const showGuides = ref(true)
const snapGuides = ref(true)
const snapDiagnostic = ref("No snap yet")
const stage = ref<SVGSVGElement | null>(null)
const view = computed(() => viewport.viewport.value)
const viewBox = computed(() => `${view.value.x} ${view.value.y} ${view.value.width} ${view.value.height}`)
const selectionBounds = computed(() => ({ x: view.value.x, y: view.value.y, width: view.value.width, height: view.value.height }))

function select(id: string, event: MouseEvent) {
  diagram.dispatch({ type: "setSelection", selection: { ids: [id], primaryId: id } })
  if (event.shiftKey) diagram.dispatch({ type: "setSelection", selection: { ids: [...diagram.scene.value.selection.ids, id], primaryId: id } })
}
function worldPoint(event: PointerEvent) {
  const svg = stage.value
  const matrix = svg?.getScreenCTM()
  if (!svg || !matrix) return null
  const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY
  const result = point.matrixTransform(matrix.inverse())
  return { x: result.x, y: result.y }
}
function updateCursor(event: PointerEvent) { cursor.value = worldPoint(event) }
function createGuide(axis: "x" | "y", position: number) {
  diagram.dispatch({ type: "createGuide", guide: { id: `ruler-guide-${Date.now()}-${Math.round(position * 100)}`, axis, position } })
}
function previewGuide(axis: "x" | "y", position: number | null) { guidePreview.value = position === null ? null : { axis, position } }
function zoom(factor: number) {
  const current = view.value
  const nextZoom = Math.min(4, Math.max(0.25, current.zoom * factor))
  const ratio = current.zoom / nextZoom
  const width = current.width * ratio, height = current.height * ratio
  viewport.setViewport({ x: current.x + (current.width - width) / 2, y: current.y + (current.height - height) / 2, width, height, zoom: nextZoom })
}
function pan(dx: number, dy: number) { viewport.setViewport({ x: view.value.x + dx, y: view.value.y + dy }) }
function undo() { diagram.dispatch({ type: "undo" }) }
function redo() { diagram.dispatch({ type: "redo" }) }
function snapSelectionToGuide() {
  const selection = diagram.scene.value.selection
  if (!selection.ids.length) { snapDiagnostic.value = "Select a shape first"; return }
  const result = diagram.engine.snapTranslation(selection, { x: 0, y: 0 }, { radius: 30, snapToGuides: snapGuides.value, snapToAlignment: false })
  const commit = result.snapped ? diagram.dispatch({ type: "moveEntities", ids: selection.ids, delta: result.point }) : null
  const bounds = selection.primaryId ? diagram.engine.getWorldBounds(selection.primaryId) : null
  snapDiagnostic.value = `${result.source ?? "free"}: Δ ${result.point.x.toFixed(1)}, ${result.point.y.toFixed(1)} · ${commit?.changed ? "committed" : "unchanged"} · x ${bounds?.x.toFixed(1) ?? "—"}`
}
</script>

<template>
  <main class="ruler-page">
    <header>
      <div><h1>Adaptive rulers and guides</h1><p>Drag from a ruler to add a persistent guide. Drag a guide to edit it.</p></div>
      <div class="controls">
        <label>Units <select v-model="unit"><option value="px">px</option><option value="mm">mm</option><option value="cm">cm</option><option value="in">in</option></select></label>
        <label><input v-model="showGuides" type="checkbox"> Guides</label>
        <label><input v-model="snapGuides" type="checkbox"> Snap to guides</label>
        <button @click="snapSelectionToGuide">Snap selection</button>
        <button @click="undo">Undo</button><button @click="redo">Redo</button>
        <button @click="zoom(1.5)">Zoom +</button><button @click="zoom(0.67)">Zoom −</button>
        <button @click="pan(-80, -50)">Pan ↖</button><button @click="pan(80, 50)">Pan ↘</button>
      </div>
    </header>
    <div class="origin-controls"><label>X origin <input v-model.number="originX" type="number"></label><label>Y origin <input v-model.number="originY" type="number"></label><span>Cursor: {{ cursor ? `${cursor.x.toFixed(1)}, ${cursor.y.toFixed(1)}` : "outside canvas" }}</span></div>
    <div class="ruler-layout">
      <div class="corner">{{ unit }}</div>
      <DiagramRuler axis="x" :viewport="view" :unit="unit" :origin="originX" label="Horizontal ruler" @create-guide="createGuide" @guide-preview="previewGuide" />
      <DiagramRuler axis="y" :viewport="view" :unit="unit" :origin="originY" label="Vertical ruler" @create-guide="createGuide" @guide-preview="previewGuide" />
      <div ref="stageContainer" class="stage-wrap">
      <svg ref="stage" class="stage" :viewBox="viewBox" preserveAspectRatio="none" role="application" aria-label="Diagram canvas" @pointermove="updateCursor" @pointerleave="cursor = null">
        <rect :x="view.x" :y="view.y" :width="view.width" :height="view.height" fill="#fff" />
        <g v-for="shape in diagram.scene.value.entities.shapesById.values()" :key="shape.id" :data-entity-id="shape.id" :class="{ selected: diagram.scene.value.selection.ids.includes(shape.id) }" @pointerdown="select(shape.id, $event)" @keydown.enter="select(shape.id, $event as unknown as MouseEvent)" tabindex="0" role="button" :aria-label="shape.id">
          <rect v-if="shape.shape === 'rect'" :x="shape.x" :y="shape.y" :width="shape.width" :height="shape.height" rx="5" fill="#e5edf3" stroke="#374957" stroke-width="2" />
          <ellipse v-else :cx="shape.x + shape.width / 2" :cy="shape.y + shape.height / 2" :rx="shape.width / 2" :ry="shape.height / 2" fill="#f3eadc" stroke="#72552c" stroke-width="2" />
          <text :x="shape.x + 10" :y="shape.y + 24" font-size="14">{{ shape.id }}</text>
        </g>
        <DiagramGuidesOverlay v-if="showGuides" :controller="diagram" :viewport="view" />
        <DiagramGuidePreview :axis="guidePreview?.axis ?? null" :position="guidePreview?.position ?? null" :extent="view" />
        <DiagramSelectionExtent :controller="diagram" />
        <DiagramCursorIndicator :position="cursor" :extent="selectionBounds" />
      </svg>
      </div>
    </div>
    <footer>Viewport {{ view.x.toFixed(0) }}, {{ view.y.toFixed(0) }} · {{ Math.round(view.zoom * 100) }}% · {{ snapGuides ? "guide snapping enabled" : "guide snapping disabled" }} · {{ snapDiagnostic }}. Guide snapping uses Core's standard alignment pipeline.</footer>
  </main>
</template>

<style scoped>
.ruler-page{height:100%;min-height:620px;padding:20px;box-sizing:border-box;display:flex;flex-direction:column;gap:12px;color:#263238;background:#f8faf9;font:14px system-ui,sans-serif}header{display:flex;justify-content:space-between;align-items:flex-start;gap:20px}h1{font-size:22px;margin:0 0 4px}p{margin:0;color:#60716a}.controls,.origin-controls{display:flex;align-items:center;flex-wrap:wrap;gap:10px}.controls button{padding:5px 9px}.origin-controls{padding:8px 10px;background:#fff;border:1px solid #d5ddd8}.origin-controls input{width:80px}.ruler-layout{display:grid;grid-template-columns:28px minmax(0,1fr);grid-template-rows:28px minmax(0,1fr);flex:1;min-height:420px;border:1px solid #aeb8b1;background:white}.corner{display:grid;place-items:center;background:#eef1ef;color:#64736c;font-size:11px}.stage-wrap{min-width:0;min-height:0;overflow:hidden}.stage{width:100%;height:100%;touch-action:none}.stage g{cursor:pointer}.stage g.selected rect,.stage g.selected ellipse{stroke:#4457d6;stroke-width:3}.stage text{pointer-events:none;fill:#263238}footer{color:#60716a;font-size:12px}
</style>
