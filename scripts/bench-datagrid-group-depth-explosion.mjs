#!/usr/bin/env node

import { performance } from "node:perf_hooks"
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const BENCH_SEED = Number.parseInt(process.env.BENCH_SEED ?? "1337", 10)
const BENCH_SEEDS = (process.env.BENCH_SEEDS ?? `${BENCH_SEED}`)
  .split(",")
  .map(value => Number.parseInt(value.trim(), 10))
  .filter(value => Number.isFinite(value) && value > 0)

const BENCH_ROW_COUNT = Number.parseInt(process.env.BENCH_GROUP_DEPTH_ROW_COUNT ?? "20000", 10)
const BENCH_DEPTH = Number.parseInt(process.env.BENCH_GROUP_DEPTH_LEVELS ?? "5", 10)
const BENCH_CARDINALITY = Number.parseInt(process.env.BENCH_GROUP_DEPTH_CARDINALITY ?? "12", 10)
const BENCH_EXPAND_COLLAPSE_ITERATIONS = Number.parseInt(process.env.BENCH_GROUP_DEPTH_EXPAND_COLLAPSE_ITERATIONS ?? "120", 10)
const BENCH_REBUILD_ITERATIONS = Number.parseInt(process.env.BENCH_GROUP_DEPTH_REBUILD_ITERATIONS ?? "30", 10)
const BENCH_VIEWPORT_SIZE = Number.parseInt(process.env.BENCH_GROUP_DEPTH_VIEWPORT_SIZE ?? "200", 10)
const BENCH_WARMUP_RUNS = Number.parseInt(process.env.BENCH_WARMUP_RUNS ?? "1", 10)
const BENCH_OUTPUT_JSON = process.env.BENCH_OUTPUT_JSON
  ? resolve(process.env.BENCH_OUTPUT_JSON)
  : resolve("artifacts/performance/bench-datagrid-group-depth-explosion.json")

const PERF_BUDGET_TOTAL_MS = Number.parseFloat(process.env.PERF_BUDGET_TOTAL_MS ?? "Infinity")
const PERF_BUDGET_MAX_REBUILD_P95_MS = Number.parseFloat(process.env.PERF_BUDGET_MAX_REBUILD_P95_MS ?? "Infinity")
const PERF_BUDGET_MAX_EXPAND_P95_MS = Number.parseFloat(process.env.PERF_BUDGET_MAX_EXPAND_P95_MS ?? "Infinity")
const PERF_BUDGET_MAX_COLLAPSE_P95_MS = Number.parseFloat(process.env.PERF_BUDGET_MAX_COLLAPSE_P95_MS ?? "Infinity")
const PERF_BUDGET_MIN_MAX_VISIBLE_DEPTH = Number.parseInt(process.env.PERF_BUDGET_MIN_MAX_VISIBLE_DEPTH ?? "0", 10)
const PERF_BUDGET_MAX_VARIANCE_PCT = Number.parseFloat(process.env.PERF_BUDGET_MAX_VARIANCE_PCT ?? "Infinity")
const PERF_BUDGET_VARIANCE_MIN_MEAN_MS = Number.parseFloat(process.env.PERF_BUDGET_VARIANCE_MIN_MEAN_MS ?? "0.5")
const PERF_BUDGET_MAX_HEAP_DELTA_MB = Number.parseFloat(process.env.PERF_BUDGET_MAX_HEAP_DELTA_MB ?? "Infinity")
const PERF_BUDGET_HEAP_EPSILON_MB = Number.parseFloat(process.env.PERF_BUDGET_HEAP_EPSILON_MB ?? "1")

assertPositiveInteger(BENCH_ROW_COUNT, "BENCH_GROUP_DEPTH_ROW_COUNT")
assertPositiveInteger(BENCH_DEPTH, "BENCH_GROUP_DEPTH_LEVELS")
assertPositiveInteger(BENCH_CARDINALITY, "BENCH_GROUP_DEPTH_CARDINALITY")
assertPositiveInteger(BENCH_EXPAND_COLLAPSE_ITERATIONS, "BENCH_GROUP_DEPTH_EXPAND_COLLAPSE_ITERATIONS")
assertPositiveInteger(BENCH_REBUILD_ITERATIONS, "BENCH_GROUP_DEPTH_REBUILD_ITERATIONS")
assertPositiveInteger(BENCH_VIEWPORT_SIZE, "BENCH_GROUP_DEPTH_VIEWPORT_SIZE")
assertNonNegativeInteger(BENCH_WARMUP_RUNS, "BENCH_WARMUP_RUNS")
if (!BENCH_SEEDS.length) {
  throw new Error("BENCH_SEEDS must include at least one positive integer")
}

function assertPositiveInteger(value, label) {
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
    throw new Error(`${label} must be a positive integer`)
  }
}

function assertNonNegativeInteger(value, label) {
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new Error(`${label} must be a non-negative integer`)
  }
}

function quantile(values, q) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  if (sorted[base + 1] === undefined) {
    return sorted[base]
  }
  return sorted[base] + rest * (sorted[base + 1] - sorted[base])
}

function stats(values) {
  if (!values.length) {
    return { mean: 0, stdev: 0, p50: 0, p95: 0, p99: 0, cvPct: 0, min: 0, max: 0 }
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  const stdev = Math.sqrt(variance)
  return {
    mean,
    stdev,
    p50: quantile(values, 0.5),
    p95: quantile(values, 0.95),
    p99: quantile(values, 0.99),
    cvPct: mean === 0 ? 0 : (stdev / mean) * 100,
    min: Math.min(...values),
    max: Math.max(...values),
  }
}

function shouldEnforceVariance(stat) {
  return (
    PERF_BUDGET_MAX_VARIANCE_PCT !== Number.POSITIVE_INFINITY &&
    stat.mean >= PERF_BUDGET_VARIANCE_MIN_MEAN_MS
  )
}

function createRng(seed) {
  let state = seed % 2147483647
  if (state <= 0) state += 2147483646
  return () => {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
}

function sleepTick() {
  return new Promise(resolveTick => setTimeout(resolveTick, 0))
}

async function sampleHeapUsed() {
  const maybeGc = globalThis.gc
  let minHeap = Number.POSITIVE_INFINITY
  for (let iteration = 0; iteration < 3; iteration += 1) {
    if (typeof maybeGc === "function") {
      maybeGc()
    }
    await sleepTick()
    const used = process.memoryUsage().heapUsed
    if (used < minHeap) {
      minHeap = used
    }
  }
  return Number.isFinite(minHeap) ? minHeap : process.memoryUsage().heapUsed
}

function toMb(bytes) {
  return bytes / (1024 * 1024)
}

function createRows(count, depth, cardinality, seed) {
  const rng = createRng(seed)
  const rows = new Array(count)
  for (let index = 0; index < count; index += 1) {
    const row = {
      id: index,
      value: Math.floor(rng() * 100_000),
    }
    for (let level = 1; level <= depth; level += 1) {
      row[`g${level}`] = `L${level}-${(index + level * 7) % cardinality}`
    }
    rows[index] = row
  }
  return rows
}

async function loadFactory() {
  const candidates = [
    resolve("packages/datagrid-core/dist/src/models/index.js"),
    resolve("packages/datagrid-core/dist/src/public.js"),
  ]
  const sourceCandidates = [
    resolve("packages/datagrid-core/src/models/clientRowModel.ts"),
    resolve("packages/datagrid-core/src/public.ts"),
  ]
  const buildMarkerCandidates = [
    resolve("packages/datagrid-core/tsconfig.public.tsbuildinfo"),
    resolve("packages/datagrid-core/tsconfig.tsbuildinfo"),
    resolve("packages/datagrid-core/dist/tsconfig.public.tsbuildinfo"),
    resolve("packages/datagrid-core/dist/tsconfig.tsbuildinfo"),
  ]
  const sourceTimestamps = sourceCandidates
    .filter(candidate => existsSync(candidate))
    .map(candidate => statSync(candidate).mtimeMs)
  const newestSourceTimestamp = sourceTimestamps.length > 0 ? Math.max(...sourceTimestamps) : 0
  const buildMarkerTimestamps = buildMarkerCandidates
    .filter(candidate => existsSync(candidate))
    .map(candidate => statSync(candidate).mtimeMs)
  const newestBuildMarkerTimestamp = buildMarkerTimestamps.length > 0
    ? Math.max(...buildMarkerTimestamps)
    : 0
  const allowStaleDist = process.env.BENCH_ALLOW_STALE_DIST === "1"
  const enforceFreshDist = process.env.BENCH_ENFORCE_FRESH_DIST === "1"

  let lastError = null
  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue
    }
    if (!allowStaleDist) {
      const distTimestamp = statSync(candidate).mtimeMs
      const freshnessTimestamp = Math.max(distTimestamp, newestBuildMarkerTimestamp)
      if (newestSourceTimestamp > freshnessTimestamp) {
        const message = `Datagrid dist artifact appears stale (${candidate}). Run \`pnpm --filter @affino/datagrid-core build\` before benchmarks.`
        if (enforceFreshDist) {
          throw new Error(message)
        }
        console.warn(`[bench] ${message} Continuing because BENCH_ENFORCE_FRESH_DIST is not set.`)
      }
    }
    try {
      const module = await import(pathToFileURL(candidate).href)
      if (typeof module.createClientRowModel === "function") {
        return module.createClientRowModel
      }
    } catch (error) {
      lastError = error
    }
  }
  if (lastError) {
    throw new Error(`Failed to load datagrid core factory: ${String(lastError)}`)
  }
  throw new Error("Unable to locate datagrid-core build artifacts. Run `pnpm --filter @affino/datagrid-core build`.")
}

function readVisibleMaxDepth(model, viewportSize) {
  const rows = model.getRowsInRange({
    start: 0,
    end: Math.min(Math.max(0, model.getRowCount() - 1), Math.max(0, viewportSize - 1)),
  })
  let maxDepth = 0
  for (const row of rows) {
    const level = row.groupMeta?.level
    if (Number.isFinite(level) && level > maxDepth) {
      maxDepth = level
    }
  }
  return maxDepth
}

async function runGroupDepthScenario(createClientRowModel, seed) {
  const rows = createRows(BENCH_ROW_COUNT, BENCH_DEPTH, BENCH_CARDINALITY, seed)
  const model = createClientRowModel({ rows, resolveRowId: row => row.id })
  const groupFields = Array.from({ length: BENCH_DEPTH }, (_, index) => `g${index + 1}`)

  const rebuildDurations = []
  const expandDurations = []
  const collapseDurations = []

  const heapBefore = await sampleHeapUsed()
  const scenarioStartedAt = performance.now()

  for (let iteration = 0; iteration < BENCH_REBUILD_ITERATIONS; iteration += 1) {
    const start = performance.now()
    const activeDepth = Math.max(1, BENCH_DEPTH - (iteration % Math.min(3, BENCH_DEPTH)))
    model.setGroupBy({
      fields: groupFields.slice(0, activeDepth),
      expandedByDefault: false,
    })
    model.setAggregationModel({ columns: [{ key: "value", field: "value", op: "sum" }] })
    model.getRowsInRange({ start: 0, end: Math.min(Math.max(0, model.getRowCount() - 1), BENCH_VIEWPORT_SIZE - 1) })
    rebuildDurations.push(performance.now() - start)
  }

  model.setGroupBy({ fields: groupFields, expandedByDefault: false })
  model.setAggregationModel({ columns: [{ key: "value", field: "value", op: "sum" }] })

  for (let iteration = 0; iteration < BENCH_EXPAND_COLLAPSE_ITERATIONS; iteration += 1) {
    const expandStart = performance.now()
    model.setGroupExpansion({ expandedByDefault: true, toggledGroupKeys: [] })
    model.getRowsInRange({ start: 0, end: Math.min(Math.max(0, model.getRowCount() - 1), BENCH_VIEWPORT_SIZE - 1) })
    expandDurations.push(performance.now() - expandStart)

    const collapseStart = performance.now()
    model.setGroupExpansion({ expandedByDefault: false, toggledGroupKeys: [] })
    model.getRowsInRange({ start: 0, end: Math.min(Math.max(0, model.getRowCount() - 1), BENCH_VIEWPORT_SIZE - 1) })
    collapseDurations.push(performance.now() - collapseStart)
  }

  model.setGroupExpansion({ expandedByDefault: true, toggledGroupKeys: [] })
  const maxVisibleDepth = readVisibleMaxDepth(model, BENCH_VIEWPORT_SIZE)

  const elapsedMs = performance.now() - scenarioStartedAt
  const heapAfter = await sampleHeapUsed()

  const result = {
    elapsedMs,
    rebuildMs: stats(rebuildDurations),
    expandMs: stats(expandDurations),
    collapseMs: stats(collapseDurations),
    rowCount: model.getRowCount(),
    maxVisibleDepth,
    heapDeltaMb: toMb(heapAfter - heapBefore),
  }

  model.dispose()
  return result
}

const createClientRowModel = await loadFactory()
const runResults = []
const budgetErrors = []
const varianceSkippedChecks = []

console.log("\nAffino DataGrid Group Depth Explosion Benchmark")
console.log(
  `seeds=${BENCH_SEEDS.join(",")} rows=${BENCH_ROW_COUNT} depth=${BENCH_DEPTH} cardinality=${BENCH_CARDINALITY} expandCollapseIterations=${BENCH_EXPAND_COLLAPSE_ITERATIONS}`,
)

for (const seed of BENCH_SEEDS) {
  console.log(`\n[group-depth] seed ${seed}: warmup...`)
  for (let warmup = 0; warmup < BENCH_WARMUP_RUNS; warmup += 1) {
    await runGroupDepthScenario(createClientRowModel, seed + warmup)
  }

  console.log(`[group-depth] seed ${seed}: measure...`)
  const scenario = await runGroupDepthScenario(createClientRowModel, seed)
  runResults.push({ seed, scenario })

  if (scenario.elapsedMs > PERF_BUDGET_TOTAL_MS) {
    budgetErrors.push(
      `seed ${seed}: elapsed ${scenario.elapsedMs.toFixed(3)}ms exceeds PERF_BUDGET_TOTAL_MS=${PERF_BUDGET_TOTAL_MS}ms`,
    )
  }
  if (scenario.rebuildMs.p95 > PERF_BUDGET_MAX_REBUILD_P95_MS) {
    budgetErrors.push(
      `seed ${seed}: rebuild p95 ${scenario.rebuildMs.p95.toFixed(3)}ms exceeds PERF_BUDGET_MAX_REBUILD_P95_MS=${PERF_BUDGET_MAX_REBUILD_P95_MS}ms`,
    )
  }
  if (scenario.expandMs.p95 > PERF_BUDGET_MAX_EXPAND_P95_MS) {
    budgetErrors.push(
      `seed ${seed}: expand p95 ${scenario.expandMs.p95.toFixed(3)}ms exceeds PERF_BUDGET_MAX_EXPAND_P95_MS=${PERF_BUDGET_MAX_EXPAND_P95_MS}ms`,
    )
  }
  if (scenario.collapseMs.p95 > PERF_BUDGET_MAX_COLLAPSE_P95_MS) {
    budgetErrors.push(
      `seed ${seed}: collapse p95 ${scenario.collapseMs.p95.toFixed(3)}ms exceeds PERF_BUDGET_MAX_COLLAPSE_P95_MS=${PERF_BUDGET_MAX_COLLAPSE_P95_MS}ms`,
    )
  }
  if (scenario.maxVisibleDepth < PERF_BUDGET_MIN_MAX_VISIBLE_DEPTH) {
    budgetErrors.push(
      `seed ${seed}: max visible depth ${scenario.maxVisibleDepth} below PERF_BUDGET_MIN_MAX_VISIBLE_DEPTH=${PERF_BUDGET_MIN_MAX_VISIBLE_DEPTH}`,
    )
  }
  if (scenario.heapDeltaMb > PERF_BUDGET_HEAP_EPSILON_MB && scenario.heapDeltaMb > PERF_BUDGET_MAX_HEAP_DELTA_MB) {
    budgetErrors.push(
      `seed ${seed}: heap delta ${scenario.heapDeltaMb.toFixed(2)}MB exceeds PERF_BUDGET_MAX_HEAP_DELTA_MB=${PERF_BUDGET_MAX_HEAP_DELTA_MB}MB`,
    )
  }
}

const aggregateElapsed = stats(runResults.map(run => run.scenario.elapsedMs))
const aggregateRebuild = stats(runResults.map(run => run.scenario.rebuildMs.p95))
const aggregateExpand = stats(runResults.map(run => run.scenario.expandMs.p95))
const aggregateCollapse = stats(runResults.map(run => run.scenario.collapseMs.p95))
const aggregateHeap = stats(runResults.map(run => run.scenario.heapDeltaMb))

for (const aggregate of [
  { name: "elapsed", stat: aggregateElapsed },
  { name: "rebuild p95", stat: aggregateRebuild },
  { name: "expand p95", stat: aggregateExpand },
  { name: "collapse p95", stat: aggregateCollapse },
]) {
  if (PERF_BUDGET_MAX_VARIANCE_PCT === Number.POSITIVE_INFINITY) {
    continue
  }
  if (!shouldEnforceVariance(aggregate.stat)) {
    varianceSkippedChecks.push(
      `${aggregate.name} CV gate skipped (mean ${aggregate.stat.mean.toFixed(3)} < PERF_BUDGET_VARIANCE_MIN_MEAN_MS=${PERF_BUDGET_VARIANCE_MIN_MEAN_MS})`,
    )
    continue
  }
  if (aggregate.stat.cvPct > PERF_BUDGET_MAX_VARIANCE_PCT) {
    budgetErrors.push(
      `${aggregate.name} CV ${aggregate.stat.cvPct.toFixed(2)}% exceeds PERF_BUDGET_MAX_VARIANCE_PCT=${PERF_BUDGET_MAX_VARIANCE_PCT}%`,
    )
  }
}

const summary = {
  benchmark: "datagrid-group-depth-explosion",
  generatedAt: new Date().toISOString(),
  config: {
    seeds: BENCH_SEEDS,
    rowCount: BENCH_ROW_COUNT,
    depth: BENCH_DEPTH,
    cardinality: BENCH_CARDINALITY,
    expandCollapseIterations: BENCH_EXPAND_COLLAPSE_ITERATIONS,
    rebuildIterations: BENCH_REBUILD_ITERATIONS,
    viewportSize: BENCH_VIEWPORT_SIZE,
    warmupRuns: BENCH_WARMUP_RUNS,
  },
  budgets: {
    totalMs: PERF_BUDGET_TOTAL_MS,
    maxRebuildP95Ms: PERF_BUDGET_MAX_REBUILD_P95_MS,
    maxExpandP95Ms: PERF_BUDGET_MAX_EXPAND_P95_MS,
    maxCollapseP95Ms: PERF_BUDGET_MAX_COLLAPSE_P95_MS,
    minMaxVisibleDepth: PERF_BUDGET_MIN_MAX_VISIBLE_DEPTH,
    maxVariancePct: PERF_BUDGET_MAX_VARIANCE_PCT,
    maxHeapDeltaMb: PERF_BUDGET_MAX_HEAP_DELTA_MB,
  },
  variancePolicy: {
    minMeanMsForCvGate: PERF_BUDGET_VARIANCE_MIN_MEAN_MS,
  },
  varianceSkippedChecks,
  aggregate: {
    elapsedMs: aggregateElapsed,
    rebuildP95Ms: aggregateRebuild,
    expandP95Ms: aggregateExpand,
    collapseP95Ms: aggregateCollapse,
    heapDeltaMb: aggregateHeap,
  },
  runs: runResults,
  budgetErrors,
  ok: budgetErrors.length === 0,
}

mkdirSync(dirname(BENCH_OUTPUT_JSON), { recursive: true })
writeFileSync(BENCH_OUTPUT_JSON, JSON.stringify(summary, null, 2))

console.log(`\nBenchmark summary written: ${BENCH_OUTPUT_JSON}`)
console.log(`rebuild p95=${aggregateRebuild.p95.toFixed(3)}ms expand p95=${aggregateExpand.p95.toFixed(3)}ms collapse p95=${aggregateCollapse.p95.toFixed(3)}ms`)

if (budgetErrors.length > 0) {
  console.error("\nGroup depth benchmark budget check failed:")
  for (const error of budgetErrors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}
