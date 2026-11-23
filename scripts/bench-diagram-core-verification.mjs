#!/usr/bin/env node
import { performance } from "node:perf_hooks"
import { resolve } from "node:path"

const root = resolve(new URL("..", import.meta.url).pathname)
const { createDiagramEngine } = await import(resolve(root, "packages/diagram-core/dist/index.js"))
const warmup = Number(process.env.BENCH_WARMUP ?? 5)
const iterations = Number(process.env.BENCH_ITERATIONS ?? 10)
const counts = (process.env.BENCH_DIAGRAM_ENTITY_COUNTS ?? "1000,5000,10000").split(",").map(Number).filter((value) => Number.isFinite(value) && value > 0)
const result = { warmup, iterations, generatedAt: new Date().toISOString(), workloads: counts.map(run) }
console.log(JSON.stringify(result, null, 2))

function run(total) {
  const versions = {}
  for (const mode of ["legacy", "current"]) {
    const fixture = createFixture(total)
    const engine = createDiagramEngine(fixture)
    if (mode === "legacy") {
      engine.findEqualSpacing = legacyEqualSpacing
      installLegacyDependencyIndex(engine)
    }
    const selection = { ids: ["n0"], primaryId: "n0" }
    const equalSpacing = () => engine.snapTranslation(selection, { x: 25, y: 0 }, { radius: 10, snapToAlignment: false, snapToEqualSpacing: true })
    const waypointUndo = () => {
      engine.dispatch({ type: "moveEdgeWaypoint", id: "e0", index: 0, point: { x: 31, y: 11 } })
      engine.dispatch({ type: "undo" })
    }
    equalSpacing(); waypointUndo()
    for (let i = 0; i < warmup; i += 1) { equalSpacing(); waypointUndo() }
    const rebuildStart = legacyRebuilds(engine)
    const spacingTimes = []
    const waypointTimes = []
    for (let i = 0; i < iterations; i += 1) {
      let started = performance.now(); equalSpacing(); spacingTimes.push(performance.now() - started)
      started = performance.now(); waypointUndo(); waypointTimes.push(performance.now() - started)
    }
    versions[mode] = {
      scene: { entities: total, nodes: fixture.nodes.length, ports: fixture.ports.length, edges: fixture.edges.length },
      equalSpacingMs: { p50: percentile(spacingTimes, 0.5), p95: percentile(spacingTimes, 0.95) },
      waypointUndoMs: { p50: percentile(waypointTimes, 0.5), p95: percentile(waypointTimes, 0.95) },
      dependencyIndexRebuilds: mode === "legacy" ? legacyRebuilds(engine) - rebuildStart : engine.getDiagnostics().dependencyIndexRebuildCount - 1,
      diagnostics: engine.getDiagnostics(),
    }
  }
  return { entities: total, legacy: versions.legacy, current: versions.current }
}

function createFixture(total) {
  const nodeCount = Math.floor(total * 0.45)
  const portCount = Math.floor(total * 0.3)
  const edgeCount = Math.floor(total * 0.25)
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `n${index}`, kind: "node",
    x: index === 0 ? 0 : index % 2 ? -20 - Math.floor(index / 2) % 120 : 45 + Math.floor(index / 2) % 120,
    y: 0, width: 20, height: 20,
  }))
  const ports = Array.from({ length: portCount }, (_, index) => ({ id: `p${index}`, kind: "port", nodeId: `n${index % nodeCount}`, x: 10, y: 10 }))
  const edges = Array.from({ length: edgeCount }, (_, index) => ({
    id: `e${index}`, kind: "edge", source: { kind: "port", portId: `p${index % portCount}` },
    target: { kind: "port", portId: `p${(index + 1) % portCount}` }, points: [{ x: 30, y: 10 }],
  }))
  return { nodes, ports, edges }
}

function legacyEqualSpacing(sourceBounds, targetOrigin, radius, excludeIds, excludeAxes) {
  const moving = { ...sourceBounds, x: targetOrigin.x, y: targetOrigin.y }
  const reach = Math.max(128, radius * 16, sourceBounds.width * 8, sourceBounds.height * 8)
  const fixed = this.queryEntities({ bounds: { x: moving.x - reach, y: moving.y - reach, width: moving.width + reach * 2, height: moving.height + reach * 2 }, kinds: ["node", "shape", "text"] })
    .filter((id) => !excludeIds.has(id)).map((id) => this.getGeometry(id)?.bounds).filter(Boolean)
  let best = null
  for (let i = 0; i < fixed.length; i += 1) for (let j = i + 1; j < fixed.length; j += 1) {
    const a = fixed[i], b = fixed[j]
    for (const [before, after] of [[a, b], [b, a]]) {
      if (!excludeAxes.has("x") && before.x + before.width <= moving.x && moving.x + moving.width <= after.x && overlaps(before.y, before.y + before.height, moving.y, moving.y + moving.height) && overlaps(after.y, after.y + after.height, moving.y, moving.y + moving.height)) {
        const first = moving.x - before.x - before.width, second = after.x - moving.x - moving.width, delta = (second - first) / 2
        if (Math.abs(delta) <= radius && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { axis: "x", delta, before, after }
      }
      if (!excludeAxes.has("y") && before.y + before.height <= moving.y && moving.y + moving.height <= after.y && overlaps(before.x, before.x + before.width, moving.x, moving.x + moving.width) && overlaps(after.x, after.x + after.width, moving.x, moving.x + moving.width)) {
        const first = moving.y - before.y - before.height, second = after.y - moving.y - moving.height, delta = (second - first) / 2
        if (Math.abs(delta) <= radius && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { axis: "y", delta, before, after }
      }
    }
  }
  if (!best) return null
  if (best.axis === "x") {
    const center = moving.y + moving.height / 2
    return { dx: best.delta, dy: 0, guides: [
      { kind: "equal-spacing", axis: "x", start: { x: best.before.x + best.before.width, y: center }, end: { x: moving.x + best.delta, y: center } },
      { kind: "equal-spacing", axis: "x", start: { x: moving.x + moving.width + best.delta, y: center }, end: { x: best.after.x, y: center } },
    ] }
  }
  const center = moving.x + moving.width / 2
  return { dx: 0, dy: best.delta, guides: [
    { kind: "equal-spacing", axis: "y", start: { x: center, y: best.before.y + best.before.height }, end: { x: center, y: moving.y + best.delta } },
    { kind: "equal-spacing", axis: "y", start: { x: center, y: moving.y + moving.height + best.delta }, end: { x: center, y: best.after.y } },
  ] }
}

function installLegacyDependencyIndex(engine) {
  engine.legacyRebuilds = 0
  engine.ensureDependencyIndex = (changedIds) => {
    let rebuild = !engine.dependencyIndexReady
    for (const id of changedIds) if (engine.dependencyEntityIds.has(id) !== engine.hasEntity(id) || engine.state.entities.edgesById.has(id) || engine.state.entities.portsById.has(id)) { rebuild = true; break }
    if (!rebuild) return
    engine.legacyRebuilds += 1
    engine.dependencyEntityIds = new Set([...engine.state.entities.nodesById.keys(), ...engine.state.entities.edgesById.keys(), ...engine.state.entities.textsById.keys(), ...engine.state.entities.shapesById.keys(), ...engine.state.entities.portsById.keys()])
    engine.portIdsByNode = new Map(); engine.edgeIdsByNode = new Map(); engine.edgeIdsByPort = new Map()
    for (const port of engine.state.entities.portsById.values()) add(engine.portIdsByNode, port.nodeId, port.id)
    for (const edge of engine.state.entities.edgesById.values()) for (const endpoint of [edge.source, edge.target]) {
      if (endpoint.kind === "node") add(engine.edgeIdsByNode, endpoint.nodeId, edge.id)
      else if (endpoint.kind === "port") { add(engine.edgeIdsByPort, endpoint.portId, edge.id); const port = engine.state.entities.portsById.get(endpoint.portId); if (port) add(engine.edgeIdsByNode, port.nodeId, edge.id) }
    }
    engine.dependencyIndexReady = true
  }
}

function add(index, key, value) { if (!index.has(key)) index.set(key, new Set()); index.get(key).add(value) }
function legacyRebuilds(engine) { return engine.legacyRebuilds ?? 0 }
function overlaps(a0, a1, b0, b1) { return a0 <= b1 && a1 >= b0 }
function percentile(values, ratio) { const ordered = [...values].sort((a, b) => a - b); return Number(ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * ratio) - 1)].toFixed(4)) }
