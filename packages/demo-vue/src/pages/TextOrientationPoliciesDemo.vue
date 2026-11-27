<script setup lang="ts">
import { computed, ref } from "vue"
import { createDiagramEngine, type DiagramSceneInput, type TextOrientationPolicy } from "@affino/diagram-core"
import { svgTransform } from "@affino/diagram-vue"

const initialScene = {
  shapes: [
    { id: "orientation-body", kind: "shape" as const, shape: "rect", x: 24, y: 32, width: 210, height: 112, cornerRadius: 8 },
    { id: "orientation-marker", kind: "shape" as const, shape: "rect", x: 24, y: 32, width: 16, height: 32 },
  ],
  texts: [
    { id: "orientation-inherit", kind: "text", x: 46, y: 66, text: "INHERIT", width: 84, height: 18, orientationPolicy: "inherit" },
    { id: "orientation-readable", kind: "text", x: 46, y: 91, text: "READABLE", width: 96, height: 18, orientationPolicy: "keep-readable" },
    { id: "orientation-horizontal", kind: "text", x: 46, y: 116, text: "HORIZONTAL", width: 108, height: 18, orientationPolicy: "keep-horizontal" },
  ],
  ports: [
    { id: "orientation-port-a", kind: "port", hostId: "orientation-body", anchor: { kind: "local", x: 0, y: 56 }, radius: 5 },
    { id: "orientation-port-b", kind: "port", hostId: "orientation-body", anchor: { kind: "local", x: 210, y: 56 }, radius: 5 },
  ],
  groups: [{ id: "orientation-group", kind: "group" as const, childIds: ["orientation-body", "orientation-marker", "orientation-inherit", "orientation-readable", "orientation-horizontal"] }],
} satisfies DiagramSceneInput
const engine = createDiagramEngine(initialScene)
const revision = ref(0)
engine.subscribe(() => { revision.value += 1 })
const shapes = computed(() => { void revision.value; return ["orientation-body", "orientation-marker"].map((id) => ({ entity: engine.getScene().entities.shapesById.get(id)!, geometry: engine.getGeometrySnapshot(id)! })) })
const texts = computed(() => { void revision.value; return ["orientation-inherit", "orientation-readable", "orientation-horizontal"].map((id) => ({ entity: engine.getScene().entities.textsById.get(id)!, geometry: engine.getGeometrySnapshot(id)! })) })
const ports = computed(() => { void revision.value; return ["orientation-port-a", "orientation-port-b"].map((id) => engine.getGeometrySnapshot(id)!) })
const degrees = ref(30)
const policy = ref<TextOrientationPolicy>("keep-readable")
function rotate(degrees: number) { engine.dispatch({ type: "rotateEntities", entries: [{ id: "orientation-group", rotation: (engine.getScene().entities.groupsById.get("orientation-group")?.rotation ?? 0) + degrees }] }) }
function arbitraryRotate() { rotate(degrees.value) }
function flip(axis: "horizontal" | "vertical") { engine.dispatch({ type: "flipEntities", ids: ["orientation-group"], axis }) }
function reset() { engine.transact(() => initialScene) }
function changePolicy() { engine.dispatch({ type: "updateEntities", updates: [{ id: "orientation-readable", orientationPolicy: policy.value }] }) }
</script>

<template>
  <section class="orientation-demo" aria-label="Text orientation policies">
    <h2>Text orientation policies</h2>
    <div class="orientation-controls">
      <button @click="rotate(90)">Rotate clockwise</button><button @click="rotate(-90)">Rotate counterclockwise</button>
      <input v-model.number="degrees" type="number" aria-label="Arbitrary rotation in degrees"><button @click="arbitraryRotate">Rotate</button>
      <button @click="flip('horizontal')">Flip horizontally</button><button @click="flip('vertical')">Flip vertically</button>
      <button @click="reset">Reset transformation</button>
      <select v-model="policy" aria-label="Readable label policy"><option value="inherit">inherit</option><option value="keep-readable">keep-readable</option><option value="keep-horizontal">keep-horizontal</option></select><button @click="changePolicy">Set readable label policy</button>
    </div>
    <svg viewBox="0 0 280 190" role="img" aria-label="Grouped geometry with three text orientation policies">
      <g v-for="item in shapes" :key="item.entity.id"><rect :x="item.geometry.unrotatedBounds?.x" :y="item.geometry.unrotatedBounds?.y" :width="item.geometry.unrotatedBounds?.width" :height="item.geometry.unrotatedBounds?.height" :fill="item.entity.id === 'orientation-body' ? '#e8f1f0' : '#c85d3c'" stroke="#155e59" stroke-width="2" :transform="svgTransform(item.geometry.rotation ?? 0, item.geometry.flipX === true, item.geometry.flipY === true, item.geometry.unrotatedBounds ?? item.geometry.bounds)" /></g>
      <circle v-for="port in ports" :key="port.id" :cx="port.point?.x" :cy="port.point?.y" r="5" fill="#d45b37" />
      <text v-for="item in texts" :key="item.entity.id" :x="item.geometry.unrotatedBounds?.x" :y="(item.geometry.unrotatedBounds?.y ?? 0) + 14" :transform="svgTransform(item.geometry.rotation ?? 0, item.geometry.flipX === true, item.geometry.flipY === true, item.geometry.unrotatedBounds ?? item.geometry.bounds)" font-size="12" font-family="sans-serif">{{ item.entity.text }}</text>
    </svg>
  </section>
</template>

<style scoped>
.orientation-demo { padding: 1rem; border: 1px solid #cbd5d1; border-radius: .75rem; background: #fff; }
.orientation-controls { display: flex; flex-wrap: wrap; gap: .4rem; margin-bottom: .7rem; }
.orientation-demo button, .orientation-demo select, .orientation-demo input { padding: .35rem .5rem; }
.orientation-demo svg { display: block; width: min(100%, 420px); background: #fafcfb; }
</style>
