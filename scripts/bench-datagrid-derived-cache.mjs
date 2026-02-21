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
const BENCH_MEASUREMENT_BATCH_SIZE = Number.parseInt(process.env.BENCH_DERIVED_CACHE_MEASUREMENT_BATCH_SIZE ?? "4", 10)
const BENCH_WARMUP_BATCHES = Number.parseInt(process.env.BENCH_DERIVED_CACHE_WARMUP_BATCHES ?? "1", 10)

const ROW_COUNT = Number.parseInt(process.env.BENCH_DERIVED_CACHE_ROW_COUNT ?? "60000", 10)
const RANGE_SIZE = Number.parseInt(process.env.BENCH_DERIVED_CACHE_RANGE_SIZE ?? "140", 10)
const STABLE_ITERATIONS = Number.parseInt(process.env.BENCH_DERIVED_CACHE_STABLE_ITERATIONS ?? "240", 10)
const INVALIDATED_ITERATIONS = Number.parseInt(process.env.BENCH_DERIVED_CACHE_INVALIDATED_ITERATIONS ?? "120", 10)
const STABLE_REFRESH_EVERY = Number.parseInt(process.env.BENCH_DERIVED_CACHE_STABLE_REFRESH_EVERY ?? "24", 10)

const PERF_BUDGET_TOTAL_MS = Number.parseFloat(process.env.PERF_BUDGET_TOTAL_MS ?? "Infinity")
const PERF_BUDGET_MAX_STABLE_P95_MS = Number.parseFloat(process.env.PERF_BUDGET_MAX_STABLE_P95_MS ?? "Infinity")
const PERF_BUDGET_MAX_INVALIDATED_P95_MS = Number.parseFloat(
  process.env.PERF_BUDGET_MAX_INVALIDATED_P95_MS ?? "Infinity",
)
const PERF_BUDGET_MIN_STABLE_FILTER_HIT_RATE_PCT = Number.parseFloat(
  process.env.PERF_BUDGET_MIN_STABLE_FILTER_HIT_RATE_PCT ?? "0",
)
const PERF_BUDGET_MIN_STABLE_SORT_HIT_RATE_PCT = Number.parseFloat(
  process.env.PERF_BUDGET_MIN_STABLE_SORT_HIT_RATE_PCT ?? "0",
)
const PERF_BUDGET_MIN_STABLE_GROUP_HIT_RATE_PCT = Number.parseFloat(
  process.env.PERF_BUDGET_MIN_STABLE_GROUP_HIT_RATE_PCT ?? "0",
)
const PERF_BUDGET_MIN_INVALIDATED_FILTER_MISSES = Number.parseFloat(
  process.env.PERF_BUDGET_MIN_INVALIDATED_FILTER_MISSES ?? "0",
)
const PERF_BUDGET_MAX_VARIANCE_PCT = Number.parseFloat(process.env.PERF_BUDGET_MAX_VARIANCE_PCT ?? "Infinity")
const PERF_BUDGET_VARIANCE_MIN_MEAN_MS = Number.parseFloat(process.env.PERF_BUDGET_VARIANCE_MIN_MEAN_MS ?? "0.5")
const PERF_BUDGET_MAX_HEAP_DELTA_MB = Number.parseFloat(process.env.PERF_BUDGET_MAX_HEAP_DELTA_MB ?? "Infinity")
const PERF_BUDGET_HEAP_EPSILON_MB = Number.parseFloat(process.env.PERF_BUDGET_HEAP_EPSILON_MB ?? "1")
const BENCH_OUTPUT_JSON = process.env.BENCH_OUTPUT_JSON ? resolve(process.env.BENCH_OUTPUT_JSON) : null

const OWNERS = ["NOC", "SRE", "Core", "Platform", "Payments", "Data"]
const REGIONS = ["us-east", "us-west", "eu-central", "ap-south"]
const STATUSES = ["critical", "warning", "ok"]

assertPositiveInteger(ROW_COUNT, "BENCH_DERIVED_CACHE_ROW_COUNT")
assertPositiveInteger(RANGE_SIZE, "BENCH_DERIVED_CACHE_RANGE_SIZE")
assertPositiveInteger(STABLE_ITERATIONS, "BENCH_DERIVED_CACHE_STABLE_ITERATIONS")
assertPositiveInteger(INVALIDATED_ITERATIONS, "BENCH_DERIVED_CACHE_INVALIDATED_ITERATIONS")
assertPositiveInteger(STABLE_REFRESH_EVERY, "BENCH_DERIVED_CACHE_STABLE_REFRESH_EVERY")
assertPositiveInteger(BENCH_MEASUREMENT_BATCH_SIZE, "BENCH_DERIVED_CACHE_MEASUREMENT_BATCH_SIZE")
assertNonNegativeInteger(BENCH_WARMUP_BATCHES, "BENCH_DERIVED_CACHE_WARMUP_BATCHES")
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

function sleepTick() {
  return new Promise(resolveTick => {
    setTimeout(resolveTick, 0)
  })
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

function ratioPct(hits, misses) {
  const total = hits + misses
  if (total <= 0) {
    return 0
  }
  return (hits / total) * 100
}

function diffDiagnostics(before, after) {
  return {
    filterPredicateHits: Math.max(0, after.filterPredicateHits - before.filterPredicateHits),
    filterPredicateMisses: Math.max(0, after.filterPredicateMisses - before.filterPredicateMisses),
    sortValueHits: Math.max(0, after.sortValueHits - before.sortValueHits),
    sortValueMisses: Math.max(0, after.sortValueMisses - before.sortValueMisses),
    groupValueHits: Math.max(0, after.groupValueHits - before.groupValueHits),
    groupValueMisses: Math.max(0, after.groupValueMisses - before.groupValueMisses),
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

function createRows(count) {
  const rows = new Array(count)
  for (let index = 0; index < count; index += 1) {
    rows[index] = {
      rowId: index,
      owner: OWNERS[index % OWNERS.length] ?? "NOC",
      region: REGIONS[index % REGIONS.length] ?? "us-east",
      status: STATUSES[index % STATUSES.length] ?? "ok",
      latency: (index * 17) % 1000,
      retries: index % 7,
    }
  }
  return rows
}

function createFilter(owner, region) {
  return {
    columnFilters: {
      owner: [owner],
      region: [region],
    },
    advancedFilters: {},
  }
}

async function loadFactory() {
  const candidates = [
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
      if (typeof module.createClientRowModel === "function") {
        return module.createClientRowModel
      }
    } catch (error) {
      lastError = error
    }
  }
  if (lastError) {
    throw new Error(`Failed to load createClientRowModel: ${String(lastError)}`)
  }
  throw new Error(
    "Unable to locate datagrid-core build artifacts. Run `pnpm --filter @affino/datagrid-core build`.",
  )
}

function normalizeRange(start) {
  const safeStart = Math.max(0, Math.min(ROW_COUNT - 1, Math.trunc(start)))
  const safeEnd = Math.max(safeStart, Math.min(ROW_COUNT - 1, safeStart + RANGE_SIZE))
  return { start: safeStart, end: safeEnd }
}

function measureScenario(model, iterations, batchSize, runOne) {
  const durations = []
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const t0 = performance.now()
    for (let batch = 0; batch < batchSize; batch += 1) {
      runOne()
    }
    durations.push((performance.now() - t0) / batchSize)
  }
  return durations
}

function runStableScenario(createClientRowModel, seed, rows) {
  const rng = createRng(seed)
  const model = createClientRowModel({ rows })
  const maxStart = Math.max(0, ROW_COUNT - RANGE_SIZE - 2)
  const pageSize = Math.max(32, Math.min(256, RANGE_SIZE))

  try {
    model.setSortModel([{ key: "latency", direction: "desc" }])
    // Keep filter pair guaranteed to exist in synthetic dataset.
    model.setFilterModel(createFilter("NOC", "us-east"))
    model.setGroupBy({ fields: ["owner"], expandedByDefault: true })
    model.setPageSize(pageSize)
    model.setCurrentPage(0)
    model.refresh("manual")

    let page = 0
    let refreshCounter = 0
    const runOne = () => {
      // Recompute projection without bumping sort/filter/group revisions.
      page = page === 0 ? 1 : 0
      model.setCurrentPage(page)
      if (refreshCounter % STABLE_REFRESH_EVERY === 0) {
        model.refresh("manual")
      }
      refreshCounter += 1
      const range = normalizeRange(randomInt(rng, 0, maxStart))
      model.setViewportRange(range)
      model.getRowsInRange(range)
    }

    for (let warmup = 0; warmup < BENCH_WARMUP_BATCHES; warmup += 1) {
      for (let batch = 0; batch < BENCH_MEASUREMENT_BATCH_SIZE; batch += 1) {
        runOne()
      }
    }

    const baselineDiagnostics = model.getDerivedCacheDiagnostics()
    const durations = measureScenario(model, STABLE_ITERATIONS, BENCH_MEASUREMENT_BATCH_SIZE, runOne)
    const finalDiagnostics = model.getDerivedCacheDiagnostics()
    const diff = diffDiagnostics(baselineDiagnostics, finalDiagnostics)

    return {
      stat: stats(durations),
      diagnostics: diff,
      hitRates: {
        filterPct: ratioPct(diff.filterPredicateHits, diff.filterPredicateMisses),
        sortPct: ratioPct(diff.sortValueHits, diff.sortValueMisses),
        groupPct: ratioPct(diff.groupValueHits, diff.groupValueMisses),
      },
    }
  } finally {
    model.dispose()
  }
}

function runInvalidatedScenario(createClientRowModel, seed, rows) {
  const model = createClientRowModel({ rows })
  const maxStart = Math.max(0, ROW_COUNT - RANGE_SIZE - 2)
  const pageSize = Math.max(32, Math.min(256, RANGE_SIZE))

  try {
    model.setSortModel([{ key: "latency", direction: "desc" }])
    model.setGroupBy({ fields: ["owner"], expandedByDefault: true })
    model.setPageSize(pageSize)
    model.setCurrentPage(0)
    model.refresh("manual")

    let ownerIndex = 0
    const rangeSpan = Math.max(1, maxStart + 1)
    let rangeStart = seed % rangeSpan
    const stride = Math.max(1, Math.floor(rangeSpan / 17))
    const runOne = () => {
      ownerIndex = (ownerIndex + 1) % OWNERS.length
      const owner = OWNERS[ownerIndex] ?? "NOC"
      const region = REGIONS[ownerIndex % REGIONS.length] ?? "us-east"
      model.setFilterModel(createFilter(owner, region))
      rangeStart = (rangeStart + stride) % rangeSpan
      const range = normalizeRange(rangeStart)
      model.setViewportRange(range)
      model.getRowsInRange(range)
    }

    for (let warmup = 0; warmup < BENCH_WARMUP_BATCHES; warmup += 1) {
      for (let batch = 0; batch < BENCH_MEASUREMENT_BATCH_SIZE; batch += 1) {
        runOne()
      }
    }

    const baselineDiagnostics = model.getDerivedCacheDiagnostics()
    const durations = measureScenario(model, INVALIDATED_ITERATIONS, BENCH_MEASUREMENT_BATCH_SIZE, runOne)
    const finalDiagnostics = model.getDerivedCacheDiagnostics()
    const diff = diffDiagnostics(baselineDiagnostics, finalDiagnostics)

    return {
      stat: stats(durations),
      diagnostics: diff,
      hitRates: {
        filterPct: ratioPct(diff.filterPredicateHits, diff.filterPredicateMisses),
        sortPct: ratioPct(diff.sortValueHits, diff.sortValueMisses),
        groupPct: ratioPct(diff.groupValueHits, diff.groupValueMisses),
      },
    }
  } finally {
    model.dispose()
  }
}

const createClientRowModel = await loadFactory()
const sharedRows = createRows(ROW_COUNT)
const runResults = []
const budgetErrors = []
const varianceSkippedChecks = []

console.log("\nAffino DataGrid Derived Cache Benchmark")
console.log(
  `seeds=${BENCH_SEEDS.join(",")} rows=${ROW_COUNT} rangeSize=${RANGE_SIZE} stableIterations=${STABLE_ITERATIONS} invalidatedIterations=${INVALIDATED_ITERATIONS} warmupRuns=${BENCH_WARMUP_RUNS} batchSize=${BENCH_MEASUREMENT_BATCH_SIZE}`,
)

for (const seed of BENCH_SEEDS) {
  for (let warmup = 0; warmup < BENCH_WARMUP_RUNS; warmup += 1) {
    const warmupSeed = seed + (warmup + 1) * 1223
    runStableScenario(createClientRowModel, warmupSeed, sharedRows)
    runInvalidatedScenario(createClientRowModel, warmupSeed, sharedRows)
  }

  const heapStart = await sampleHeapUsed()
  const startedAt = performance.now()
  const stable = runStableScenario(createClientRowModel, seed, sharedRows)
  const invalidated = runInvalidatedScenario(createClientRowModel, seed, sharedRows)
  const elapsed = performance.now() - startedAt
  const heapEnd = await sampleHeapUsed()
  const heapDeltaMb = (heapEnd - heapStart) / (1024 * 1024)

  runResults.push({
    seed,
    elapsedMs: elapsed,
    heapDeltaMb,
    scenarios: { stable, invalidated },
  })

  console.log(`\nSeed ${seed}`)
  console.table([
    {
      scenario: "stable-cache",
      p50Ms: stable.stat.p50.toFixed(3),
      p95Ms: stable.stat.p95.toFixed(3),
      p99Ms: stable.stat.p99.toFixed(3),
      cvPct: stable.stat.cvPct.toFixed(2),
      filterHitPct: stable.hitRates.filterPct.toFixed(2),
      sortHitPct: stable.hitRates.sortPct.toFixed(2),
      groupHitPct: stable.hitRates.groupPct.toFixed(2),
    },
    {
      scenario: "invalidated-cache",
      p50Ms: invalidated.stat.p50.toFixed(3),
      p95Ms: invalidated.stat.p95.toFixed(3),
      p99Ms: invalidated.stat.p99.toFixed(3),
      cvPct: invalidated.stat.cvPct.toFixed(2),
      filterMisses: invalidated.diagnostics.filterPredicateMisses,
      sortMisses: invalidated.diagnostics.sortValueMisses,
      groupMisses: invalidated.diagnostics.groupValueMisses,
    },
  ])
  console.log(`Total elapsed: ${elapsed.toFixed(2)}ms`)
  console.log(`Heap delta: ${heapDeltaMb.toFixed(2)}MB`)

  if (heapDeltaMb > PERF_BUDGET_MAX_HEAP_DELTA_MB + PERF_BUDGET_HEAP_EPSILON_MB) {
    budgetErrors.push(
      `seed ${seed}: heap delta ${heapDeltaMb.toFixed(2)}MB exceeds PERF_BUDGET_MAX_HEAP_DELTA_MB=${PERF_BUDGET_MAX_HEAP_DELTA_MB}MB (epsilon ${PERF_BUDGET_HEAP_EPSILON_MB.toFixed(2)}MB)`,
    )
  }
  if (stable.stat.p95 > PERF_BUDGET_MAX_STABLE_P95_MS) {
    budgetErrors.push(
      `seed ${seed}: stable-cache p95 ${stable.stat.p95.toFixed(3)}ms exceeds PERF_BUDGET_MAX_STABLE_P95_MS=${PERF_BUDGET_MAX_STABLE_P95_MS}ms`,
    )
  }
  if (invalidated.stat.p95 > PERF_BUDGET_MAX_INVALIDATED_P95_MS) {
    budgetErrors.push(
      `seed ${seed}: invalidated-cache p95 ${invalidated.stat.p95.toFixed(3)}ms exceeds PERF_BUDGET_MAX_INVALIDATED_P95_MS=${PERF_BUDGET_MAX_INVALIDATED_P95_MS}ms`,
    )
  }
  if (stable.hitRates.filterPct < PERF_BUDGET_MIN_STABLE_FILTER_HIT_RATE_PCT) {
    budgetErrors.push(
      `seed ${seed}: stable filter-hit ${stable.hitRates.filterPct.toFixed(2)}% below PERF_BUDGET_MIN_STABLE_FILTER_HIT_RATE_PCT=${PERF_BUDGET_MIN_STABLE_FILTER_HIT_RATE_PCT}%`,
    )
  }
  if (stable.hitRates.sortPct < PERF_BUDGET_MIN_STABLE_SORT_HIT_RATE_PCT) {
    budgetErrors.push(
      `seed ${seed}: stable sort-hit ${stable.hitRates.sortPct.toFixed(2)}% below PERF_BUDGET_MIN_STABLE_SORT_HIT_RATE_PCT=${PERF_BUDGET_MIN_STABLE_SORT_HIT_RATE_PCT}%`,
    )
  }
  if (stable.hitRates.groupPct < PERF_BUDGET_MIN_STABLE_GROUP_HIT_RATE_PCT) {
    budgetErrors.push(
      `seed ${seed}: stable group-hit ${stable.hitRates.groupPct.toFixed(2)}% below PERF_BUDGET_MIN_STABLE_GROUP_HIT_RATE_PCT=${PERF_BUDGET_MIN_STABLE_GROUP_HIT_RATE_PCT}%`,
    )
  }
  if (invalidated.diagnostics.filterPredicateMisses < PERF_BUDGET_MIN_INVALIDATED_FILTER_MISSES) {
    budgetErrors.push(
      `seed ${seed}: invalidated filter misses ${invalidated.diagnostics.filterPredicateMisses} below PERF_BUDGET_MIN_INVALIDATED_FILTER_MISSES=${PERF_BUDGET_MIN_INVALIDATED_FILTER_MISSES}`,
    )
  }
}

const aggregateElapsed = stats(runResults.map(run => run.elapsedMs))
const aggregateHeap = stats(runResults.map(run => run.heapDeltaMb))
const aggregateStableP95 = stats(runResults.map(run => run.scenarios.stable.stat.p95))
const aggregateInvalidatedP95 = stats(runResults.map(run => run.scenarios.invalidated.stat.p95))
const aggregateStableFilterHit = stats(runResults.map(run => run.scenarios.stable.hitRates.filterPct))
const aggregateStableSortHit = stats(runResults.map(run => run.scenarios.stable.hitRates.sortPct))
const aggregateStableGroupHit = stats(runResults.map(run => run.scenarios.stable.hitRates.groupPct))
const aggregateInvalidatedFilterMisses = stats(
  runResults.map(run => run.scenarios.invalidated.diagnostics.filterPredicateMisses),
)

if (aggregateElapsed.p95 > PERF_BUDGET_TOTAL_MS) {
  budgetErrors.push(
    `aggregate elapsed p95 ${aggregateElapsed.p95.toFixed(2)}ms exceeds PERF_BUDGET_TOTAL_MS=${PERF_BUDGET_TOTAL_MS}ms`,
  )
}

for (const aggregate of [
  { name: "elapsed", stat: aggregateElapsed },
  { name: "stable-cache p95", stat: aggregateStableP95 },
  { name: "invalidated-cache p95", stat: aggregateInvalidatedP95 },
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

if (aggregateStableFilterHit.mean < PERF_BUDGET_MIN_STABLE_FILTER_HIT_RATE_PCT) {
  budgetErrors.push(
    `aggregate stable filter-hit ${aggregateStableFilterHit.mean.toFixed(2)}% below PERF_BUDGET_MIN_STABLE_FILTER_HIT_RATE_PCT=${PERF_BUDGET_MIN_STABLE_FILTER_HIT_RATE_PCT}%`,
  )
}
if (aggregateStableSortHit.mean < PERF_BUDGET_MIN_STABLE_SORT_HIT_RATE_PCT) {
  budgetErrors.push(
    `aggregate stable sort-hit ${aggregateStableSortHit.mean.toFixed(2)}% below PERF_BUDGET_MIN_STABLE_SORT_HIT_RATE_PCT=${PERF_BUDGET_MIN_STABLE_SORT_HIT_RATE_PCT}%`,
  )
}
if (aggregateStableGroupHit.mean < PERF_BUDGET_MIN_STABLE_GROUP_HIT_RATE_PCT) {
  budgetErrors.push(
    `aggregate stable group-hit ${aggregateStableGroupHit.mean.toFixed(2)}% below PERF_BUDGET_MIN_STABLE_GROUP_HIT_RATE_PCT=${PERF_BUDGET_MIN_STABLE_GROUP_HIT_RATE_PCT}%`,
  )
}
if (aggregateInvalidatedFilterMisses.mean < PERF_BUDGET_MIN_INVALIDATED_FILTER_MISSES) {
  budgetErrors.push(
    `aggregate invalidated filter misses ${aggregateInvalidatedFilterMisses.mean.toFixed(2)} below PERF_BUDGET_MIN_INVALIDATED_FILTER_MISSES=${PERF_BUDGET_MIN_INVALIDATED_FILTER_MISSES}`,
  )
}

const summary = {
  benchmark: "datagrid-derived-cache",
  generatedAt: new Date().toISOString(),
  config: {
    seeds: BENCH_SEEDS,
    rowCount: ROW_COUNT,
    rangeSize: RANGE_SIZE,
    stableIterations: STABLE_ITERATIONS,
    invalidatedIterations: INVALIDATED_ITERATIONS,
    warmupRuns: BENCH_WARMUP_RUNS,
    warmupBatchesPerScenario: BENCH_WARMUP_BATCHES,
    measurementBatchSize: BENCH_MEASUREMENT_BATCH_SIZE,
  },
  budgets: {
    totalMs: PERF_BUDGET_TOTAL_MS,
    maxStableP95Ms: PERF_BUDGET_MAX_STABLE_P95_MS,
    maxInvalidatedP95Ms: PERF_BUDGET_MAX_INVALIDATED_P95_MS,
    minStableFilterHitRatePct: PERF_BUDGET_MIN_STABLE_FILTER_HIT_RATE_PCT,
    minStableSortHitRatePct: PERF_BUDGET_MIN_STABLE_SORT_HIT_RATE_PCT,
    minStableGroupHitRatePct: PERF_BUDGET_MIN_STABLE_GROUP_HIT_RATE_PCT,
    minInvalidatedFilterMisses: PERF_BUDGET_MIN_INVALIDATED_FILTER_MISSES,
    maxVariancePct: PERF_BUDGET_MAX_VARIANCE_PCT,
    varianceMinMeanMs: PERF_BUDGET_VARIANCE_MIN_MEAN_MS,
    maxHeapDeltaMb: PERF_BUDGET_MAX_HEAP_DELTA_MB,
    heapEpsilonMb: PERF_BUDGET_HEAP_EPSILON_MB,
  },
  varianceSkippedChecks,
  aggregate: {
    elapsedMs: aggregateElapsed,
    heapDeltaMb: aggregateHeap,
    stableP95Ms: aggregateStableP95,
    invalidatedP95Ms: aggregateInvalidatedP95,
    stableFilterHitRatePct: aggregateStableFilterHit,
    stableSortHitRatePct: aggregateStableSortHit,
    stableGroupHitRatePct: aggregateStableGroupHit,
    invalidatedFilterMisses: aggregateInvalidatedFilterMisses,
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
  console.error("\nDerived cache benchmark budget check failed:")
  for (const error of budgetErrors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}
