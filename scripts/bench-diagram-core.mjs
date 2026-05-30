#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { performance } from "node:perf_hooks"

const ROOT = resolve(new URL("..", import.meta.url).pathname)
const DIST_ENTRY = resolve(ROOT, "packages/diagram-core/dist/index.js")

if (!existsSync(DIST_ENTRY)) {
  throw new Error("packages/diagram-core/dist/index.js is missing. Run `pnpm --filter @affino/diagram-core build` first.")
}

const { createDiagramEngine } = await import(DIST_ENTRY)
const COUNTS = readCounts(process.env.BENCH_DIAGRAM_ENTITY_COUNTS ?? "1000,5000,10000")
const OUTPUT_JSON = resolve(ROOT, process.env.BENCH_OUTPUT_JSON ?? "artifacts/performance/bench-diagram-core.json")

const report = {
  generatedAt: new Date().toISOString(),
  counts: COUNTS,
  metrics: COUNTS.map((count) => runForCount(count)),
}

mkdirSync(dirname(OUTPUT_JSON), { recursive: true })
writeFileSync(OUTPUT_JSON, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))

function runForCount(count) {
  globalThis.gc?.()
  const heapBefore = process.memoryUsage().heapUsed
  const fixture = createFixture(count)
  const initialRender = measure(() => createDiagramEngine(fixture))
  const engine = createDiagramEngine(fixture)
  const viewport = { x: 0, y: 0, width: 1200, height: 800 }
  const visible = measure(() => engine.queryVisible(viewport))
  const pan = measure(() => {
    for (let step = 0; step < 180; step += 1) {
      engine.queryVisible({ x: step * 8, y: 0, width: 1200, height: 800 })
    }
  })
  const drag = measure(() => {
    engine.dispatch({ type: "moveNode", id: "node-10", delta: { x: 24, y: 12 } })
    engine.dispatch({ type: "undo" })
  })
  const selection = measure(() => engine.dispatch({ type: "setSelection", selection: { ids: ["node-10"], primaryId: "node-10" } }))
  const clipboard = measure(() => engine.exportSelection())
  const duplicate = measure(() => {
    engine.duplicateSelection({ x: 24, y: 24 })
    engine.dispatch({ type: "undo" })
  })
  const paste = measure(() => {
    engine.importClipboard(clipboard.value, { x: 48, y: 48 })
    engine.dispatch({ type: "undo" })
  })
  const resize = measure(() => {
    engine.dispatch({ type: "resizeEntities", entries: [{ id: "node-10", width: 112, height: 64 }] })
    engine.dispatch({ type: "undo" })
  })
  const waypoint = measure(() => {
    engine.dispatch({ type: "insertEdgeWaypoint", edgeId: "edge-0", index: 0, point: { x: 120, y: 120 } })
    engine.dispatch({ type: "moveEdgeWaypoint", edgeId: "edge-0", index: 0, point: { x: 132, y: 132 } })
    engine.dispatch({ type: "undo" })
    engine.dispatch({ type: "undo" })
  })
  const fitScene = measure(() => engine.fitScene())
  const diagnostics = engine.getDiagnostics()
  const nearestPort = measure(() => engine.nearestPort({ x: 120, y: 64 }, 48))
  const serialized = measure(() => engine.serialize())
  globalThis.gc?.()
  const heapAfter = process.memoryUsage().heapUsed
  return {
    entityCount: count,
    initialRenderMs: initialRender.ms,
    visibleQueryMs: visible.ms,
    panFpsEstimate: 180 / (pan.ms / 1000),
    dragLatencyMs: drag.ms,
    selectionLatencyMs: selection.ms,
    clipboardExportMs: clipboard.ms,
    duplicateUndoMs: duplicate.ms,
    pasteUndoMs: paste.ms,
    resizeUndoMs: resize.ms,
    waypointEditUndoMs: waypoint.ms,
    fitSceneMs: fitScene.ms,
    nearestPortMs: nearestPort.ms,
    serializeMs: serialized.ms,
    diagnostics,
    memoryDeltaMb: (heapAfter - heapBefore) / 1024 / 1024,
    vueComponentCount: 0,
    visibleCount: Array.isArray(visible.value) ? visible.value.length : 0,
  }
}

function createFixture(entityCount) {
  const nodeCount = Math.max(1, Math.floor(entityCount * 0.45))
  const edgeCount = Math.max(0, Math.floor(entityCount * 0.25))
  const textCount = Math.max(0, Math.floor(entityCount * 0.15))
  const shapeCount = Math.max(0, Math.floor(entityCount * 0.05))
  const portCount = Math.max(0, entityCount - nodeCount - edgeCount - textCount - shapeCount)
  const nodes = []
  const ports = []
  const edges = []
  const texts = []
  const shapes = []
  for (let index = 0; index < nodeCount; index += 1) {
    const x = (index % 100) * 140
    const y = Math.floor(index / 100) * 100
    nodes.push({ id: `node-${index}`, kind: "node", x, y, width: 96, height: 56, portIds: [`port-${index}`] })
  }
  for (let index = 0; index < portCount; index += 1) {
    const nodeId = `node-${index % nodeCount}`
    ports.push({ id: `port-${index}`, kind: "port", nodeId, x: 96, y: 28 })
  }
  for (let index = 0; index < edgeCount; index += 1) {
    edges.push({
      id: `edge-${index}`,
      kind: "edge",
      source: { kind: "port", portId: `port-${index % Math.max(1, portCount)}` },
      target: { kind: "port", portId: `port-${(index + 1) % Math.max(1, portCount)}` },
    })
  }
  for (let index = 0; index < textCount; index += 1) {
    texts.push({ id: `text-${index}`, kind: "text", x: (index % 100) * 140, y: Math.floor(index / 100) * 100 + 64, text: `Label ${index}` })
  }
  for (let index = 0; index < shapeCount; index += 1) {
    shapes.push({ id: `shape-${index}`, kind: "shape", shape: "rect", x: (index % 100) * 140 + 20, y: Math.floor(index / 100) * 100 + 20, width: 48, height: 32 })
  }
  return { nodes, ports, edges, texts, shapes, viewport: { x: 0, y: 0, width: 1200, height: 800, zoom: 1 } }
}

function measure(run) {
  const start = performance.now()
  const value = run()
  return { value, ms: performance.now() - start }
}

function readCounts(value) {
  return value.split(",").map((part) => Number.parseInt(part.trim(), 10)).filter((count) => Number.isFinite(count) && count > 0)
}
