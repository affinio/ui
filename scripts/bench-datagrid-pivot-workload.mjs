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
const BENCH_WARMUP_RUNS = Number.parseInt(process.env.BENCH_WARMUP_RUNS ?? "1", 10)
const BENCH_MEASUREMENT_BATCH_SIZE = Number.parseInt(process.env.BENCH_PIVOT_MEASUREMENT_BATCH_SIZE ?? "3", 10)
const BENCH_WARMUP_BATCHES = Number.parseInt(process.env.BENCH_PIVOT_WARMUP_BATCHES ?? "1", 10)

const PIVOT_ROW_COUNT = Number.parseInt(process.env.BENCH_PIVOT_ROW_COUNT ?? "24000", 10)
const PIVOT_VIEWPORT_SIZE = Number.parseInt(process.env.BENCH_PIVOT_VIEWPORT_SIZE ?? "160", 10)
const PIVOT_REBUILD_ITERATIONS = Number.parseInt(process.env.BENCH_PIVOT_REBUILD_ITERATIONS ?? "120", 10)
const PIVOT_PATCH_FROZEN_ITERATIONS = Number.parseInt(process.env.BENCH_PIVOT_PATCH_FROZEN_ITERATIONS ?? "150", 10)
const PIVOT_PATCH_REAPPLY_ITERATIONS = Number.parseInt(process.env.BENCH_PIVOT_PATCH_REAPPLY_ITERATIONS ?? "90", 10)
const PIVOT_PATCH_ROWS_PER_ITERATION = Number.parseInt(process.env.BENCH_PIVOT_PATCH_ROWS_PER_ITERATION ?? "6", 10)

const PERF_BUDGET_TOTAL_MS = Number.parseFloat(process.env.PERF_BUDGET_TOTAL_MS ?? "Infinity")
const PERF_BUDGET_MAX_PIVOT_REBUILD_P95_MS = Number.parseFloat(
  process.env.PERF_BUDGET_MAX_PIVOT_REBUILD_P95_MS ?? "Infinity",
)
const PERF_BUDGET_MAX_PIVOT_REBUILD_P99_MS = Number.parseFloat(
  process.env.PERF_BUDGET_MAX_PIVOT_REBUILD_P99_MS ?? "Infinity",
)
const PERF_BUDGET_MAX_PIVOT_PATCH_FROZEN_P95_MS = Number.parseFloat(
  process.env.PERF_BUDGET_MAX_PIVOT_PATCH_FROZEN_P95_MS ?? "Infinity",
)
const PERF_BUDGET_MAX_PIVOT_PATCH_FROZEN_P99_MS = Number.parseFloat(
  process.env.PERF_BUDGET_MAX_PIVOT_PATCH_FROZEN_P99_MS ?? "Infinity",
)
const PERF_BUDGET_MAX_PIVOT_PATCH_REAPPLY_P95_MS = Number.parseFloat(
  process.env.PERF_BUDGET_MAX_PIVOT_PATCH_REAPPLY_P95_MS ?? "Infinity",
)
const PERF_BUDGET_MAX_PIVOT_PATCH_REAPPLY_P99_MS = Number.parseFloat(
  process.env.PERF_BUDGET_MAX_PIVOT_PATCH_REAPPLY_P99_MS ?? "Infinity",
)
const PERF_BUDGET_MIN_PIVOT_COLUMNS = Number.parseInt(process.env.PERF_BUDGET_MIN_PIVOT_COLUMNS ?? "2", 10)
const PERF_BUDGET_MAX_VARIANCE_PCT = Number.parseFloat(process.env.PERF_BUDGET_MAX_VARIANCE_PCT ?? "Infinity")
const PERF_BUDGET_VARIANCE_MIN_MEAN_MS = Number.parseFloat(process.env.PERF_BUDGET_VARIANCE_MIN_MEAN_MS ?? "0.5")
const PERF_BUDGET_MAX_HEAP_DELTA_MB = Number.parseFloat(process.env.PERF_BUDGET_MAX_HEAP_DELTA_MB ?? "Infinity")
const PERF_BUDGET_HEAP_EPSILON_MB = Number.parseFloat(process.env.PERF_BUDGET_HEAP_EPSILON_MB ?? "1")

const BENCH_OUTPUT_JSON = process.env.BENCH_OUTPUT_JSON ? resolve(process.env.BENCH_OUTPUT_JSON) : null

const TEAMS = ["NOC", "SRE", "Core", "Platform", "Payments", "Data", "Ops", "Frontend"]
const REGIONS = ["us-east", "us-west", "eu-central", "ap-south", "sa-east"]
const YEARS = [2022, 2023, 2024, 2025, 2026]
const QUARTERS = ["Q1", "Q2", "Q3", "Q4"]

const PIVOT_SPEC_PRIMARY = {
  rows: ["team"],
  columns: ["year"],
  values: [
    { field: "revenue", agg: "sum" },
    { field: "orders", agg: "count" },
  ],
}

const PIVOT_SPEC_ALT = {
  rows: ["region"],
  columns: ["quarter"],
  values: [
    { field: "revenue", agg: "sum" },
    { field: "latency", agg: "avg" },
  ],
}

assertPositiveInteger(PIVOT_ROW_COUNT, "BENCH_PIVOT_ROW_COUNT")
assertPositiveInteger(PIVOT_VIEWPORT_SIZE, "BENCH_PIVOT_VIEWPORT_SIZE")
assertPositiveInteger(PIVOT_REBUILD_ITERATIONS, "BENCH_PIVOT_REBUILD_ITERATIONS")
assertPositiveInteger(PIVOT_PATCH_FROZEN_ITERATIONS, "BENCH_PIVOT_PATCH_FROZEN_ITERATIONS")
assertPositiveInteger(PIVOT_PATCH_REAPPLY_ITERATIONS, "BENCH_PIVOT_PATCH_REAPPLY_ITERATIONS")
assertPositiveInteger(PIVOT_PATCH_ROWS_PER_ITERATION, "BENCH_PIVOT_PATCH_ROWS_PER_ITERATION")
assertPositiveInteger(BENCH_MEASUREMENT_BATCH_SIZE, "BENCH_PIVOT_MEASUREMENT_BATCH_SIZE")
assertNonNegativeInteger(BENCH_WARMUP_BATCHES, "BENCH_PIVOT_WARMUP_BATCHES")
assertNonNegativeInteger(BENCH_WARMUP_RUNS, "BENCH_WARMUP_RUNS")
if (!BENCH_SEEDS.length) {
  throw new Error("BENCH_SEEDS must include at least one positive integer")
}
if (!Number.isFinite(PERF_BUDGET_VARIANCE_MIN_MEAN_MS) || PERF_BUDGET_VARIANCE_MIN_MEAN_MS < 0) {
  throw new Error("PERF_BUDGET_VARIANCE_MIN_MEAN_MS must be a non-negative finite number")
}
if (!Number.isFinite(PERF_BUDGET_HEAP_EPSILON_MB) || PERF_BUDGET_HEAP_EPSILON_MB < 0) {
  throw new Error("PERF_BUDGET_HEAP_EPSILON_MB must be a non-negative finite number")
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

function normalizeRange(start, end) {
  const normalizedStart = Math.max(0, Math.trunc(start))
  const normalizedEnd = Math.max(normalizedStart, Math.trunc(end))
  return { start: normalizedStart, end: normalizedEnd }
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

function createRows(count) {
  const rows = new Array(count)
  for (let index = 0; index < count; index += 1) {
    const team = TEAMS[index % TEAMS.length] ?? "NOC"
    const region = REGIONS[index % REGIONS.length] ?? "us-east"
    const year = YEARS[index % YEARS.length] ?? 2024
    const quarter = QUARTERS[index % QUARTERS.length] ?? "Q1"
    rows[index] = {
      rowId: index,
      team,
      region,
      year,
      quarter,
      orders: (index % 11) + 1,
      revenue: (index * 37) % 5000 + (year - 2021) * 10,
      latency: (index * 17) % 900,
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
    throw new Error(`Failed to load createClientRowModel: ${String(lastError)}`)
  }
  throw new Error("Unable to locate datagrid-core build artifacts. Run `pnpm --filter @affino/datagrid-core build`.")
}

function runPivotRebuildScenario(createClientRowModel, seed, rows) {
  const rng = createRng(seed)
  const model = createClientRowModel({ rows })
  const maxStart = Math.max(0, PIVOT_ROW_COUNT - PIVOT_VIEWPORT_SIZE - 1)
  const durations = []
  const pivotColumnCounts = []
  let useAlt = false

  try {
    model.setPivotModel(PIVOT_SPEC_PRIMARY)
    model.refresh("manual")

    const runOne = () => {
      useAlt = !useAlt
      model.setPivotModel(useAlt ? PIVOT_SPEC_ALT : PIVOT_SPEC_PRIMARY)
      const start = randomInt(rng, 0, maxStart)
      const range = normalizeRange(start, start + PIVOT_VIEWPORT_SIZE)
      model.setViewportRange(range)
      model.getRowsInRange(range)
      pivotColumnCounts.push(model.getSnapshot().pivotColumns?.length ?? 0)
    }

    for (let warmup = 0; warmup < BENCH_WARMUP_BATCHES; warmup += 1) {
      for (let batch = 0; batch < BENCH_MEASUREMENT_BATCH_SIZE; batch += 1) {
        runOne()
      }
    }

    for (let iteration = 0; iteration < PIVOT_REBUILD_ITERATIONS; iteration += 1) {
      const startedAt = performance.now()
      for (let batch = 0; batch < BENCH_MEASUREMENT_BATCH_SIZE; batch += 1) {
        runOne()
      }
      durations.push((performance.now() - startedAt) / BENCH_MEASUREMENT_BATCH_SIZE)
    }

    return {
      stat: stats(durations),
      pivotColumns: stats(pivotColumnCounts),
    }
  } finally {
    model.dispose()
  }
}

function runPivotPatchScenario(createClientRowModel, seed, rows, options) {
  const rng = createRng(seed)
  const model = createClientRowModel({ rows })
  const maxStart = Math.max(0, PIVOT_ROW_COUNT - PIVOT_VIEWPORT_SIZE - 1)
  const durations = []
  let checksum = 0

  try {
    model.setPivotModel(PIVOT_SPEC_PRIMARY)
    model.refresh("manual")

    const runOne = () => {
      const updates = []
      for (let index = 0; index < PIVOT_PATCH_ROWS_PER_ITERATION; index += 1) {
        const rowId = randomInt(rng, 0, PIVOT_ROW_COUNT - 1)
        const revenueDelta = randomInt(rng, 1, 9)
        updates.push({
          rowId,
          data: {
            revenue: ((rowId * 37) % 5000) + revenueDelta,
            latency: ((rowId * 17) % 900) + (revenueDelta % 5),
          },
        })
      }
      model.patchRows(updates, {
        recomputeSort: false,
        recomputeFilter: false,
        recomputeGroup: options.recomputeGroup,
        emit: false,
      })
      const start = randomInt(rng, 0, maxStart)
      const range = normalizeRange(start, start + PIVOT_VIEWPORT_SIZE)
      model.setViewportRange(range)
      const visibleRows = model.getRowsInRange(range)
      checksum += visibleRows.length
      checksum += model.getSnapshot().pivotColumns?.length ?? 0
    }

    for (let warmup = 0; warmup < BENCH_WARMUP_BATCHES; warmup += 1) {
      for (let batch = 0; batch < BENCH_MEASUREMENT_BATCH_SIZE; batch += 1) {
        runOne()
      }
    }

    const iterations = options.recomputeGroup
      ? PIVOT_PATCH_REAPPLY_ITERATIONS
      : PIVOT_PATCH_FROZEN_ITERATIONS
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const startedAt = performance.now()
      for (let batch = 0; batch < BENCH_MEASUREMENT_BATCH_SIZE; batch += 1) {
        runOne()
      }
      durations.push((performance.now() - startedAt) / BENCH_MEASUREMENT_BATCH_SIZE)
    }

    if (!Number.isFinite(checksum)) {
      throw new Error("Pivot patch scenario produced invalid checksum")
    }

    return {
      stat: stats(durations),
      checksum,
    }
  } finally {
    model.dispose()
  }
}

const createClientRowModel = await loadFactory()
const sharedRows = createRows(PIVOT_ROW_COUNT)
const runResults = []
const budgetErrors = []
const varianceSkippedChecks = []

console.log("\nAffino DataGrid Pivot Workload Benchmark")
console.log(
  `seeds=${BENCH_SEEDS.join(",")} rows=${PIVOT_ROW_COUNT} viewport=${PIVOT_VIEWPORT_SIZE} rebuildIterations=${PIVOT_REBUILD_ITERATIONS} patchFrozenIterations=${PIVOT_PATCH_FROZEN_ITERATIONS} patchReapplyIterations=${PIVOT_PATCH_REAPPLY_ITERATIONS} warmupRuns=${BENCH_WARMUP_RUNS} batchSize=${BENCH_MEASUREMENT_BATCH_SIZE}`,
)

for (const seed of BENCH_SEEDS) {
  for (let warmup = 0; warmup < BENCH_WARMUP_RUNS; warmup += 1) {
    const warmupSeed = seed + (warmup + 1) * 1877
    runPivotRebuildScenario(createClientRowModel, warmupSeed, sharedRows)
    runPivotPatchScenario(createClientRowModel, warmupSeed, sharedRows, { recomputeGroup: false })
    runPivotPatchScenario(createClientRowModel, warmupSeed, sharedRows, { recomputeGroup: true })
  }

  const heapStart = await sampleHeapUsed()
  const startedAt = performance.now()
  const pivotRebuild = runPivotRebuildScenario(createClientRowModel, seed, sharedRows)
  const pivotPatchFrozen = runPivotPatchScenario(createClientRowModel, seed, sharedRows, { recomputeGroup: false })
  const pivotPatchReapply = runPivotPatchScenario(createClientRowModel, seed, sharedRows, { recomputeGroup: true })
  const elapsedMs = performance.now() - startedAt
  const heapEnd = await sampleHeapUsed()
  const heapDeltaMb = (heapEnd - heapStart) / (1024 * 1024)

  runResults.push({
    seed,
    elapsedMs,
    heapDeltaMb,
    scenarios: {
      pivotRebuild,
      pivotPatchFrozen,
      pivotPatchReapply,
    },
  })

  console.log(`\nSeed ${seed}`)
  console.table([
    {
      scenario: "pivot-rebuild",
      p50Ms: pivotRebuild.stat.p50.toFixed(3),
      p95Ms: pivotRebuild.stat.p95.toFixed(3),
      p99Ms: pivotRebuild.stat.p99.toFixed(3),
      cvPct: pivotRebuild.stat.cvPct.toFixed(2),
      pivotColumnsMean: pivotRebuild.pivotColumns.mean.toFixed(1),
    },
    {
      scenario: "pivot-patch-frozen",
      p50Ms: pivotPatchFrozen.stat.p50.toFixed(3),
      p95Ms: pivotPatchFrozen.stat.p95.toFixed(3),
      p99Ms: pivotPatchFrozen.stat.p99.toFixed(3),
      cvPct: pivotPatchFrozen.stat.cvPct.toFixed(2),
      checksum: pivotPatchFrozen.checksum,
    },
    {
      scenario: "pivot-patch-reapply",
      p50Ms: pivotPatchReapply.stat.p50.toFixed(3),
      p95Ms: pivotPatchReapply.stat.p95.toFixed(3),
      p99Ms: pivotPatchReapply.stat.p99.toFixed(3),
      cvPct: pivotPatchReapply.stat.cvPct.toFixed(2),
      checksum: pivotPatchReapply.checksum,
    },
  ])
  console.log(`Total elapsed: ${elapsedMs.toFixed(2)}ms`)
  console.log(`Heap delta: ${heapDeltaMb.toFixed(2)}MB`)

  if (elapsedMs > PERF_BUDGET_TOTAL_MS) {
    budgetErrors.push(
      `seed ${seed}: total elapsed ${elapsedMs.toFixed(2)}ms exceeds PERF_BUDGET_TOTAL_MS=${PERF_BUDGET_TOTAL_MS}ms`,
    )
  }
  if (heapDeltaMb > PERF_BUDGET_MAX_HEAP_DELTA_MB + PERF_BUDGET_HEAP_EPSILON_MB) {
    budgetErrors.push(
      `seed ${seed}: heap delta ${heapDeltaMb.toFixed(2)}MB exceeds PERF_BUDGET_MAX_HEAP_DELTA_MB=${PERF_BUDGET_MAX_HEAP_DELTA_MB}MB (epsilon ${PERF_BUDGET_HEAP_EPSILON_MB.toFixed(2)}MB)`,
    )
  }
  if (pivotRebuild.stat.p95 > PERF_BUDGET_MAX_PIVOT_REBUILD_P95_MS) {
    budgetErrors.push(
      `seed ${seed}: pivot-rebuild p95 ${pivotRebuild.stat.p95.toFixed(3)}ms exceeds PERF_BUDGET_MAX_PIVOT_REBUILD_P95_MS=${PERF_BUDGET_MAX_PIVOT_REBUILD_P95_MS}ms`,
    )
  }
  if (pivotRebuild.stat.p99 > PERF_BUDGET_MAX_PIVOT_REBUILD_P99_MS) {
    budgetErrors.push(
      `seed ${seed}: pivot-rebuild p99 ${pivotRebuild.stat.p99.toFixed(3)}ms exceeds PERF_BUDGET_MAX_PIVOT_REBUILD_P99_MS=${PERF_BUDGET_MAX_PIVOT_REBUILD_P99_MS}ms`,
    )
  }
  if (pivotPatchFrozen.stat.p95 > PERF_BUDGET_MAX_PIVOT_PATCH_FROZEN_P95_MS) {
    budgetErrors.push(
      `seed ${seed}: pivot-patch-frozen p95 ${pivotPatchFrozen.stat.p95.toFixed(3)}ms exceeds PERF_BUDGET_MAX_PIVOT_PATCH_FROZEN_P95_MS=${PERF_BUDGET_MAX_PIVOT_PATCH_FROZEN_P95_MS}ms`,
    )
  }
  if (pivotPatchFrozen.stat.p99 > PERF_BUDGET_MAX_PIVOT_PATCH_FROZEN_P99_MS) {
    budgetErrors.push(
      `seed ${seed}: pivot-patch-frozen p99 ${pivotPatchFrozen.stat.p99.toFixed(3)}ms exceeds PERF_BUDGET_MAX_PIVOT_PATCH_FROZEN_P99_MS=${PERF_BUDGET_MAX_PIVOT_PATCH_FROZEN_P99_MS}ms`,
    )
  }
  if (pivotPatchReapply.stat.p95 > PERF_BUDGET_MAX_PIVOT_PATCH_REAPPLY_P95_MS) {
    budgetErrors.push(
      `seed ${seed}: pivot-patch-reapply p95 ${pivotPatchReapply.stat.p95.toFixed(3)}ms exceeds PERF_BUDGET_MAX_PIVOT_PATCH_REAPPLY_P95_MS=${PERF_BUDGET_MAX_PIVOT_PATCH_REAPPLY_P95_MS}ms`,
    )
  }
  if (pivotPatchReapply.stat.p99 > PERF_BUDGET_MAX_PIVOT_PATCH_REAPPLY_P99_MS) {
    budgetErrors.push(
      `seed ${seed}: pivot-patch-reapply p99 ${pivotPatchReapply.stat.p99.toFixed(3)}ms exceeds PERF_BUDGET_MAX_PIVOT_PATCH_REAPPLY_P99_MS=${PERF_BUDGET_MAX_PIVOT_PATCH_REAPPLY_P99_MS}ms`,
    )
  }
  if (pivotRebuild.pivotColumns.mean < PERF_BUDGET_MIN_PIVOT_COLUMNS) {
    budgetErrors.push(
      `seed ${seed}: pivot column mean ${pivotRebuild.pivotColumns.mean.toFixed(2)} below PERF_BUDGET_MIN_PIVOT_COLUMNS=${PERF_BUDGET_MIN_PIVOT_COLUMNS}`,
    )
  }
}

const aggregateElapsed = stats(runResults.map(run => run.elapsedMs))
const aggregateHeap = stats(runResults.map(run => run.heapDeltaMb))
const aggregatePivotRebuildP95 = stats(runResults.map(run => run.scenarios.pivotRebuild.stat.p95))
const aggregatePivotRebuildP99 = stats(runResults.map(run => run.scenarios.pivotRebuild.stat.p99))
const aggregatePivotPatchFrozenP95 = stats(runResults.map(run => run.scenarios.pivotPatchFrozen.stat.p95))
const aggregatePivotPatchFrozenP99 = stats(runResults.map(run => run.scenarios.pivotPatchFrozen.stat.p99))
const aggregatePivotPatchReapplyP95 = stats(runResults.map(run => run.scenarios.pivotPatchReapply.stat.p95))
const aggregatePivotPatchReapplyP99 = stats(runResults.map(run => run.scenarios.pivotPatchReapply.stat.p99))
const aggregatePivotColumns = stats(runResults.map(run => run.scenarios.pivotRebuild.pivotColumns.mean))

if (aggregateElapsed.p95 > PERF_BUDGET_TOTAL_MS) {
  budgetErrors.push(
    `aggregate elapsed p95 ${aggregateElapsed.p95.toFixed(2)}ms exceeds PERF_BUDGET_TOTAL_MS=${PERF_BUDGET_TOTAL_MS}ms`,
  )
}

for (const aggregate of [
  { name: "elapsed", stat: aggregateElapsed },
  { name: "pivot-rebuild p95", stat: aggregatePivotRebuildP95 },
  { name: "pivot-rebuild p99", stat: aggregatePivotRebuildP99 },
  { name: "pivot-patch-frozen p95", stat: aggregatePivotPatchFrozenP95 },
  { name: "pivot-patch-frozen p99", stat: aggregatePivotPatchFrozenP99 },
  { name: "pivot-patch-reapply p95", stat: aggregatePivotPatchReapplyP95 },
  { name: "pivot-patch-reapply p99", stat: aggregatePivotPatchReapplyP99 },
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

if (aggregatePivotColumns.mean < PERF_BUDGET_MIN_PIVOT_COLUMNS) {
  budgetErrors.push(
    `aggregate pivot column mean ${aggregatePivotColumns.mean.toFixed(2)} below PERF_BUDGET_MIN_PIVOT_COLUMNS=${PERF_BUDGET_MIN_PIVOT_COLUMNS}`,
  )
}

const summary = {
  benchmark: "datagrid-pivot-workload",
  generatedAt: new Date().toISOString(),
  config: {
    seeds: BENCH_SEEDS,
    rowCount: PIVOT_ROW_COUNT,
    viewportSize: PIVOT_VIEWPORT_SIZE,
    warmupRuns: BENCH_WARMUP_RUNS,
    warmupBatchesPerScenario: BENCH_WARMUP_BATCHES,
    measurementBatchSize: BENCH_MEASUREMENT_BATCH_SIZE,
    scenarios: {
      pivotRebuildIterations: PIVOT_REBUILD_ITERATIONS,
      pivotPatchFrozenIterations: PIVOT_PATCH_FROZEN_ITERATIONS,
      pivotPatchReapplyIterations: PIVOT_PATCH_REAPPLY_ITERATIONS,
      patchRowsPerIteration: PIVOT_PATCH_ROWS_PER_ITERATION,
    },
  },
  budgets: {
    totalMs: PERF_BUDGET_TOTAL_MS,
    maxPivotRebuildP95Ms: PERF_BUDGET_MAX_PIVOT_REBUILD_P95_MS,
    maxPivotRebuildP99Ms: PERF_BUDGET_MAX_PIVOT_REBUILD_P99_MS,
    maxPivotPatchFrozenP95Ms: PERF_BUDGET_MAX_PIVOT_PATCH_FROZEN_P95_MS,
    maxPivotPatchFrozenP99Ms: PERF_BUDGET_MAX_PIVOT_PATCH_FROZEN_P99_MS,
    maxPivotPatchReapplyP95Ms: PERF_BUDGET_MAX_PIVOT_PATCH_REAPPLY_P95_MS,
    maxPivotPatchReapplyP99Ms: PERF_BUDGET_MAX_PIVOT_PATCH_REAPPLY_P99_MS,
    minPivotColumns: PERF_BUDGET_MIN_PIVOT_COLUMNS,
    maxVariancePct: PERF_BUDGET_MAX_VARIANCE_PCT,
    varianceMinMeanMs: PERF_BUDGET_VARIANCE_MIN_MEAN_MS,
    maxHeapDeltaMb: PERF_BUDGET_MAX_HEAP_DELTA_MB,
    heapEpsilonMb: PERF_BUDGET_HEAP_EPSILON_MB,
  },
  varianceSkippedChecks,
  aggregate: {
    elapsedMs: aggregateElapsed,
    heapDeltaMb: aggregateHeap,
    pivotRebuildP95Ms: aggregatePivotRebuildP95,
    pivotRebuildP99Ms: aggregatePivotRebuildP99,
    pivotPatchFrozenP95Ms: aggregatePivotPatchFrozenP95,
    pivotPatchFrozenP99Ms: aggregatePivotPatchFrozenP99,
    pivotPatchReapplyP95Ms: aggregatePivotPatchReapplyP95,
    pivotPatchReapplyP99Ms: aggregatePivotPatchReapplyP99,
    pivotColumnsMean: aggregatePivotColumns,
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
  console.error("\nPivot workload benchmark budget check failed:")
  for (const error of budgetErrors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}
