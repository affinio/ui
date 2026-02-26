#!/usr/bin/env node

import { performance } from "node:perf_hooks"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const BENCH_SEED = Number.parseInt(process.env.BENCH_SEED ?? "1337", 10)
const BENCH_SEEDS = (process.env.BENCH_SEEDS ?? `${BENCH_SEED}`)
  .split(",")
  .map(value => Number.parseInt(value.trim(), 10))
  .filter(value => Number.isFinite(value) && value > 0)
const BENCH_WARMUP_RUNS = Number.parseInt(process.env.BENCH_WARMUP_RUNS ?? "1", 10)
const BENCH_MEASUREMENT_BATCH_SIZE = Number.parseInt(process.env.BENCH_DS_CHURN_MEASUREMENT_BATCH_SIZE ?? "5", 10)
const BENCH_WARMUP_BATCHES = Number.parseInt(process.env.BENCH_DS_CHURN_WARMUP_BATCHES ?? "1", 10)

const ROW_COUNT = Number.parseInt(process.env.BENCH_DS_CHURN_ROW_COUNT ?? "220000", 10)
const RANGE_SIZE = Number.parseInt(process.env.BENCH_DS_CHURN_RANGE_SIZE ?? "160", 10)
const SCROLL_BURST_ITERATIONS = Number.parseInt(process.env.BENCH_DS_CHURN_SCROLL_ITERATIONS ?? "240", 10)
const FILTER_BURST_ITERATIONS = Number.parseInt(process.env.BENCH_DS_CHURN_FILTER_ITERATIONS ?? "180", 10)
const ROW_CACHE_LIMIT = Number.parseInt(process.env.BENCH_DS_CHURN_ROW_CACHE_LIMIT ?? "4096", 10)

const PERF_BUDGET_TOTAL_MS = Number.parseFloat(process.env.PERF_BUDGET_TOTAL_MS ?? "Infinity")
const PERF_BUDGET_MAX_SCROLL_BURST_P95_MS = Number.parseFloat(
  process.env.PERF_BUDGET_MAX_SCROLL_BURST_P95_MS ?? "Infinity",
)
const PERF_BUDGET_MAX_SCROLL_BURST_P99_MS = Number.parseFloat(
  process.env.PERF_BUDGET_MAX_SCROLL_BURST_P99_MS ?? "Infinity",
)
const PERF_BUDGET_MAX_FILTER_BURST_P95_MS = Number.parseFloat(
  process.env.PERF_BUDGET_MAX_FILTER_BURST_P95_MS ?? "Infinity",
)
const PERF_BUDGET_MAX_FILTER_BURST_P99_MS = Number.parseFloat(
  process.env.PERF_BUDGET_MAX_FILTER_BURST_P99_MS ?? "Infinity",
)
const PERF_BUDGET_MIN_PULL_COALESCED = Number.parseFloat(process.env.PERF_BUDGET_MIN_PULL_COALESCED ?? "0")
const PERF_BUDGET_MIN_PULL_DEFERRED = Number.parseFloat(process.env.PERF_BUDGET_MIN_PULL_DEFERRED ?? "0")
const PERF_BUDGET_MAX_VARIANCE_PCT = Number.parseFloat(process.env.PERF_BUDGET_MAX_VARIANCE_PCT ?? "Infinity")
const PERF_BUDGET_VARIANCE_MIN_MEAN_MS = Number.parseFloat(process.env.PERF_BUDGET_VARIANCE_MIN_MEAN_MS ?? "0.5")
const PERF_BUDGET_MAX_HEAP_DELTA_MB = Number.parseFloat(process.env.PERF_BUDGET_MAX_HEAP_DELTA_MB ?? "Infinity")
const PERF_BUDGET_HEAP_EPSILON_MB = Number.parseFloat(process.env.PERF_BUDGET_HEAP_EPSILON_MB ?? "1")
const BENCH_OUTPUT_JSON = process.env.BENCH_OUTPUT_JSON ? resolve(process.env.BENCH_OUTPUT_JSON) : null

const OWNERS = ["NOC", "SRE", "Core", "Platform", "Payments", "Data"]
const REGIONS = ["us-east", "us-west", "eu-central", "ap-south"]

assertPositiveInteger(ROW_COUNT, "BENCH_DS_CHURN_ROW_COUNT")
assertPositiveInteger(RANGE_SIZE, "BENCH_DS_CHURN_RANGE_SIZE")
assertPositiveInteger(SCROLL_BURST_ITERATIONS, "BENCH_DS_CHURN_SCROLL_ITERATIONS")
assertPositiveInteger(FILTER_BURST_ITERATIONS, "BENCH_DS_CHURN_FILTER_ITERATIONS")
assertPositiveInteger(ROW_CACHE_LIMIT, "BENCH_DS_CHURN_ROW_CACHE_LIMIT")
assertPositiveInteger(BENCH_MEASUREMENT_BATCH_SIZE, "BENCH_DS_CHURN_MEASUREMENT_BATCH_SIZE")
assertNonNegativeInteger(BENCH_WARMUP_BATCHES, "BENCH_DS_CHURN_WARMUP_BATCHES")
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

function toAbortError() {
  const error = new Error("Aborted")
  error.name = "AbortError"
  return error
}

function hashFilterModel(filterModel) {
  if (!filterModel) {
    return 0
  }
  const source = JSON.stringify(filterModel)
  let hash = 0
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

const FILTER_MODEL_CACHE = new Map()

function buildFilterModel(owner, region) {
  const ownerKey = String(owner)
  const regionKey = String(region)
  const cacheKey = `${ownerKey}|${regionKey}`
  const cached = FILTER_MODEL_CACHE.get(cacheKey)
  if (cached) {
    return cached
  }

  const filterModel = {
    columnFilters: {
      owner: { kind: "valueSet", tokens: [`string:${ownerKey}`] },
      region: { kind: "valueSet", tokens: [`string:${regionKey}`] },
    },
    advancedFilters: {},
  }
  FILTER_MODEL_CACHE.set(cacheKey, filterModel)
  return filterModel
}

function normalizeRange(start, span) {
  const normalizedStart = Math.max(0, Math.min(ROW_COUNT - 1, Math.trunc(start)))
  const normalizedEnd = Math.max(normalizedStart, Math.min(ROW_COUNT - 1, normalizedStart + Math.max(1, span)))
  return { start: normalizedStart, end: normalizedEnd }
}

function createSyntheticDataSource(totalRows) {
  return {
    async pull(request) {
      await Promise.resolve()
      if (request.signal.aborted) {
        throw toAbortError()
      }

      const filterHash = hashFilterModel(request.filterModel)
      const stride = 1 + (filterHash % 5)
      const offset = filterHash % 97
      const visibleTotal = Math.max(0, Math.ceil(Math.max(0, totalRows - offset) / stride))
      const start = Math.max(0, request.range.start)
      const end = Math.max(start, request.range.end)
      const rows = []

      for (let visibleIndex = start; visibleIndex <= end; visibleIndex += 1) {
        const sourceIndex = offset + visibleIndex * stride
        if (sourceIndex >= totalRows) {
          break
        }
        const owner = OWNERS[sourceIndex % OWNERS.length] ?? "NOC"
        const region = REGIONS[sourceIndex % REGIONS.length] ?? "us-east"
        rows.push({
          index: visibleIndex,
          rowId: sourceIndex,
          row: {
            rowId: `incident-${sourceIndex}`,
            owner,
            region,
            status: sourceIndex % 3 === 0 ? "critical" : "ok",
            latency: 20 + (sourceIndex % 800),
          },
        })
      }

      return {
        rows,
        total: visibleTotal,
      }
    },
    subscribe() {
      return () => {}
    },
  }
}

async function loadFactory() {
  const candidates = [
    resolve("packages/datagrid-core/dist/src/models/dataSourceBackedRowModel.js"),
    resolve("packages/datagrid-core/dist/src/models/index.js"),
    resolve("packages/datagrid-core/dist/src/public.js"),
  ]
  let lastError = null
  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue
    }
    try {
      const module = await import(pathToFileURL(candidate).href)
      if (typeof module.createDataSourceBackedRowModel === "function") {
        return module.createDataSourceBackedRowModel
      }
    } catch (error) {
      lastError = error
    }
  }
  if (lastError) {
    throw new Error(`Failed to load createDataSourceBackedRowModel: ${String(lastError)}`)
  }
  throw new Error(
    "Unable to locate datagrid-core build artifacts. Run `pnpm --filter @affino/datagrid-core build`.",
  )
}

async function runScrollBurstScenario(createDataSourceBackedRowModel, seed) {
  const rng = createRng(seed)
  const dataSource = createSyntheticDataSource(ROW_COUNT)
  const model = createDataSourceBackedRowModel({
    dataSource,
    rowCacheLimit: ROW_CACHE_LIMIT,
    initialTotal: ROW_COUNT,
  })
  const durations = []
  const maxStart = Math.max(0, ROW_COUNT - RANGE_SIZE - 2)

  const runOne = async () => {
    const startA = randomInt(rng, 0, maxStart)
    const startB = Math.max(0, Math.min(maxStart, startA + randomInt(rng, -220, 220)))
    const startC = Math.max(0, Math.min(maxStart, startB + randomInt(rng, -220, 220)))
    const rangeA = normalizeRange(startA, RANGE_SIZE)
    const rangeB = normalizeRange(startB, RANGE_SIZE)
    const rangeC = normalizeRange(startC, RANGE_SIZE)

    model.setViewportRange(rangeA)
    const p1 = Promise.resolve(model.refresh("viewport-change"))
    // Force a lower-priority invalidation while critical pull is inflight.
    model.invalidateRange(rangeA)
    model.setViewportRange(rangeB)
    const p2 = Promise.resolve(model.refresh("viewport-change"))
    model.setViewportRange(rangeC)
    const p3 = Promise.resolve(model.refresh("viewport-change"))
    await Promise.allSettled([p1, p2, p3])
    model.getRowsInRange(rangeC)
  }

  try {
    for (let warmup = 0; warmup < BENCH_WARMUP_BATCHES; warmup += 1) {
      for (let batch = 0; batch < BENCH_MEASUREMENT_BATCH_SIZE; batch += 1) {
        await runOne()
      }
    }
    for (let iteration = 0; iteration < SCROLL_BURST_ITERATIONS; iteration += 1) {
      const t0 = performance.now()
      for (let batch = 0; batch < BENCH_MEASUREMENT_BATCH_SIZE; batch += 1) {
        await runOne()
      }
      durations.push((performance.now() - t0) / BENCH_MEASUREMENT_BATCH_SIZE)
    }
    const diagnostics = model.getBackpressureDiagnostics()
    return { stat: stats(durations), diagnostics }
  } finally {
    model.dispose()
  }
}

async function runFilterBurstScenario(createDataSourceBackedRowModel, seed) {
  const rng = createRng(seed + 7919)
  const dataSource = createSyntheticDataSource(ROW_COUNT)
  const model = createDataSourceBackedRowModel({
    dataSource,
    rowCacheLimit: ROW_CACHE_LIMIT,
    initialTotal: ROW_COUNT,
  })
  const durations = []
  const maxStart = Math.max(0, ROW_COUNT - RANGE_SIZE - 2)

  const runOne = async () => {
    const owner = OWNERS[randomInt(rng, 0, OWNERS.length - 1)] ?? "NOC"
    const region = REGIONS[randomInt(rng, 0, REGIONS.length - 1)] ?? "us-east"
    const rangeA = normalizeRange(randomInt(rng, 0, maxStart), RANGE_SIZE)
    const rangeB = normalizeRange(randomInt(rng, 0, maxStart), RANGE_SIZE)

    model.setFilterModel(buildFilterModel(owner, region))
    model.setViewportRange(rangeA)
    const p1 = Promise.resolve(model.refresh("filter-change"))
    // Exercise defer path: invalidation is normal priority and should be queued under critical pull.
    model.invalidateRange(rangeA)
    model.setViewportRange(rangeB)
    const p2 = Promise.resolve(model.refresh("viewport-change"))
    await Promise.allSettled([p1, p2])
    model.getRowsInRange(rangeB)
  }

  try {
    for (let warmup = 0; warmup < BENCH_WARMUP_BATCHES; warmup += 1) {
      for (let batch = 0; batch < BENCH_MEASUREMENT_BATCH_SIZE; batch += 1) {
        await runOne()
      }
    }
    for (let iteration = 0; iteration < FILTER_BURST_ITERATIONS; iteration += 1) {
      const t0 = performance.now()
      for (let batch = 0; batch < BENCH_MEASUREMENT_BATCH_SIZE; batch += 1) {
        await runOne()
      }
      durations.push((performance.now() - t0) / BENCH_MEASUREMENT_BATCH_SIZE)
    }
    const diagnostics = model.getBackpressureDiagnostics()
    return { stat: stats(durations), diagnostics }
  } finally {
    model.dispose()
  }
}

const createDataSourceBackedRowModel = await loadFactory()
const runResults = []
const budgetErrors = []
const varianceSkippedChecks = []

console.log("\nAffino DataGrid DataSource Churn Benchmark")
console.log(
  `seeds=${BENCH_SEEDS.join(",")} rows=${ROW_COUNT} rangeSize=${RANGE_SIZE} scrollIterations=${SCROLL_BURST_ITERATIONS} filterIterations=${FILTER_BURST_ITERATIONS} warmupRuns=${BENCH_WARMUP_RUNS} batchSize=${BENCH_MEASUREMENT_BATCH_SIZE}`,
)

for (const seed of BENCH_SEEDS) {
  for (let warmup = 0; warmup < BENCH_WARMUP_RUNS; warmup += 1) {
    const warmupSeed = seed + (warmup + 1) * 9901
    await runScrollBurstScenario(createDataSourceBackedRowModel, warmupSeed)
    await runFilterBurstScenario(createDataSourceBackedRowModel, warmupSeed)
  }

  const heapStart = process.memoryUsage().heapUsed
  const startedAt = performance.now()
  const scrollBurst = await runScrollBurstScenario(createDataSourceBackedRowModel, seed)
  const filterBurst = await runFilterBurstScenario(createDataSourceBackedRowModel, seed)
  const elapsed = performance.now() - startedAt
  const heapDeltaMb = (process.memoryUsage().heapUsed - heapStart) / (1024 * 1024)

  runResults.push({
    seed,
    elapsedMs: elapsed,
    heapDeltaMb,
    scenarios: { scrollBurst, filterBurst },
  })

  console.log(`\nSeed ${seed}`)
  console.table([
    {
      scenario: "scroll-burst",
      p50Ms: scrollBurst.stat.p50.toFixed(3),
      p95Ms: scrollBurst.stat.p95.toFixed(3),
      p99Ms: scrollBurst.stat.p99.toFixed(3),
      cvPct: scrollBurst.stat.cvPct.toFixed(2),
      coalesced: scrollBurst.diagnostics.pullCoalesced,
      deferred: scrollBurst.diagnostics.pullDeferred,
    },
    {
      scenario: "filter-burst",
      p50Ms: filterBurst.stat.p50.toFixed(3),
      p95Ms: filterBurst.stat.p95.toFixed(3),
      p99Ms: filterBurst.stat.p99.toFixed(3),
      cvPct: filterBurst.stat.cvPct.toFixed(2),
      coalesced: filterBurst.diagnostics.pullCoalesced,
      deferred: filterBurst.diagnostics.pullDeferred,
    },
  ])
  console.log(`Total elapsed: ${elapsed.toFixed(2)}ms`)
  console.log(`Heap delta: ${heapDeltaMb.toFixed(2)}MB`)

  if (elapsed > PERF_BUDGET_TOTAL_MS) {
    budgetErrors.push(
      `seed ${seed}: total elapsed ${elapsed.toFixed(2)}ms exceeds PERF_BUDGET_TOTAL_MS=${PERF_BUDGET_TOTAL_MS}ms`,
    )
  }
  if (heapDeltaMb > PERF_BUDGET_MAX_HEAP_DELTA_MB + PERF_BUDGET_HEAP_EPSILON_MB) {
    budgetErrors.push(
      `seed ${seed}: heap delta ${heapDeltaMb.toFixed(2)}MB exceeds PERF_BUDGET_MAX_HEAP_DELTA_MB=${PERF_BUDGET_MAX_HEAP_DELTA_MB}MB (epsilon ${PERF_BUDGET_HEAP_EPSILON_MB.toFixed(2)}MB)`,
    )
  }
  if (scrollBurst.stat.p95 > PERF_BUDGET_MAX_SCROLL_BURST_P95_MS) {
    budgetErrors.push(
      `seed ${seed}: scroll-burst p95 ${scrollBurst.stat.p95.toFixed(3)}ms exceeds PERF_BUDGET_MAX_SCROLL_BURST_P95_MS=${PERF_BUDGET_MAX_SCROLL_BURST_P95_MS}ms`,
    )
  }
  if (scrollBurst.stat.p99 > PERF_BUDGET_MAX_SCROLL_BURST_P99_MS) {
    budgetErrors.push(
      `seed ${seed}: scroll-burst p99 ${scrollBurst.stat.p99.toFixed(3)}ms exceeds PERF_BUDGET_MAX_SCROLL_BURST_P99_MS=${PERF_BUDGET_MAX_SCROLL_BURST_P99_MS}ms`,
    )
  }
  if (filterBurst.stat.p95 > PERF_BUDGET_MAX_FILTER_BURST_P95_MS) {
    budgetErrors.push(
      `seed ${seed}: filter-burst p95 ${filterBurst.stat.p95.toFixed(3)}ms exceeds PERF_BUDGET_MAX_FILTER_BURST_P95_MS=${PERF_BUDGET_MAX_FILTER_BURST_P95_MS}ms`,
    )
  }
  if (filterBurst.stat.p99 > PERF_BUDGET_MAX_FILTER_BURST_P99_MS) {
    budgetErrors.push(
      `seed ${seed}: filter-burst p99 ${filterBurst.stat.p99.toFixed(3)}ms exceeds PERF_BUDGET_MAX_FILTER_BURST_P99_MS=${PERF_BUDGET_MAX_FILTER_BURST_P99_MS}ms`,
    )
  }
}

const aggregateElapsed = stats(runResults.map(run => run.elapsedMs))
const aggregateHeap = stats(runResults.map(run => run.heapDeltaMb))
const aggregateScrollP95 = stats(runResults.map(run => run.scenarios.scrollBurst.stat.p95))
const aggregateScrollP99 = stats(runResults.map(run => run.scenarios.scrollBurst.stat.p99))
const aggregateFilterP95 = stats(runResults.map(run => run.scenarios.filterBurst.stat.p95))
const aggregateFilterP99 = stats(runResults.map(run => run.scenarios.filterBurst.stat.p99))
const aggregateCoalesced = stats(
  runResults.map(
    run => run.scenarios.scrollBurst.diagnostics.pullCoalesced + run.scenarios.filterBurst.diagnostics.pullCoalesced,
  ),
)
const aggregateDeferred = stats(
  runResults.map(
    run => run.scenarios.scrollBurst.diagnostics.pullDeferred + run.scenarios.filterBurst.diagnostics.pullDeferred,
  ),
)

for (const aggregate of [
  { name: "elapsed", stat: aggregateElapsed },
  { name: "scroll-burst p95", stat: aggregateScrollP95 },
  { name: "scroll-burst p99", stat: aggregateScrollP99 },
  { name: "filter-burst p95", stat: aggregateFilterP95 },
  { name: "filter-burst p99", stat: aggregateFilterP99 },
]) {
  if (shouldEnforceVariance(aggregate.stat)) {
    if (aggregate.stat.cvPct > PERF_BUDGET_MAX_VARIANCE_PCT) {
      budgetErrors.push(
        `${aggregate.name} CV ${aggregate.stat.cvPct.toFixed(2)}% exceeds PERF_BUDGET_MAX_VARIANCE_PCT=${PERF_BUDGET_MAX_VARIANCE_PCT}%`,
      )
    }
  } else if (PERF_BUDGET_MAX_VARIANCE_PCT !== Number.POSITIVE_INFINITY) {
    varianceSkippedChecks.push(
      `${aggregate.name} CV gate skipped (mean ${aggregate.stat.mean.toFixed(3)}ms < PERF_BUDGET_VARIANCE_MIN_MEAN_MS=${PERF_BUDGET_VARIANCE_MIN_MEAN_MS}ms)`,
    )
  }
}

if (aggregateCoalesced.mean < PERF_BUDGET_MIN_PULL_COALESCED) {
  budgetErrors.push(
    `aggregate pullCoalesced mean ${aggregateCoalesced.mean.toFixed(2)} is below PERF_BUDGET_MIN_PULL_COALESCED=${PERF_BUDGET_MIN_PULL_COALESCED}`,
  )
}
if (aggregateDeferred.mean < PERF_BUDGET_MIN_PULL_DEFERRED) {
  budgetErrors.push(
    `aggregate pullDeferred mean ${aggregateDeferred.mean.toFixed(2)} is below PERF_BUDGET_MIN_PULL_DEFERRED=${PERF_BUDGET_MIN_PULL_DEFERRED}`,
  )
}

const summary = {
  benchmark: "datagrid-datasource-churn",
  generatedAt: new Date().toISOString(),
  config: {
    seeds: BENCH_SEEDS,
    rowCount: ROW_COUNT,
    rangeSize: RANGE_SIZE,
    rowCacheLimit: ROW_CACHE_LIMIT,
    scrollBurstIterations: SCROLL_BURST_ITERATIONS,
    filterBurstIterations: FILTER_BURST_ITERATIONS,
    warmupRuns: BENCH_WARMUP_RUNS,
    warmupBatchesPerScenario: BENCH_WARMUP_BATCHES,
    measurementBatchSize: BENCH_MEASUREMENT_BATCH_SIZE,
  },
  budgets: {
    totalMs: PERF_BUDGET_TOTAL_MS,
    maxScrollBurstP95Ms: PERF_BUDGET_MAX_SCROLL_BURST_P95_MS,
    maxScrollBurstP99Ms: PERF_BUDGET_MAX_SCROLL_BURST_P99_MS,
    maxFilterBurstP95Ms: PERF_BUDGET_MAX_FILTER_BURST_P95_MS,
    maxFilterBurstP99Ms: PERF_BUDGET_MAX_FILTER_BURST_P99_MS,
    minPullCoalesced: PERF_BUDGET_MIN_PULL_COALESCED,
    minPullDeferred: PERF_BUDGET_MIN_PULL_DEFERRED,
    maxVariancePct: PERF_BUDGET_MAX_VARIANCE_PCT,
    varianceMinMeanMs: PERF_BUDGET_VARIANCE_MIN_MEAN_MS,
    maxHeapDeltaMb: PERF_BUDGET_MAX_HEAP_DELTA_MB,
    heapEpsilonMb: PERF_BUDGET_HEAP_EPSILON_MB,
  },
  varianceSkippedChecks,
  aggregate: {
    elapsedMs: aggregateElapsed,
    heapDeltaMb: aggregateHeap,
    scrollBurstP95Ms: aggregateScrollP95,
    scrollBurstP99Ms: aggregateScrollP99,
    filterBurstP95Ms: aggregateFilterP95,
    filterBurstP99Ms: aggregateFilterP99,
    pullCoalesced: aggregateCoalesced,
    pullDeferred: aggregateDeferred,
  },
  runs: runResults,
  budgetErrors,
  ok: budgetErrors.length === 0,
}

if (BENCH_OUTPUT_JSON) {
  mkdirSync(dirname(BENCH_OUTPUT_JSON), { recursive: true })
  writeFileSync(BENCH_OUTPUT_JSON, JSON.stringify(summary, null, 2))
  console.log(`Benchmark summary written: ${BENCH_OUTPUT_JSON}`)
}

if (budgetErrors.length > 0) {
  console.error("\nDataSource churn benchmark budget check failed:")
  for (const error of budgetErrors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}
