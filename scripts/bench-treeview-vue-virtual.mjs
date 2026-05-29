#!/usr/bin/env node

import { performance } from "node:perf_hooks"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { JSDOM } from "jsdom"

const NODE_COUNT = parseIntegerEnv("BENCH_TREEVIEW_NODE_COUNT", 10000)
const SCROLL_STEPS = parseIntegerEnv("BENCH_TREEVIEW_SCROLL_STEPS", 240)
const SAMPLE_COUNT = parseIntegerEnv("BENCH_TREEVIEW_SAMPLE_COUNT", 5)
const ROW_HEIGHT = parseIntegerEnv("BENCH_TREEVIEW_ROW_HEIGHT", 24)
const VIEWPORT_HEIGHT = parseIntegerEnv("BENCH_TREEVIEW_VIEWPORT_HEIGHT", 360)
const OVERSCAN = parseIntegerEnv("BENCH_TREEVIEW_OVERSCAN", 4)
const OUTPUT_JSON = process.env.BENCH_OUTPUT_JSON ? resolve(process.env.BENCH_OUTPUT_JSON) : null

const PERF_BUDGET_TOTAL_MS = parseBudgetEnv("PERF_BUDGET_TOTAL_MS")
const PERF_BUDGET_MAX_SCROLL_P95_MS = parseBudgetEnv("PERF_BUDGET_MAX_SCROLL_P95_MS")
const PERF_BUDGET_MAX_BLANK_VIEWPORTS = parseBudgetEnv("PERF_BUDGET_MAX_BLANK_VIEWPORTS")
const PERF_BUDGET_MAX_HEAP_DELTA_MB = parseBudgetEnv("PERF_BUDGET_MAX_HEAP_DELTA_MB")

assertPositiveInteger(NODE_COUNT, "BENCH_TREEVIEW_NODE_COUNT")
assertPositiveInteger(SCROLL_STEPS, "BENCH_TREEVIEW_SCROLL_STEPS")
assertPositiveInteger(SAMPLE_COUNT, "BENCH_TREEVIEW_SAMPLE_COUNT")
assertPositiveInteger(ROW_HEIGHT, "BENCH_TREEVIEW_ROW_HEIGHT")
assertPositiveInteger(VIEWPORT_HEIGHT, "BENCH_TREEVIEW_VIEWPORT_HEIGHT")
if (!Number.isFinite(OVERSCAN) || OVERSCAN < 0) {
  throw new Error("BENCH_TREEVIEW_OVERSCAN must be a non-negative integer")
}

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true })
installDomGlobals(dom.window)

const distEntry = prepareRuntimeDist()

const { createApp, defineComponent, h, nextTick } = await import("vue")
const { useVirtualTreeviewController } = await import(pathToFileURL(distEntry).href)
if (typeof useVirtualTreeviewController !== "function") {
  throw new Error("packages/treeview-vue/dist/index.js does not export useVirtualTreeviewController. Rebuild @affino/treeview-vue before running this benchmark.")
}

const nodes = createWideNodes(NODE_COUNT)
const scrollOffsets = createScrollOffsets(NODE_COUNT, ROW_HEIGHT, VIEWPORT_HEIGHT, SCROLL_STEPS)
const heapBefore = sampleHeapUsed()
const startedAt = performance.now()
const samples = []
let blankViewportCount = 0
let maxRenderedRows = 0
let minRenderedRows = Number.POSITIVE_INFINITY
let totalHeight = 0
let visibleCount = 0
let checksum = 0

for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
  const result = await runScrollSample(sample)
  samples.push(result.elapsedMs)
  blankViewportCount += result.blankViewportCount
  maxRenderedRows = Math.max(maxRenderedRows, result.maxRenderedRows)
  minRenderedRows = Math.min(minRenderedRows, result.minRenderedRows)
  totalHeight = result.totalHeight
  visibleCount = result.visibleCount
  checksum += result.checksum
}

const elapsedMs = performance.now() - startedAt
const heapAfter = sampleHeapUsed()
const heapDeltaMb = (heapAfter - heapBefore) / 1024 / 1024
const scrollRunStats = stats(samples)
const scrollStepEstimateStats = stats(samples.map((sample) => sample / SCROLL_STEPS))
const report = {
  name: "treeview-vue-virtual",
  config: {
    nodeCount: NODE_COUNT,
    scrollSteps: SCROLL_STEPS,
    sampleCount: SAMPLE_COUNT,
    rowHeight: ROW_HEIGHT,
    viewportHeight: VIEWPORT_HEIGHT,
    overscan: OVERSCAN,
  },
  elapsedMs,
  heapDeltaMb,
  visibleCount,
  totalHeight,
  maxRenderedRows,
  minRenderedRows: Number.isFinite(minRenderedRows) ? minRenderedRows : 0,
  blankViewportCount,
  checksum,
  samples,
  scrollRunMs: scrollRunStats,
  scrollStepEstimateMs: scrollStepEstimateStats,
}

if (OUTPUT_JSON) {
  mkdirSync(dirname(OUTPUT_JSON), { recursive: true })
  writeFileSync(OUTPUT_JSON, `${JSON.stringify(report, null, 2)}\n`)
}

const failures = []
if (elapsedMs > PERF_BUDGET_TOTAL_MS) {
  failures.push(`total ${elapsedMs.toFixed(2)}ms > budget ${PERF_BUDGET_TOTAL_MS}ms`)
}
if (scrollRunStats.p95 > PERF_BUDGET_MAX_SCROLL_P95_MS) {
  failures.push(`scroll run p95 ${scrollRunStats.p95.toFixed(2)}ms > budget ${PERF_BUDGET_MAX_SCROLL_P95_MS}ms`)
}
if (blankViewportCount > PERF_BUDGET_MAX_BLANK_VIEWPORTS) {
  failures.push(`blank viewport count ${blankViewportCount} > budget ${PERF_BUDGET_MAX_BLANK_VIEWPORTS}`)
}
if (heapDeltaMb > PERF_BUDGET_MAX_HEAP_DELTA_MB) {
  failures.push(`heap delta ${heapDeltaMb.toFixed(2)}MB > budget ${PERF_BUDGET_MAX_HEAP_DELTA_MB}MB`)
}

console.log(`[treeview-vue-virtual] ${NODE_COUNT} nodes, ${SCROLL_STEPS} scroll steps per sample, ${SAMPLE_COUNT} samples`)
console.log(`  scroll run p50=${scrollRunStats.p50.toFixed(2)}ms p95=${scrollRunStats.p95.toFixed(2)}ms p99=${scrollRunStats.p99.toFixed(2)}ms max=${scrollRunStats.max.toFixed(2)}ms`)
console.log(`  scroll step estimate p50=${scrollStepEstimateStats.p50.toFixed(3)}ms p95=${scrollStepEstimateStats.p95.toFixed(3)}ms p99=${scrollStepEstimateStats.p99.toFixed(3)}ms max=${scrollStepEstimateStats.max.toFixed(3)}ms`)
console.log(`  rows min=${report.minRenderedRows} max=${maxRenderedRows} blanks=${blankViewportCount} heapDelta=${heapDeltaMb.toFixed(2)}MB`)
if (OUTPUT_JSON) {
  console.log(`  wrote ${OUTPUT_JSON}`)
}

if (failures.length) {
  for (const failure of failures) {
    console.error(`  budget failed: ${failure}`)
  }
  process.exitCode = 1
}

async function runScrollSample(sampleIndex) {
  let controller
  const host = document.createElement("div")
  document.body.appendChild(host)
  const app = createApp(
    defineComponent({
      setup() {
        controller = useVirtualTreeviewController({
          nodes,
          defaultExpanded: ["node-0"],
          rowHeight: ROW_HEIGHT,
          viewportHeight: VIEWPORT_HEIGHT,
          overscan: OVERSCAN,
        })
        return () => h(
          "div",
          {
            "data-testid": "viewport",
            style: {
              height: `${controller.viewportHeight.value}px`,
              overflow: "auto",
              position: "relative",
            },
          },
          [
            h("div", {
              "data-testid": "spacer",
              style: {
                height: `${controller.totalHeight.value}px`,
                position: "relative",
              },
            }, controller.visibleRows.value.map((row) => h("div", {
              key: row.value,
              "data-testid": "row",
              "data-value": row.value,
              style: {
                position: "absolute",
                top: `${row.top}px`,
                height: `${row.height}px`,
              },
            }, row.value))),
          ],
        )
      },
    }),
  )

  const sampleStartedAt = performance.now()
  app.mount(host)
  flushAnimationFrames()
  await nextTick()

  let localBlankViewportCount = 0
  let localMaxRenderedRows = 0
  let localMinRenderedRows = Number.POSITIVE_INFINITY
  let localChecksum = sampleIndex

  for (const offset of scrollOffsets) {
    controller.setScrollTop(offset)
    flushAnimationFrames()
    await nextTick()
    const rows = host.querySelectorAll('[data-testid="row"]')
    if (controller.totalHeight.value > 0 && controller.viewportHeight.value > 0 && rows.length === 0) {
      localBlankViewportCount += 1
    }
    localMaxRenderedRows = Math.max(localMaxRenderedRows, rows.length)
    localMinRenderedRows = Math.min(localMinRenderedRows, rows.length)
    localChecksum += rows.length
    const firstRow = rows.item(0)
    if (firstRow) {
      localChecksum += Number.parseInt(firstRow.getAttribute("data-value")?.slice(5) ?? "0", 10)
    }
  }

  const elapsed = performance.now() - sampleStartedAt
  const result = {
    elapsedMs: elapsed,
    blankViewportCount: localBlankViewportCount,
    maxRenderedRows: localMaxRenderedRows,
    minRenderedRows: Number.isFinite(localMinRenderedRows) ? localMinRenderedRows : 0,
    totalHeight: controller.totalHeight.value,
    visibleCount: controller.getVisibleCount(),
    checksum: localChecksum,
  }

  app.unmount()
  host.remove()
  return result
}


function prepareRuntimeDist() {
  const vueDistDir = resolve("packages/treeview-vue/dist")
  const coreEntry = resolve("packages/treeview-core/dist/TreeviewCore.js")
  const sourceFiles = ["index.js", "useTreeviewController.js", "useVirtualTreeviewController.js"]
  for (const file of sourceFiles) {
    const source = resolve(vueDistDir, file)
    if (!existsSync(source)) {
      throw new Error(`packages/treeview-vue/dist/${file} is missing. Build @affino/treeview-vue before running this benchmark.`)
    }
  }
  if (!existsSync(coreEntry)) {
    throw new Error("packages/treeview-core/dist/TreeviewCore.js is missing. Build @affino/treeview-core before running this benchmark.")
  }

  const runtimeDir = resolve(".tmp/treeview-vue-virtual-bench-dist")
  rmSync(runtimeDir, { recursive: true, force: true })
  mkdirSync(runtimeDir, { recursive: true })
  writeFileSync(resolve(runtimeDir, "package.json"), '{"type":"module"}\n')
  const coreEntryUrl = pathToFileURL(coreEntry).href
  for (const file of sourceFiles) {
    const source = resolve(vueDistDir, file)
    const target = resolve(runtimeDir, file)
    const code = readFileSync(source, "utf8")
      .replaceAll('from "./useTreeviewController"', 'from "./useTreeviewController.js"')
      .replaceAll('from "./useVirtualTreeviewController"', 'from "./useVirtualTreeviewController.js"')
      .replaceAll('from "@affino/treeview-core"', `from "${coreEntryUrl}"`)
    writeFileSync(target, code)
  }
  return resolve(runtimeDir, "index.js")
}

function installDomGlobals(window) {
  globalThis.window = window
  globalThis.document = window.document
  Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true })
  globalThis.Node = window.Node
  globalThis.Element = window.Element
  globalThis.HTMLElement = window.HTMLElement
  globalThis.SVGElement = window.SVGElement
  const frameCallbacks = new Map()
  let frameId = 0
  globalThis.requestAnimationFrame = (callback) => {
    frameId += 1
    frameCallbacks.set(frameId, callback)
    return frameId
  }
  globalThis.cancelAnimationFrame = (id) => {
    frameCallbacks.delete(id)
  }
  globalThis.__flushTreeviewVirtualFrames = () => {
    const pending = Array.from(frameCallbacks.entries())
    frameCallbacks.clear()
    for (const [id, callback] of pending) {
      callback(id)
    }
  }
}

function flushAnimationFrames() {
  globalThis.__flushTreeviewVirtualFrames()
}

function createWideNodes(count) {
  const nodes = [{ value: "node-0", parent: null }]
  for (let index = 1; index < count; index += 1) {
    nodes.push({ value: `node-${index}`, parent: "node-0" })
  }
  return nodes
}

function createScrollOffsets(count, rowHeight, viewportHeight, steps) {
  const maxScrollTop = Math.max(0, count * rowHeight - viewportHeight)
  if (steps === 1) {
    return [0]
  }
  return Array.from({ length: steps }, (_entry, index) => Math.round((index / (steps - 1)) * maxScrollTop))
}

function sampleHeapUsed() {
  const maybeGc = globalThis.gc
  if (typeof maybeGc === "function") {
    maybeGc()
    maybeGc()
  }
  return process.memoryUsage().heapUsed
}

function stats(values) {
  return {
    p50: quantile(values, 0.5),
    p95: quantile(values, 0.95),
    p99: quantile(values, 0.99),
    max: values.length ? Math.max(...values) : 0,
  }
}

function quantile(values, q) {
  if (!values.length) {
    return 0
  }
  const sorted = [...values].sort((a, b) => a - b)
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  if (sorted[base + 1] === undefined) {
    return sorted[base]
  }
  return sorted[base] + rest * (sorted[base + 1] - sorted[base])
}

function parseIntegerEnv(name, fallback) {
  return Number.parseInt(process.env[name] ?? String(fallback), 10)
}

function parseBudgetEnv(name) {
  return Number.parseFloat(process.env[name] ?? "Infinity")
}

function assertPositiveInteger(value, label) {
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
    throw new Error(`${label} must be a positive integer`)
  }
}
