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

const BENCH_ROW_COUNT = Number.parseInt(process.env.BENCH_SOAK_ROW_COUNT ?? "100000", 10)
const BENCH_ITERATIONS = Number.parseInt(process.env.BENCH_SOAK_ITERATIONS ?? "5000", 10)
const BENCH_PATCH_ROWS_PER_ITERATION = Number.parseInt(process.env.BENCH_SOAK_PATCH_ROWS_PER_ITERATION ?? "3", 10)
const BENCH_VIEWPORT_SIZE = Number.parseInt(process.env.BENCH_SOAK_VIEWPORT_SIZE ?? "160", 10)
const BENCH_HEAP_SAMPLE_EVERY = Number.parseInt(process.env.BENCH_SOAK_HEAP_SAMPLE_EVERY ?? "50", 10)
const BENCH_WARMUP_RUNS = Number.parseInt(process.env.BENCH_WARMUP_RUNS ?? "1", 10)
const BENCH_OUTPUT_JSON = process.env.BENCH_OUTPUT_JSON
  ? resolve(process.env.BENCH_OUTPUT_JSON)
  : resolve("artifacts/performance/bench-datagrid-soak-session.json")

const PERF_BUDGET_TOTAL_MS = Number.parseFloat(process.env.PERF_BUDGET_TOTAL_MS ?? "Infinity")
const PERF_BUDGET_MAX_HEAP_DELTA_MB = Number.parseFloat(process.env.PERF_BUDGET_MAX_HEAP_DELTA_MB ?? "Infinity")
const PERF_BUDGET_MAX_HEAP_GROWTH_PER_1K_OPS_MB = Number.parseFloat(
  process.env.PERF_BUDGET_MAX_HEAP_GROWTH_PER_1K_OPS_MB ?? "Infinity",
)
const PERF_BUDGET_MAX_OPERATION_P95_MS = Number.parseFloat(process.env.PERF_BUDGET_MAX_OPERATION_P95_MS ?? "Infinity")
const PERF_BUDGET_MAX_VARIANCE_PCT = Number.parseFloat(process.env.PERF_BUDGET_MAX_VARIANCE_PCT ?? "Infinity")
const PERF_BUDGET_VARIANCE_MIN_MEAN_MS = Number.parseFloat(process.env.PERF_BUDGET_VARIANCE_MIN_MEAN_MS ?? "0.5")
const PERF_BUDGET_HEAP_EPSILON_MB = Number.parseFloat(process.env.PERF_BUDGET_HEAP_EPSILON_MB ?? "1")

assertPositiveInteger(BENCH_ROW_COUNT, "BENCH_SOAK_ROW_COUNT")
assertPositiveInteger(BENCH_ITERATIONS, "BENCH_SOAK_ITERATIONS")
assertPositiveInteger(BENCH_PATCH_ROWS_PER_ITERATION, "BENCH_SOAK_PATCH_ROWS_PER_ITERATION")
assertPositiveInteger(BENCH_VIEWPORT_SIZE, "BENCH_SOAK_VIEWPORT_SIZE")
assertPositiveInteger(BENCH_HEAP_SAMPLE_EVERY, "BENCH_SOAK_HEAP_SAMPLE_EVERY")
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

function shouldEnforceVariance(stat) {
  return (
    PERF_BUDGET_MAX_VARIANCE_PCT !== Number.POSITIVE_INFINITY &&
    stat.mean >= PERF_BUDGET_VARIANCE_MIN_MEAN_MS
  )
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

function createRng(seed) {
  let state = seed % 2147483647
  if (state <= 0) state += 2147483646
  return () => {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
}

function randomInt(rng, min, max) {
  const span = Math.max(1, max - min + 1)
  return min + Math.floor(rng() * span)
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

const REGIONS = ["AMER", "EMEA", "APAC", "LATAM"]
const TEAMS = ["core", "growth", "payments", "platform", "ops", "infra", "data", "support"]
const YEARS = [2022, 2023, 2024, 2025, 2026]
const QUARTERS = ["Q1", "Q2", "Q3", "Q4"]

function createRows(count, seed) {
  const rng = createRng(seed)
  const rows = new Array(count)
  for (let index = 0; index < count; index += 1) {
    rows[index] = {
      id: index,
      region: REGIONS[index % REGIONS.length] ?? "AMER",
      team: TEAMS[index % TEAMS.length] ?? "core",
      year: YEARS[index % YEARS.length] ?? 2024,
      quarter: QUARTERS[index % QUARTERS.length] ?? "Q1",
      filterBand: String(index % 100),
      revenue: Math.floor(rng() * 100_000) + 100,
      orders: (index % 25) + 1,
      latency: Math.floor(rng() * 1200),
      score: Math.floor(rng() * 10_000),
      note: `seed-${seed}-row-${index}`,
    }
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

function createPatchUpdates(rng, rowCount, patchSize) {
  const updates = []
  for (let index = 0; index < patchSize; index += 1) {
    const rowId = randomInt(rng, 0, Math.max(0, rowCount - 1))
    updates.push({
      rowId,
      data: {
        revenue: randomInt(rng, 100, 250_000),
        latency: randomInt(rng, 50, 1800),
        score: randomInt(rng, 0, 20_000),
        note: `patch-${rowId}-${randomInt(rng, 1, 99999)}`,
      },
    })
  }
  return updates
}

function buildSortModel(iteration) {
  const direction = iteration % 2 === 0 ? "asc" : "desc"
  return [
    { key: "revenue", direction },
    { key: "orders", direction },
    { key: "latency", direction },
  ]
}

function buildFilterModel(iteration) {
  const step = iteration % 4
  if (step === 0) {
    return null
  }
  if (step === 1) {
    return {
      columnFilters: { filterBand: { kind: "valueSet", tokens: Array.from({ length: 30 }, (_, index) => String(index)) } },
      advancedFilters: {},
    }
  }
  if (step === 2) {
    return {
      columnFilters: { filterBand: { kind: "valueSet", tokens: ["0"] } },
      advancedFilters: {},
    }
  }
  return {
    columnFilters: { filterBand: { kind: "valueSet", tokens: ["999"] } },
    advancedFilters: {},
  }
}

function buildGroupBy(iteration) {
  if (iteration % 3 === 0) {
    return null
  }
  return {
    fields: iteration % 2 === 0 ? ["region"] : ["region", "team"],
    expandedByDefault: iteration % 4 !== 0,
  }
}

function buildPivot(iteration) {
  if (iteration % 3 === 0) {
    return null
  }
  return {
    rows: ["region", "team"],
    columns: [iteration % 2 === 0 ? "year" : "quarter"],
    values: [{ field: "revenue", agg: "sum" }],
  }
}

async function maybeRefresh(model, reason = "reapply") {
  const result = model.refresh?.(reason)
  if (result && typeof result.then === "function") {
    await result
  }
}

async function runSoakScenario(createClientRowModel, seed) {
  const rng = createRng(seed)
  const rows = createRows(BENCH_ROW_COUNT, seed)
  const model = createClientRowModel({ rows, resolveRowId: row => row.id })

  if (typeof model.patchRows !== "function") {
    model.dispose()
    throw new Error("Soak scenario requires ClientRowModel.patchRows support.")
  }

  const opDurations = []
  const opCounters = {
    patch: 0,
    sort: 0,
    filter: 0,
    group: 0,
    pivot: 0,
    refresh: 0,
  }

  const heapSamples = []
  const heapBefore = await sampleHeapUsed()
  heapSamples.push({ iteration: 0, heapMb: toMb(heapBefore) })

  const startedAt = performance.now()
  for (let iteration = 0; iteration < BENCH_ITERATIONS; iteration += 1) {
    const opRoll = rng()
    const opStart = performance.now()

    if (opRoll < 0.58) {
      const updates = createPatchUpdates(rng, BENCH_ROW_COUNT, BENCH_PATCH_ROWS_PER_ITERATION)
      model.patchRows(updates, {
        recomputeSort: false,
        recomputeFilter: false,
        recomputeGroup: false,
        emit: false,
      })
      opCounters.patch += 1
    } else if (opRoll < 0.72) {
      model.setSortModel(buildSortModel(iteration))
      opCounters.sort += 1
    } else if (opRoll < 0.84) {
      model.setFilterModel(buildFilterModel(iteration))
      opCounters.filter += 1
    } else if (opRoll < 0.92) {
      model.setGroupBy(buildGroupBy(iteration))
      opCounters.group += 1
    } else if (opRoll < 0.97) {
      model.setPivotModel(buildPivot(iteration))
      opCounters.pivot += 1
    } else {
      await maybeRefresh(model, "reapply")
      opCounters.refresh += 1
    }

    model.getRowsInRange({ start: 0, end: Math.min(BENCH_VIEWPORT_SIZE - 1, Math.max(0, model.getRowCount() - 1)) })
    opDurations.push(performance.now() - opStart)

    if ((iteration + 1) % BENCH_HEAP_SAMPLE_EVERY === 0 || iteration === BENCH_ITERATIONS - 1) {
      const heapUsed = await sampleHeapUsed()
      heapSamples.push({
        iteration: iteration + 1,
        heapMb: toMb(heapUsed),
      })
    }
  }

  const elapsedMs = performance.now() - startedAt
  const heapAfter = await sampleHeapUsed()
  const heapDeltaMb = toMb(heapAfter - heapBefore)

  const firstSample = heapSamples[0]?.heapMb ?? 0
  const lastSample = heapSamples[heapSamples.length - 1]?.heapMb ?? firstSample
  const heapGrowthPer1kOpsMb = BENCH_ITERATIONS > 0
    ? ((lastSample - firstSample) / BENCH_ITERATIONS) * 1000
    : 0
  const peakHeapMb = heapSamples.reduce((max, sample) => Math.max(max, sample.heapMb), Number.NEGATIVE_INFINITY)

  const result = {
    elapsedMs,
    operations: {
      iterations: BENCH_ITERATIONS,
      counters: opCounters,
      latencyMs: stats(opDurations),
    },
    heap: {
      beforeMb: toMb(heapBefore),
      afterMb: toMb(heapAfter),
      deltaMb: heapDeltaMb,
      peakMb: Number.isFinite(peakHeapMb) ? peakHeapMb : toMb(heapAfter),
      growthPer1kOpsMb: heapGrowthPer1kOpsMb,
      samples: heapSamples,
    },
  }

  model.dispose()
  return result
}

const createClientRowModel = await loadFactory()
const runResults = []
const budgetErrors = []
const varianceSkippedChecks = []

console.log("\nAffino DataGrid Soak Session Benchmark")
console.log(
  `seeds=${BENCH_SEEDS.join(",")} rows=${BENCH_ROW_COUNT} iterations=${BENCH_ITERATIONS} patchRows=${BENCH_PATCH_ROWS_PER_ITERATION}`,
)

for (const seed of BENCH_SEEDS) {
  console.log(`\n[soak] seed ${seed}: warmup...`)
  for (let warmup = 0; warmup < BENCH_WARMUP_RUNS; warmup += 1) {
    await runSoakScenario(createClientRowModel, seed + warmup)
  }

  console.log(`[soak] seed ${seed}: measure...`)
  const scenario = await runSoakScenario(createClientRowModel, seed)
  runResults.push({ seed, scenario })

  if (scenario.elapsedMs > PERF_BUDGET_TOTAL_MS) {
    budgetErrors.push(
      `seed ${seed}: elapsed ${scenario.elapsedMs.toFixed(3)}ms exceeds PERF_BUDGET_TOTAL_MS=${PERF_BUDGET_TOTAL_MS}ms`,
    )
  }
  if (scenario.heap.deltaMb > PERF_BUDGET_HEAP_EPSILON_MB && scenario.heap.deltaMb > PERF_BUDGET_MAX_HEAP_DELTA_MB) {
    budgetErrors.push(
      `seed ${seed}: heap delta ${scenario.heap.deltaMb.toFixed(2)}MB exceeds PERF_BUDGET_MAX_HEAP_DELTA_MB=${PERF_BUDGET_MAX_HEAP_DELTA_MB}MB`,
    )
  }
  if (scenario.heap.growthPer1kOpsMb > PERF_BUDGET_MAX_HEAP_GROWTH_PER_1K_OPS_MB) {
    budgetErrors.push(
      `seed ${seed}: heap growth per 1k ops ${scenario.heap.growthPer1kOpsMb.toFixed(2)}MB exceeds PERF_BUDGET_MAX_HEAP_GROWTH_PER_1K_OPS_MB=${PERF_BUDGET_MAX_HEAP_GROWTH_PER_1K_OPS_MB}MB`,
    )
  }
  if (scenario.operations.latencyMs.p95 > PERF_BUDGET_MAX_OPERATION_P95_MS) {
    budgetErrors.push(
      `seed ${seed}: operation p95 ${scenario.operations.latencyMs.p95.toFixed(3)}ms exceeds PERF_BUDGET_MAX_OPERATION_P95_MS=${PERF_BUDGET_MAX_OPERATION_P95_MS}ms`,
    )
  }
}

const aggregateElapsed = stats(runResults.map(run => run.scenario.elapsedMs))
const aggregateOperationP95 = stats(runResults.map(run => run.scenario.operations.latencyMs.p95))
const aggregateHeapDelta = stats(runResults.map(run => run.scenario.heap.deltaMb))
const aggregateHeapGrowthPer1k = stats(runResults.map(run => run.scenario.heap.growthPer1kOpsMb))

for (const aggregate of [
  { name: "elapsed", stat: aggregateElapsed },
  { name: "operation p95", stat: aggregateOperationP95 },
  { name: "heap delta", stat: aggregateHeapDelta },
  { name: "heap growth/1k ops", stat: aggregateHeapGrowthPer1k },
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
  benchmark: "datagrid-soak-session",
  generatedAt: new Date().toISOString(),
  config: {
    seeds: BENCH_SEEDS,
    rowCount: BENCH_ROW_COUNT,
    iterations: BENCH_ITERATIONS,
    patchRowsPerIteration: BENCH_PATCH_ROWS_PER_ITERATION,
    viewportSize: BENCH_VIEWPORT_SIZE,
    heapSampleEvery: BENCH_HEAP_SAMPLE_EVERY,
    warmupRuns: BENCH_WARMUP_RUNS,
  },
  budgets: {
    totalMs: PERF_BUDGET_TOTAL_MS,
    maxHeapDeltaMb: PERF_BUDGET_MAX_HEAP_DELTA_MB,
    maxHeapGrowthPer1kOpsMb: PERF_BUDGET_MAX_HEAP_GROWTH_PER_1K_OPS_MB,
    maxOperationP95Ms: PERF_BUDGET_MAX_OPERATION_P95_MS,
    maxVariancePct: PERF_BUDGET_MAX_VARIANCE_PCT,
  },
  variancePolicy: {
    minMeanMsForCvGate: PERF_BUDGET_VARIANCE_MIN_MEAN_MS,
  },
  varianceSkippedChecks,
  aggregate: {
    elapsedMs: aggregateElapsed,
    operationP95Ms: aggregateOperationP95,
    heapDeltaMb: aggregateHeapDelta,
    heapGrowthPer1kOpsMb: aggregateHeapGrowthPer1k,
  },
  runs: runResults,
  budgetErrors,
  ok: budgetErrors.length === 0,
}

mkdirSync(dirname(BENCH_OUTPUT_JSON), { recursive: true })
writeFileSync(BENCH_OUTPUT_JSON, JSON.stringify(summary, null, 2))

console.log(`\nBenchmark summary written: ${BENCH_OUTPUT_JSON}`)
console.log(`elapsed p50=${aggregateElapsed.p50.toFixed(2)}ms p95=${aggregateElapsed.p95.toFixed(2)}ms`)
console.log(`operation p95 p50=${aggregateOperationP95.p50.toFixed(3)}ms p95=${aggregateOperationP95.p95.toFixed(3)}ms`)
console.log(`heap delta p50=${aggregateHeapDelta.p50.toFixed(2)}MB p95=${aggregateHeapDelta.p95.toFixed(2)}MB`)

if (budgetErrors.length > 0) {
  console.error("\nSoak benchmark budget check failed:")
  for (const error of budgetErrors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}
