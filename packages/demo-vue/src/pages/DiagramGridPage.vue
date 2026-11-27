<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue"
import { type DiagramPoint, type DiagramSceneInput } from "@affino/diagram-core"
import { getSvgEntityProps, useDiagramEngine, useDiagramPointerController, useDiagramViewport, useDiagramVisibleEntities } from "@affino/diagram-vue"
import type { DiagramPointerController } from "@affino/diagram-vue"
import { useDiagramCanvasGestures } from "./useDiagramCanvasGestures"

const stage = ref<HTMLElement | null>(null)
const gridStep = ref(24)
const showGrid = ref(true)
const snapToGrid = ref(true)
const activeTool = ref<"select" | "pan">("select")
const nextId = ref(1)

const initialScene: DiagramSceneInput = {
  viewport: { x: 0, y: 0, width: 960, height: 620, zoom: 1 },
  nodes: [
    { id: "grid-node-a", kind: "node", x: 120, y: 120, width: 140, height: 76, portIds: ["grid-port-a"] },
    { id: "grid-node-b", kind: "node", x: 480, y: 288, width: 140, height: 76, portIds: ["grid-port-b"] },
    { id: "grid-node-c", kind: "node", x: 720, y: 120, width: 140, height: 76 },
  ],
  ports: [
    { id: "grid-port-a", kind: "port", nodeId: "grid-node-a", x: 140, y: 38 },
    { id: "grid-port-b", kind: "port", nodeId: "grid-node-b", x: 0, y: 38 },
  ],
  edges: [{ id: "grid-edge", kind: "edge", source: { kind: "port", portId: "grid-port-a" }, target: { kind: "port", portId: "grid-port-b" } }],
  shapes: [{ id: "grid-shape", kind: "shape", shape: "ellipse", x: 320, y: 440, width: 88, height: 88 }],
}
const diagram = useDiagramEngine(initialScene)
const visible = useDiagramVisibleEntities(diagram, { overscan: 24 })
const viewport = useDiagramViewport(diagram, { element: stage })

function toWorldPoint(event: PointerEvent): DiagramPoint {
  const bounds = stage.value?.getBoundingClientRect()
  const view = viewport.viewport.value
  return bounds
    ? { x: view.x + (event.clientX - bounds.left) / view.zoom, y: view.y + (event.clientY - bounds.top) / view.zoom }
    : { x: view.x, y: view.y }
}

function createPointer(tool: "select" | "pan" = activeTool.value): DiagramPointerController {
  const pointer = useDiagramPointerController(diagram, {
    toWorldPoint,
    snap: { enabled: snapToGrid.value, gridSize: gridStep.value, snapToPorts: false, snapToAlignment: false, snapToEqualSpacing: false, kinds: ["grid"] },
  })
  pointer.setTool(tool)
  return pointer
}

const pointer = shallowRef(createPointer())
watch([gridStep, snapToGrid], () => {
  const tool = pointer.value.state.value.tool === "pan" ? "pan" : "select"
  pointer.value.dispose()
  pointer.value = createPointer(tool)
})
onBeforeUnmount(() => pointer.value.dispose())
const gestures = useDiagramCanvasGestures(stage, viewport, () => pointer.value.cancel())

const viewBox = computed(() => {
  const view = displayViewport.value
  return `${view.x} ${view.y} ${view.width} ${view.height}`
})
const displayViewport = computed(() => {
  const current = viewport.viewport.value
  const delta = pointer.value.state.value.tool === "pan" ? pointer.value.state.value.previewDelta : null
  return delta ? { ...current, x: current.x - delta.x, y: current.y - delta.y } : current
})
const zoomLabel = computed(() => `${Math.round(viewport.viewport.value.zoom * 100)}%`)
const selectedId = computed(() => diagram.scene.value.selection.primaryId)
const selectedGeometry = computed(() => {
  const id = selectedId.value
  return id ? visible.projection.value.ordered.find((entity) => entity.id === id)?.geometry ?? null : null
})

function renderGeometry(entity: (typeof visible.projection.value.ordered)[number]) {
  const state = pointer.value.state.value
  const geometry = state.active ? pointer.value.getPreviewGeometry(entity.id) : null
  return geometry ? { ...entity, geometry } : entity
}

function onPointerdown(event: PointerEvent): void {
  if (!gestures.pointerDown(event)) pointer.value.getSvgPointerProps().onPointerdown(event)
}
function onPointermove(event: PointerEvent): void {
  if (!gestures.pointerMove(event)) pointer.value.getSvgPointerProps().onPointermove(event)
}
function onPointerup(event: PointerEvent): void {
  if (!gestures.pointerUp(event)) pointer.value.getSvgPointerProps().onPointerup(event)
}
function onPointercancel(event: PointerEvent): void {
  if (!gestures.pointerCancel(event)) pointer.value.getSvgPointerProps().onPointercancel()
}

function setTool(tool: "select" | "pan"): void {
  activeTool.value = tool
  pointer.value.setTool(tool)
}

function moveSelection(delta: DiagramPoint): void {
  const ids = diagram.scene.value.selection.ids
  if (ids.length) diagram.dispatch({ type: "moveEntities", ids, delta, snap: snapToGrid.value ? { gridSize: gridStep.value, strictGrid: true } : undefined })
}

function snapSelection(): void {
  const geometry = selectedGeometry.value
  const ids = diagram.scene.value.selection.ids
  if (!geometry || !ids.length) return
  const point = diagram.engine.snapPoint({ x: geometry.bounds.x, y: geometry.bounds.y }, { gridSize: gridStep.value }).point
  diagram.dispatch({ type: "moveEntities", ids, delta: { x: point.x - geometry.bounds.x, y: point.y - geometry.bounds.y }, snap: { gridSize: gridStep.value, strictGrid: true } })
}

function addShape(shape: "rect" | "ellipse" | "line"): void {
  const id = `grid-created-${nextId.value++}`
  const origin = { x: viewport.viewport.value.x + 250, y: viewport.viewport.value.y + 180 }
  diagram.dispatch({ type: "createShape", shape: {
    id, kind: "shape", shape,
    x: origin.x, y: origin.y,
    width: shape === "line" ? 132 : 112,
    height: shape === "line" ? 76 : 72,
  } })
  diagram.dispatch({ type: "setSelection", selection: { ids: [id], primaryId: id } })
}

function resetScene(): void {
  diagram.engine.transact(() => initialScene)
  viewport.setViewport({ x: 0, y: 0, zoom: 1 })
}
</script>

<template>
  <main class="grid-lab">
    <header class="grid-lab__header">
      <div><p class="eyebrow">Affino Diagram · interaction lab</p><h1>Grid movement</h1><p>Change the grid step, drag objects, and compare snapping with free movement.</p></div>
      <nav class="diagram-demo-nav" aria-label="Diagram demos">
        <RouterLink to="/diagram">Full generation</RouterLink><RouterLink to="/diagram/table">Table constructor</RouterLink><RouterLink to="/diagram/connectors">Ports + connectors</RouterLink>
        <RouterLink to="/diagram/grid" aria-current="page">Grid movement</RouterLink><RouterLink to="/diagram/canvas">Free canvas</RouterLink>
      </nav>
    </header>

    <section class="grid-lab__controls" aria-label="Grid controls">
      <label>Grid step
        <select v-model.number="gridStep">
          <option :value="8">8 px</option><option :value="12">12 px</option><option :value="16">16 px</option>
          <option :value="24">24 px</option><option :value="32">32 px</option><option :value="48">48 px</option>
        </select>
      </label>
      <label><input v-model="showGrid" type="checkbox"> Show grid</label>
      <label><input v-model="snapToGrid" type="checkbox"> Snap while dragging</label>
      <button :class="{ active: pointer.state.value.tool === 'select' }" type="button" @click="setTool('select')">Select / move</button>
      <button :class="{ active: pointer.state.value.tool === 'pan' }" type="button" @click="setTool('pan')">Pan canvas</button>
      <button type="button" :disabled="!selectedId" @click="snapSelection">Snap selection</button>
      <button type="button" @click="moveSelection({ x: gridStep, y: 0 })">Move +1 step →</button>
      <button type="button" @click="moveSelection({ x: 0, y: gridStep })">Move +1 step ↓</button>
      <button type="button" @click="addShape('rect')">Add rectangle</button>
      <button type="button" @click="addShape('ellipse')">Add ellipse</button>
      <button type="button" @click="addShape('line')">Add line</button>
      <button type="button" @click="diagram.dispatch({ type: 'undo' })">Undo</button>
      <button type="button" @click="diagram.dispatch({ type: 'redo' })">Redo</button>
      <button type="button" @click="resetScene">Reset scene</button>
      <output>Step {{ gridStep }} · zoom {{ zoomLabel }} · {{ snapToGrid ? 'snap on' : 'snap off' }}</output>
    </section>

    <div ref="stage" class="grid-lab__stage">
      <svg class="grid-lab__svg" :viewBox="viewBox" preserveAspectRatio="none" tabindex="0" :data-tool="pointer.state.value.tool"
        @pointerdown="onPointerdown" @pointermove="onPointermove"
        @pointerup="onPointerup" @pointercancel="onPointercancel" @lostpointercapture="onPointercancel" @wheel="gestures.wheel">
        <defs><pattern id="diagram-lab-grid" :width="gridStep" :height="gridStep" patternUnits="userSpaceOnUse"><path :d="`M ${gridStep} 0 L 0 0 0 ${gridStep}`" fill="none" stroke="rgba(37, 70, 61, .14)" stroke-width="1" /></pattern></defs>
        <rect :x="displayViewport.x" :y="displayViewport.y" :width="displayViewport.width" :height="displayViewport.height" :fill="showGrid ? 'url(#diagram-lab-grid)' : '#f8f6ef'" pointer-events="none" />
        <template v-for="entity in visible.projection.value.ordered" :key="entity.id">
          <polyline v-if="entity.kind === 'edge'" :points="renderGeometry(entity).geometry.path?.map(point => `${point.x},${point.y}`).join(' ')" fill="none" :stroke="entity.selected ? '#087f67' : '#334d45'" stroke-width="3" />
          <circle v-else-if="entity.kind === 'port'" :cx="renderGeometry(entity).geometry.point?.x" :cy="renderGeometry(entity).geometry.point?.y" r="6" fill="#24433d" stroke="white" stroke-width="2" />
          <ellipse v-else-if="entity.kind === 'shape' && diagram.scene.value.entities.shapesById.get(entity.id)?.shape === 'ellipse'" v-bind="getSvgEntityProps(renderGeometry(entity))" :cx="renderGeometry(entity).geometry.bounds.x + renderGeometry(entity).geometry.bounds.width / 2" :cy="renderGeometry(entity).geometry.bounds.y + renderGeometry(entity).geometry.bounds.height / 2" :rx="renderGeometry(entity).geometry.bounds.width / 2" :ry="renderGeometry(entity).geometry.bounds.height / 2" :class="['grid-lab__shape', { selected: entity.selected }]" />
          <polyline v-else-if="entity.kind === 'shape' && renderGeometry(entity).geometry.path" :points="renderGeometry(entity).geometry.path?.map(point => `${point.x},${point.y}`).join(' ')" :class="['grid-lab__shape grid-lab__shape--line', { selected: entity.selected }]" />
          <rect v-else-if="entity.kind === 'node' || entity.kind === 'shape'" v-bind="getSvgEntityProps(renderGeometry(entity))" :class="[entity.kind === 'node' ? 'grid-lab__node' : 'grid-lab__shape', { selected: entity.selected }]" />
          <text v-if="entity.kind === 'node'" :x="renderGeometry(entity).geometry.bounds.x + 14" :y="renderGeometry(entity).geometry.bounds.y + 42" class="grid-lab__label">{{ diagram.scene.value.entities.nodesById.get(entity.id)?.metadata?.label ?? entity.id }}</text>
        </template>
      </svg>
    </div>
  </main>
</template>

<style scoped>
.grid-lab { min-height: 0; flex: 1 1 auto; display: grid; grid-template-rows: auto auto minmax(24rem, 1fr); gap: .9rem; color: #23372f; }
.grid-lab__header { display: flex; justify-content: space-between; align-items: end; gap: 1rem; flex-wrap: wrap; }
.eyebrow { margin: 0 0 .35rem; color: #65746d; font-size: .72rem; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
h1 { margin: 0; font-size: clamp(1.6rem, 3vw, 2.4rem); }
.grid-lab__header p:last-child { margin: .35rem 0 0; color: #637069; }
.diagram-demo-nav { display: flex; flex-wrap: wrap; gap: .4rem; }
.diagram-demo-nav a { padding: .5rem .7rem; border: 1px solid #d6ddd6; border-radius: 999px; color: #2d5146; text-decoration: none; font-size: .82rem; font-weight: 700; }
.diagram-demo-nav a[aria-current="page"] { color: white; background: #285247; border-color: #285247; }
.grid-lab__controls { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; padding: .65rem; border: 1px solid #dce3dc; border-radius: .8rem; background: #fffdf8; }
.grid-lab__controls label { display: inline-flex; align-items: center; gap: .4rem; padding: .25rem .35rem; font-size: .84rem; }
.grid-lab__controls select, .grid-lab__controls button { min-height: 2.2rem; border: 1px solid #d1d9d1; border-radius: .5rem; padding: .35rem .65rem; background: white; color: #23372f; font: inherit; font-size: .82rem; }
.grid-lab__controls button { cursor: pointer; font-weight: 700; }
.grid-lab__controls button.active { color: white; background: #285247; }
.grid-lab__controls button:disabled { opacity: .45; cursor: not-allowed; }
.grid-lab__controls output { margin-left: auto; color: #61716a; font-size: .8rem; font-variant-numeric: tabular-nums; }
.grid-lab__stage { position: relative; min-height: 0; overflow: hidden; border: 1px solid #cbd6ce; border-radius: .9rem; background: #f8f6ef; box-shadow: 0 16px 40px #324a3d12; }
.grid-lab__svg { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; user-select: none; -webkit-user-select: none; }
.grid-lab__node { fill: #fffefa; stroke: #31574b; stroke-width: 2; rx: 8; }
.grid-lab__node.selected, .grid-lab__shape.selected { stroke: #087f67; stroke-width: 3; }
.grid-lab__shape { fill: #d9efe4; stroke: #54806e; stroke-width: 2; }
.grid-lab__shape--line { fill: none; stroke-width: 4; }
.grid-lab__label { fill: #24433d; font-size: 16px; font-weight: 700; pointer-events: none; }
@media (max-width: 760px) { .grid-lab { grid-template-rows: auto auto minmax(24rem, 60vh); } .grid-lab__controls output { margin-left: 0; width: 100%; } }
</style>
