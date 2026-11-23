#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'

const root = resolve(new URL('..', import.meta.url).pathname)
const { createDiagramEngine } = await import(resolve(root, 'packages/diagram-core/dist/index.js'))
const counts = (process.env.BENCH_DIAGRAM_ENTITY_COUNTS ?? '1000,5000,10000').split(',').map(Number).filter(Number.isFinite)
const samples = Number(process.env.BENCH_DIAGRAM_SAMPLES ?? 40)
const report = { generatedAt: new Date().toISOString(), sampleCount: samples, workloads: counts.map(run) }
const output = resolve(root, process.env.BENCH_OUTPUT_JSON ?? 'artifacts/performance/diagram-core-interactions.json')
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))

function run(count) {
  const fixture = createFixture(count)
  const engine = createDiagramEngine(fixture)
  engine.queryVisible({ x: 0, y: 0, width: 1200, height: 800 })
  const workloads = {}
  const runSamples = (name, action) => {
    const values = []
    for (let index = 0; index < samples; index += 1) {
      const started = performance.now(); action(index); values.push(performance.now() - started)
    }
    workloads[name] = { p50Ms: percentile(values, 0.50), p95Ms: percentile(values, 0.95) }
  }
  runSamples('dragNodeWithDependentEdges', () => { engine.dispatch({ type: 'moveNode', id: 'node-0', delta: { x: 1, y: 1 } }); engine.dispatch({ type: 'undo' }) })
  runSamples('waypointEditUndo', () => { engine.dispatch({ type: 'insertEdgeWaypoint', id: 'edge-0', index: 0, point: { x: 400, y: 300 } }); engine.dispatch({ type: 'undo' }) })
  runSamples('panZoom', (i) => { engine.dispatch({ type: 'setViewport', viewport: { x: i % 2, zoom: i % 2 ? 1.01 : 1 } }); engine.queryVisible({ x: 0, y: 0, width: 1200, height: 800 }) })
  runSamples('selection', (i) => engine.dispatch({ type: 'setSelection', selection: { ids: [`node-${i % 2}`], primaryId: `node-${i % 2}` } }))
  runSamples('alignment', (i) => engine.snapTranslation({ ids: ['node-0'], primaryId: 'node-0' }, { x: 18 + i % 3, y: 20 }, { radius: 6 }))
  runSamples('equalSpacing', (i) => engine.snapTranslation({ ids: ['node-0'], primaryId: 'node-0' }, { x: 200 + i % 3, y: 0 }, { radius: 6, snapToEqualSpacing: true }))
  return { entityCount: count, nodeCount: fixture.nodes.length, edgeCount: fixture.edges.length, portCount: fixture.ports.length, workloads, diagnostics: engine.getDiagnostics() }
}
function createFixture(count) {
  const nodeCount = Math.max(3, Math.floor(count * 0.45)), edgeCount = Math.floor(count * 0.25), portCount = Math.max(nodeCount, count - Math.floor(count * 0.4))
  const nodes = Array.from({ length: nodeCount }, (_, i) => ({ id: `node-${i}`, kind: 'node', x: i % 100 * 140, y: Math.floor(i / 100) * 100, width: 96, height: 56 }))
  const ports = Array.from({ length: portCount }, (_, i) => ({ id: `port-${i}`, kind: 'port', nodeId: `node-${i % nodeCount}`, x: 96, y: 28 }))
  const edges = Array.from({ length: edgeCount }, (_, i) => ({ id: `edge-${i}`, kind: 'edge', source: { kind: 'port', portId: `port-${i % portCount}` }, target: { kind: 'port', portId: `port-${(i + 1) % portCount}` } }))
  const texts = Array.from({ length: Math.floor(count * 0.15) }, (_, i) => ({ id: `text-${i}`, kind: 'text', x: i % 100 * 140, y: Math.floor(i / 100) * 100 + 64, text: `Label ${i}` }))
  const shapes = Array.from({ length: Math.floor(count * 0.05) }, (_, i) => ({ id: `shape-${i}`, kind: 'shape', shape: 'rect', x: i % 100 * 140 + 20, y: Math.floor(i / 100) * 100 + 20, width: 48, height: 32 }))
  return { nodes, edges, ports, texts, shapes }
}
function percentile(values, fraction) { const sorted = [...values].sort((a, b) => a - b); return Number(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)].toFixed(4)) }
