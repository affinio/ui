<script setup lang="ts">
import { computed, ref } from "vue"
import { createDiagramEngine, deserializeScene, resolveDiagramTableLayout, type DiagramSceneInput, type TransformOrigin } from "@affino/diagram-core"
import { svgTransform } from "@affino/diagram-vue"

const initialScene = {
  shapes: [
    { id: "pivot-box", kind: "shape" as const, shape: "rect", x: 26, y: 34, width: 180, height: 96 },
    { id: "pivot-notch", kind: "shape" as const, shape: "rect", x: 26, y: 34, width: 20, height: 42 },
    { id: "pivot-path", kind: "shape" as const, shape: "line", x: 48, y: 38, width: 32, height: 26, points: [{ x: 0, y: 0 }, { x: 32, y: 0 }, { x: 32, y: 26 }, { x: 12, y: 26 }, { x: 12, y: 10 }, { x: 0, y: 10 }] },
    { id: "pivot-target-a", kind: "shape" as const, shape: "rect", x: 270, y: 42, width: 28, height: 24 },
    { id: "pivot-target-b", kind: "shape" as const, shape: "rect", x: 315, y: 78, width: 34, height: 18 },
  ],
  texts: [{ id: "pivot-label", kind: "text" as const, x: 70, y: 72, text: "GROUP PIVOT", width: 100, height: 20, orientationPolicy: "keep-readable" as const }],
  ports: [
    { id: "pivot-port-left", kind: "port" as const, hostId: "pivot-group", anchor: { kind: "local" as const, x: 0, y: 48 }, radius: 5 },
    { id: "pivot-port-right", kind: "port" as const, hostId: "pivot-group", anchor: { kind: "local" as const, x: 180, y: 48 }, radius: 5 },
  ],
  edges: [{ id: "pivot-connector", kind: "edge" as const, source: { kind: "port" as const, portId: "pivot-port-right" }, target: { kind: "point" as const, point: { x: 245, y: 82 } } }],
  tables: [{ id: "pivot-table", kind: "table" as const, x: 78, y: 102, width: 76, height: 24, rowCount: 1, columnCount: 2, cells: [[{ text: "CELL A" }, { text: "CELL B" }]] }],
  groups: [
    { id: "pivot-inner", kind: "group" as const, childIds: ["pivot-box", "pivot-notch", "pivot-label", "pivot-table"], x: 0, y: 0 },
    { id: "pivot-group", kind: "group" as const, childIds: ["pivot-inner", "pivot-path"], x: 0, y: 0 },
    { id: "pivot-target", kind: "group" as const, childIds: ["pivot-target-a", "pivot-target-b"], x: 0, y: 0, rotation: -12, flipY: true },
  ],
} satisfies DiagramSceneInput
const engine = createDiagramEngine(initialScene)
const revision = ref(0)
engine.subscribe(() => { revision.value += 1 })
const shapes = computed(() => { void revision.value; return ["pivot-box", "pivot-notch", "pivot-path", "pivot-target-a", "pivot-target-b"].map((id) => ({ entity: engine.getScene().entities.shapesById.get(id)!, geometry: engine.getGeometrySnapshot(id)! })) })
const text = computed(() => { void revision.value; const entity = engine.getScene().entities.textsById.get("pivot-label")!; return { entity, geometry: engine.getGeometrySnapshot(entity.id)! } })
const ports = computed(() => { void revision.value; return ["pivot-port-left", "pivot-port-right"].map((id) => engine.getGeometrySnapshot(id)!) })
const connector = computed(() => { void revision.value; return engine.getGeometrySnapshot("pivot-connector") })
const table = computed(() => { void revision.value; return engine.getScene().entities.tablesById.get("pivot-table")! })
const tableGeometry = computed(() => { void revision.value; return engine.getGeometrySnapshot("pivot-table")! })
const tableLayout = computed(() => resolveDiagramTableLayout(table.value))
const pivot = computed(() => { void revision.value; return engine.resolveWorldTransformOrigin("pivot-group") })
const x = ref(0)
const y = ref(0.5)
const absolute = ref(false)
const preserve = ref(true)
const degrees = ref(30)
const geometryCheck = ref("not checked")
const selectedChild = computed(() => { void revision.value; return engine.getScene().selection.ids.join(", ") || "none" })
const reparented = computed(() => { void revision.value; return engine.getParentGroupId("pivot-inner") === "pivot-target" })
const diagnostics = computed(() => { void revision.value; return { parent: engine.getParentGroupId("pivot-inner"), local: engine.resolveLocalTransform("pivot-inner"), world: engine.resolveWorldTransform("pivot-inner"), bounds: engine.getWorldBounds("pivot-inner") } })
const positions = [{ label: "Top left", x: 0, y: 0 }, { label: "Top centre", x: .5, y: 0 }, { label: "Top right", x: 1, y: 0 }, { label: "Middle left", x: 0, y: .5 }, { label: "Centre", x: .5, y: .5 }, { label: "Middle right", x: 1, y: .5 }, { label: "Bottom left", x: 0, y: 1 }, { label: "Bottom centre", x: .5, y: 1 }, { label: "Bottom right", x: 1, y: 1 }]
function setOrigin(value: TransformOrigin | null) { engine.dispatch({ type: "setTransformOrigin", id: "pivot-group", transformOrigin: value, preserveWorldGeometry: preserve.value }) }
function choosePosition(event: Event) { const item = positions[Number((event.target as HTMLSelectElement).value)]!; x.value = item.x; y.value = item.y; absolute.value = false; setOrigin({ mode: "relative", x: item.x, y: item.y }) }
function applyOrigin() { setOrigin({ mode: absolute.value ? "absolute" : "relative", x: x.value, y: y.value }) }
function rotate(amount: number) { const group = engine.getScene().entities.groupsById.get("pivot-group")!; engine.dispatch({ type: "rotateEntities", entries: [{ id: group.id, rotation: (group.rotation ?? 0) + amount }] }) }
function flip(axis: "horizontal" | "vertical") { engine.dispatch({ type: "flipEntities", ids: ["pivot-group"], axis }) }
function rotateInner(amount: number) { const group = engine.getScene().entities.groupsById.get("pivot-inner")!; engine.dispatch({ type: "rotateEntities", entries: [{ id: group.id, rotation: (group.rotation ?? 0) + amount }] }) }
function moveParent(amount: number) { engine.dispatch({ type: "moveEntities", ids: ["pivot-group"], delta: { x: amount, y: amount / 2 } }) }
function reparentInner() { engine.dispatch({ type: "reparentEntity", id: "pivot-inner", parentId: reparented.value ? "pivot-group" : "pivot-target" }) }
function ungroupInner() { engine.dispatch({ type: "ungroupEntities", ids: ["pivot-inner"] }) }
function groupSiblingPair() { engine.dispatch({ type: "groupEntities", id: "pivot-browser-group", ids: ["pivot-inner", "pivot-path"] }) }
function editTableCell() {
  const entity = table.value
  const center = { x: entity.x + entity.width / 4, y: entity.y + entity.height / 2 }
  const world = engine.localToWorld(entity.id, center)
  const cell = world && engine.getTableCellAt(entity.id, world)
  if (cell) engine.dispatch({ type: "updateTableCell", id: entity.id, ...cell, cell: { text: entity.cells?.[cell.row]?.[cell.column]?.text === "EDITED" ? "CELL A" : "EDITED" } })
}
function selectNestedChild() { engine.dispatch({ type: "setSelection", selection: { ids: ["pivot-label"], primaryId: "pivot-label" } }) }
function verifyNestedHit() {
  const geometry = engine.getGeometrySnapshot("pivot-box")
  const point = geometry && { x: geometry.bounds.x + geometry.bounds.width / 2, y: geometry.bounds.y + geometry.bounds.height / 2 }
  geometryCheck.value = point ? `hit=${engine.hitTest(point, { kinds: ["shape"] })?.id ?? "none"}` : "hit=none"
}
function verifyNestedSnap() {
  const geometry = engine.getGeometrySnapshot("pivot-box")
  const point = geometry && { x: geometry.bounds.x + geometry.bounds.width / 2, y: geometry.bounds.y + geometry.bounds.height / 2 }
  const candidate = point && engine.getSnapCandidates(point, { kinds: ["center"], tolerancePx: 0 }).find((entry) => entry.targetId === "pivot-box")
  geometryCheck.value = `snap=${candidate?.targetId ?? "none"}`
}
function undo() { engine.dispatch({ type: "undo" }) }
function redo() { engine.dispatch({ type: "redo" }) }
function restoreSerialized() { const snapshot = deserializeScene(engine.serialize()); engine.transact(() => snapshot) }
function reset() { engine.transact(() => initialScene); x.value = 0; y.value = .5; absolute.value = false }
</script>

<template>
  <section class="pivot-demo" aria-label="Configurable transform origin example">
    <h2>Transform origin</h2>
    <div class="pivot-controls">
      <select aria-label="Nine-position origin" @change="choosePosition"><option v-for="(item, index) in positions" :key="item.label" :value="index">{{ item.label }}</option></select>
      <label><input v-model="absolute" type="checkbox"> Absolute coordinates</label>
      <label>X <input v-model.number="x" type="number" step="0.1"></label><label>Y <input v-model.number="y" type="number" step="0.1"></label>
      <button @click="applyOrigin">Set origin</button><label><input v-model="preserve" type="checkbox"> Preserve geometry</label>
      <input v-model.number="degrees" type="number" aria-label="Rotation degrees"><button @click="rotate(degrees)">Rotate</button>
      <button @click="rotateInner(degrees)">Rotate nested group</button>
      <button @click="flip('horizontal')">Flip horizontally</button><button @click="flip('vertical')">Flip vertically</button>
      <button @click="moveParent(12)">Move parent</button><button @click="reparentInner">{{ reparented ? "Reparent nested group back" : "Reparent nested group" }}</button><button @click="groupSiblingPair">Group nested siblings</button><button @click="ungroupInner">Ungroup nested group</button>
      <button @click="selectNestedChild">Select nested text</button><button @click="verifyNestedHit">Verify nested hit</button><button @click="verifyNestedSnap">Verify nested snap</button>
      <button @click="undo">Undo</button><button @click="redo">Redo</button><button @click="restoreSerialized">Serialize and restore</button>
      <button @click="setOrigin(null)">Reset origin</button><button @click="reset">Reset example</button>
    </div>
    <svg viewBox="0 0 400 190" role="img" aria-label="Nested groups with asymmetric geometry, readable text, group ports, and transform pivot">
      <g v-for="item in shapes" :key="item.entity.id"><polyline v-if="item.geometry.path" :points="item.geometry.path.map(point => `${point.x},${point.y}`).join(' ')" fill="none" stroke="#155e59" stroke-width="2" /><rect v-else :x="item.geometry.unrotatedBounds?.x" :y="item.geometry.unrotatedBounds?.y" :width="item.geometry.unrotatedBounds?.width" :height="item.geometry.unrotatedBounds?.height" :fill="item.entity.id === 'pivot-box' ? '#edf3f2' : item.entity.id.startsWith('pivot-target') ? '#dbeafe' : '#c85d3c'" stroke="#155e59" stroke-width="2" :transform="svgTransform(item.geometry.rotation ?? 0, item.geometry.flipX === true, item.geometry.flipY === true, item.geometry.unrotatedBounds ?? item.geometry.bounds, item.geometry.localTransformOrigin ?? item.geometry.transformOrigin, item.geometry.parentTransform)" /></g>
      <text :x="text.geometry.unrotatedBounds?.x" :y="(text.geometry.unrotatedBounds?.y ?? 0) + 14" :transform="svgTransform(text.geometry.rotation ?? 0, text.geometry.flipX === true, text.geometry.flipY === true, text.geometry.unrotatedBounds ?? text.geometry.bounds, text.geometry.localTransformOrigin ?? text.geometry.transformOrigin, text.geometry.parentTransform)" font-size="12">{{ text.entity.text }}</text>
      <g v-if="connector?.path" aria-label="Connector attached to group port"><polyline :points="connector.path.map(point => `${point.x},${point.y}`).join(' ')" fill="none" stroke="#d45b37" stroke-width="2" /></g>
      <circle v-for="port in ports" :key="port.id" :cx="port.point?.x" :cy="port.point?.y" r="5" fill="#d45b37" />
      <g :transform="tableGeometry.parentTransform ? `matrix(${tableGeometry.parentTransform.a} ${tableGeometry.parentTransform.b} ${tableGeometry.parentTransform.c} ${tableGeometry.parentTransform.d} ${tableGeometry.parentTransform.e} ${tableGeometry.parentTransform.f})` : undefined" data-diagram-table-id="pivot-table">
        <rect :x="table.x" :y="table.y" :width="table.width" :height="table.height" fill="#fff8e8" stroke="#155e59" />
        <line :x1="tableLayout.cellBounds[0]?.[1]?.x" :y1="table.y" :x2="tableLayout.cellBounds[0]?.[1]?.x" :y2="table.y + table.height" stroke="#155e59" />
        <text :x="table.x + 4" :y="table.y + 16" font-size="9" role="button" aria-label="Edit nested table cell" @click="editTableCell">{{ table.cells?.[0]?.[0]?.text }}</text>
        <text :x="table.x + table.width / 2 + 4" :y="table.y + 16" font-size="9">{{ table.cells?.[0]?.[1]?.text }}</text>
      </g>
      <g v-if="pivot" class="pivot-marker" aria-hidden="true"><circle :cx="pivot.x" :cy="pivot.y" r="9" /><path :d="`M ${pivot.x - 6} ${pivot.y} H ${pivot.x + 6} M ${pivot.x} ${pivot.y - 6} V ${pivot.y + 6}`" /></g>
    </svg>
    <output>Origin: {{ engine.getTransformOrigin("pivot-group") ?? "default centre" }} · World pivot: {{ pivot }} · Inner parent: {{ diagnostics.parent }}</output>
    <output>Selection: {{ selectedChild }} · Geometry checks: {{ geometryCheck }}</output>
    <pre aria-label="Transform diagnostics">local={{ diagnostics.local }} world={{ diagnostics.world }} bounds={{ diagnostics.bounds }}</pre>
  </section>
</template>

<style scoped>
.pivot-demo { padding: 1rem; border: 1px solid #cbd5d1; border-radius: .75rem; background: #fff; }
.pivot-controls { display: flex; flex-wrap: wrap; gap: .4rem; margin-bottom: .7rem; }
.pivot-controls button, .pivot-controls select, .pivot-controls input { padding: .3rem .45rem; }
.pivot-demo svg { display: block; width: min(100%, 420px); background: #fafcfb; }
.pivot-marker circle { fill: #fff; stroke: #b42318; stroke-width: 2; stroke-dasharray: 2 2; pointer-events: none; }
.pivot-marker path { stroke: #b42318; stroke-width: 1.5; pointer-events: none; }
</style>
