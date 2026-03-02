#!/usr/bin/env node

import { performance } from "node:perf_hooks"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const BENCH_SEED = Number.parseInt(process.env.BENCH_SEED ?? "1337", 10)
const BENCH_SEEDS = (process.env.BENCH_SEEDS ?? `${BENCH_SEED}`)
  .split(",")
  .map(value => Number.parseInt(value.trim(), 10))
  .filter(value => Number.isFinite(value) && value > 0)
const BENCH_WARMUP_RUNS = Number.parseInt(process.env.BENCH_WARMUP_RUNS ?? "1", 10)
const BENCH_OUTPUT_JSON = process.env.BENCH_OUTPUT_JSON ? resolve(process.env.BENCH_OUTPUT_JSON) : null

const COLD_START_ROW_COUNTS = (process.env.BENCH_HARDCORE_COLD_START_ROW_COUNTS ?? "10000,50000,100000")
  .split(",")
  .map(value => Number.parseInt(value.trim(), 10))
  .filter(value => Number.isFinite(value) && value > 0)
const COLD_START_ITERATIONS = Number.parseInt(process.env.BENCH_HARDCORE_COLD_START_ITERATIONS ?? "3", 10)

const SORT_STRESS_ROW_COUNT = Number.parseInt(process.env.BENCH_HARDCORE_SORT_ROW_COUNT ?? "100000", 10)
const SORT_STRESS_ITERATIONS = Number.parseInt(process.env.BENCH_HARDCORE_SORT_ITERATIONS ?? "120", 10)
const SORT_STRESS_VIEWPORT = Number.parseInt(process.env.BENCH_HARDCORE_SORT_VIEWPORT ?? "160", 10)

const FILTER_STRESS_ROW_COUNT = Number.parseInt(process.env.BENCH_HARDCORE_FILTER_ROW_COUNT ?? "100000", 10)
const FILTER_STRESS_ITERATIONS = Number.parseInt(process.env.BENCH_HARDCORE_FILTER_ITERATIONS ?? "80", 10)
const FILTER_STRESS_VIEWPORT = Number.parseInt(process.env.BENCH_HARDCORE_FILTER_VIEWPORT ?? "160", 10)

const PATCH_STORM_ROW_COUNT = Number.parseInt(process.env.BENCH_HARDCORE_PATCH_ROW_COUNT ?? "100000", 10)
const PATCH_STORM_ITERATIONS = Number.parseInt(process.env.BENCH_HARDCORE_PATCH_ITERATIONS ?? "1000", 10)
const PATCH_STORM_ROWS_PER_ITERATION = Number.parseInt(process.env.BENCH_HARDCORE_PATCH_ROWS_PER_ITERATION ?? "3", 10)

const DETERMINISM_ROW_COUNT = Number.parseInt(process.env.BENCH_HARDCORE_DETERMINISM_ROW_COUNT ?? "50000", 10)
const DETERMINISM_PATCH_ITERATIONS = Number.parseInt(process.env.BENCH_HARDCORE_DETERMINISM_PATCH_ITERATIONS ?? "120", 10)
const DETERMINISM_PATCH_ROWS_PER_ITERATION = Number.parseInt(
  process.env.BENCH_HARDCORE_DETERMINISM_PATCH_ROWS_PER_ITERATION ?? "2",
  10,
)

const PERF_BUDGET_TOTAL_MS = Number.parseFloat(process.env.PERF_BUDGET_TOTAL_MS ?? "Infinity")
const PERF_BUDGET_MAX_VARIANCE_PCT = Number.parseFloat(process.env.PERF_BUDGET_MAX_VARIANCE_PCT ?? "Infinity")
const PERF_BUDGET_VARIANCE_MIN_MEAN_MS = Number.parseFloat(process.env.PERF_BUDGET_VARIANCE_MIN_MEAN_MS ?? "0.5")
const PERF_BUDGET_MAX_HEAP_DELTA_MB = Number.parseFloat(process.env.PERF_BUDGET_MAX_HEAP_DELTA_MB ?? "Infinity")
const PERF_BUDGET_HEAP_EPSILON_MB = Number.parseFloat(process.env.PERF_BUDGET_HEAP_EPSILON_MB ?? "1")

const PERF_BUDGET_MAX_COLD_START_10K_P95_MS = Number.parseFloat(process.env.PERF_BUDGET_MAX_COLD_START_10K_P95_MS ?? "Infinity")
const PERF_BUDGET_MAX_COLD_START_50K_P95_MS = Number.parseFloat(process.env.PERF_BUDGET_MAX_COLD_START_50K_P95_MS ?? "Infinity")
const PERF_BUDGET_MAX_COLD_START_100K_P95_MS = Number.parseFloat(process.env.PERF_BUDGET_MAX_COLD_START_100K_P95_MS ?? "Infinity")
const PERF_BUDGET_MAX_SORT_STRESS_P95_MS = Number.parseFloat(process.env.PERF_BUDGET_MAX_SORT_STRESS_P95_MS ?? "Infinity")
const PERF_BUDGET_MAX_SORT_STRESS_P99_MS = Number.parseFloat(process.env.PERF_BUDGET_MAX_SORT_STRESS_P99_MS ?? "Infinity")
const PERF_BUDGET_MAX_FILTER_30_P95_MS = Number.parseFloat(process.env.PERF_BUDGET_MAX_FILTER_30_P95_MS ?? "Infinity")
const PERF_BUDGET_MAX_FILTER_1_P95_MS = Number.parseFloat(process.env.PERF_BUDGET_MAX_FILTER_1_P95_MS ?? "Infinity")
const PERF_BUDGET_MAX_FILTER_0_P95_MS = Number.parseFloat(process.env.PERF_BUDGET_MAX_FILTER_0_P95_MS ?? "Infinity")
const PERF_BUDGET_MAX_PATCH_STORM_TOTAL_MS = Number.parseFloat(process.env.PERF_BUDGET_MAX_PATCH_STORM_TOTAL_MS ?? "Infinity")
const PERF_BUDGET_MAX_PATCH_REAPPLY_MS = Number.parseFloat(process.env.PERF_BUDGET_MAX_PATCH_REAPPLY_MS ?? "Infinity")
const PERF_BUDGET_MIN_PATCH_THROUGHPUT_ROWS_PER_SEC = Number.parseFloat(
  process.env.PERF_BUDGET_MIN_PATCH_THROUGHPUT_ROWS_PER_SEC ?? "0",
)
const PERF_BUDGET_ENFORCE_DETERMINISM = (process.env.PERF_BUDGET_ENFORCE_DETERMINISM ?? "true")
  .trim()
  .toLowerCase() !== "false"

assertNonNegativeInteger(BENCH_WARMUP_RUNS, "BENCH_WARMUP_RUNS")
assertPositiveInteger(COLD_START_ITERATIONS, "BENCH_HARDCORE_COLD_START_ITERATIONS")
assertPositiveInteger(SORT_STRESS_ROW_COUNT, "BENCH_HARDCORE_SORT_ROW_COUNT")
assertPositiveInteger(SORT_STRESS_ITERATIONS, "BENCH_HARDCORE_SORT_ITERATIONS")
assertPositiveInteger(SORT_STRESS_VIEWPORT, "BENCH_HARDCORE_SORT_VIEWPORT")
assertPositiveInteger(FILTER_STRESS_ROW_COUNT, "BENCH_HARDCORE_FILTER_ROW_COUNT")
assertPositiveInteger(FILTER_STRESS_ITERATIONS, "BENCH_HARDCORE_FILTER_ITERATIONS")
assertPositiveInteger(FILTER_STRESS_VIEWPORT, "BENCH_HARDCORE_FILTER_VIEWPORT")
assertPositiveInteger(PATCH_STORM_ROW_COUNT, "BENCH_HARDCORE_PATCH_ROW_COUNT")
assertPositiveInteger(PATCH_STORM_ITERATIONS, "BENCH_HARDCORE_PATCH_ITERATIONS")
assertPositiveInteger(PATCH_STORM_ROWS_PER_ITERATION, "BENCH_HARDCORE_PATCH_ROWS_PER_ITERATION")
assertPositiveInteger(DETERMINISM_ROW_COUNT, "BENCH_HARDCORE_DETERMINISM_ROW_COUNT")
assertPositiveInteger(DETERMINISM_PATCH_ITERATIONS, "BENCH_HARDCORE_DETERMINISM_PATCH_ITERATIONS")
assertPositiveInteger(
  DETERMINISM_PATCH_ROWS_PER_ITERATION,
  "BENCH_HARDCORE_DETERMINISM_PATCH_ROWS_PER_ITERATION",
)
if (!COLD_START_ROW_COUNTS.length) {
  throw new Error("BENCH_HARDCORE_COLD_START_ROW_COUNTS must include at least one positive integer")
}
if (!BENCH_SEEDS.length) {
  throw new Error("BENCH_SEEDS must include at least one positive integer")
}
if (!Number.isFinite(PERF_BUDGET_VARIANCE_MIN_MEAN_MS) || PERF_BUDGET_VARIANCE_MIN_MEAN_MS < 0) {
  throw new Error("PERF_BUDGET_VARIANCE_MIN_MEAN_MS must be a non-negative finite number")
}
if (!Number.isFinite(PERF_BUDGET_HEAP_EPSILON_MB) || PERF_BUDGET_HEAP_EPSILON_MB < 0) {
  throw new Error("PERF_BUDGET_HEAP_EPSILON_MB must be a non-negative finite number")
}
if (!Number.isFinite(PERF_BUDGET_MIN_PATCH_THROUGHPUT_ROWS_PER_SEC) || PERF_BUDGET_MIN_PATCH_THROUGHPUT_ROWS_PER_SEC < 0) {
  throw new Error("PERF_BUDGET_MIN_PATCH_THROUGHPUT_ROWS_PER_SEC must be a non-negative finite number")
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

function toMb(bytes) {
  return bytes / (1024 * 1024)
}

const REGIONS = ["AMER", "EMEA", "APAC", "LATAM"]
const TEAMS = ["core", "growth", "payments", "platform", "ops", "infra", "data", "support"]
const OWNERS = ["alice", "bob", "carol", "david", "elena", "frank", "grace", "harry"]
const YEARS = [2022, 2023, 2024, 2025, 2026]
const QUARTERS = ["Q1", "Q2", "Q3", "Q4"]

function createRows(count, seed) {
  const rng = createRng(seed)
  const rows = new Array(count)
  for (let index = 0; index < count; index += 1) {
    const region = REGIONS[index % REGIONS.length] ?? "AMER"
    const team = TEAMS[index % TEAMS.length] ?? "core"
    const owner = OWNERS[index % OWNERS.length] ?? "alice"
    const year = YEARS[index % YEARS.length] ?? 2024
    const quarter = QUARTERS[index % QUARTERS.length] ?? "Q1"
    const filterBand = index % 100
    rows[index] = {
      rowId: index,
      id: index,
      region,
      team,
      owner,
      year,
      quarter,
      filterBand: String(filterBand),
      revenue: Math.floor(rng() * 100_000) + year * 10,
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

async function maybeRefresh(model, reason = "reapply") {
  const result = model.refresh?.(reason)
  if (result && typeof result.then === "function") {
    await result
  }
}

async function runColdStartScenario(createClientRowModel, seed) {
  const byRows = {}
  for (const rowCount of COLD_START_ROW_COUNTS) {
    const durations = []
    for (let iteration = 0; iteration < COLD_START_ITERATIONS; iteration += 1) {
      const rows = createRows(rowCount, seed + iteration * 13)
      const startedAt = performance.now()
      const model = createClientRowModel({ rows })
      model.getSnapshot()
      model.getRowsInRange({ start: 0, end: Math.min(159, Math.max(0, model.getRowCount() - 1)) })
      durations.push(performance.now() - startedAt)
      model.dispose()
      await sleepTick()
    }
    byRows[String(rowCount)] = stats(durations)
  }
  return byRows
}

function buildSortDescriptors(direction) {
  return [
    { key: "revenue", direction },
    { key: "orders", direction },
    { key: "latency", direction },
    { key: "year", direction },
    { key: "score", direction },
  ]
}

async function runSortStressScenario(createClientRowModel, seed) {
  const rows = createRows(SORT_STRESS_ROW_COUNT, seed)
  const model = createClientRowModel({ rows })
  const durations = []
  const diagnosticsBefore = typeof model.getDerivedCacheDiagnostics === "function"
    ? model.getDerivedCacheDiagnostics()
    : null
  for (let iteration = 0; iteration < SORT_STRESS_ITERATIONS; iteration += 1) {
    const direction = iteration % 2 === 0 ? "asc" : "desc"
    const descriptors = buildSortDescriptors(direction)
    const startedAt = performance.now()
    model.setSortModel(descriptors)
    model.getRowsInRange({ start: 0, end: Math.min(SORT_STRESS_VIEWPORT - 1, model.getRowCount() - 1) })
    durations.push(performance.now() - startedAt)
  }
  const diagnosticsAfter = typeof model.getDerivedCacheDiagnostics === "function"
    ? model.getDerivedCacheDiagnostics()
    : null
  model.dispose()
  const sortHitDelta = diagnosticsBefore && diagnosticsAfter
    ? Math.max(0, diagnosticsAfter.sortValueHits - diagnosticsBefore.sortValueHits)
    : 0
  const sortMissDelta = diagnosticsBefore && diagnosticsAfter
    ? Math.max(0, diagnosticsAfter.sortValueMisses - diagnosticsBefore.sortValueMisses)
    : 0
  const total = sortHitDelta + sortMissDelta
  const hitRatePct = total > 0 ? (sortHitDelta / total) * 100 : 0
  return {
    latencyMs: stats(durations),
    sortCache: {
      hits: sortHitDelta,
      misses: sortMissDelta,
      hitRatePct,
    },
  }
}

function buildFilterModel(tokens) {
  return {
    columnFilters: {
      filterBand: {
        kind: "valueSet",
        tokens,
      },
    },
    advancedFilters: {},
  }
}

async function runFilterStressScenario(createClientRowModel, seed) {
  const rows = createRows(FILTER_STRESS_ROW_COUNT, seed)
  const model = createClientRowModel({ rows })
  const profiles = {
    match30: buildFilterModel(Array.from({ length: 30 }, (_, index) => String(index))),
    match1: buildFilterModel(["0"]),
    match0: buildFilterModel(["999"]),
  }
  const result = {}

  for (const [profile, filterModel] of Object.entries(profiles)) {
    const durations = []
    for (let iteration = 0; iteration < FILTER_STRESS_ITERATIONS; iteration += 1) {
      const startedAt = performance.now()
      model.setFilterModel(filterModel)
      model.getRowsInRange({ start: 0, end: Math.min(FILTER_STRESS_VIEWPORT - 1, model.getRowCount() - 1) })
      durations.push(performance.now() - startedAt)
    }
    result[profile] = {
      latencyMs: stats(durations),
      rowCount: model.getRowCount(),
    }
  }

  model.setFilterModel(null)
  model.dispose()
  return result
}

function createPatchUpdates(rng, rowCount, rowsPerPatch) {
  const updates = []
  for (let index = 0; index < rowsPerPatch; index += 1) {
    const rowId = randomInt(rng, 0, Math.max(0, rowCount - 1))
    updates.push({
      rowId,
      data: {
        revenue: randomInt(rng, 10_000, 120_000),
        latency: randomInt(rng, 50, 1_500),
        note: `patch-${rowId}-${randomInt(rng, 1, 10_000)}`,
      },
    })
  }
  return updates
}

async function runPatchStormScenario(createClientRowModel, seed) {
  const rng = createRng(seed)
  const rows = createRows(PATCH_STORM_ROW_COUNT, seed)
  const model = createClientRowModel({ rows })
  if (typeof model.patchRows !== "function") {
    model.dispose()
    throw new Error("Patch storm scenario requires ClientRowModel.patchRows support.")
  }

  const startedAt = performance.now()
  for (let iteration = 0; iteration < PATCH_STORM_ITERATIONS; iteration += 1) {
    const updates = createPatchUpdates(rng, PATCH_STORM_ROW_COUNT, PATCH_STORM_ROWS_PER_ITERATION)
    model.patchRows(updates, {
      recomputeSort: false,
      recomputeFilter: false,
      recomputeGroup: false,
      emit: false,
    })
  }
  const patchTotalMs = performance.now() - startedAt
  const reapplyStartedAt = performance.now()
  await maybeRefresh(model, "reapply")
  const reapplyMs = performance.now() - reapplyStartedAt
  const patchedRows = PATCH_STORM_ITERATIONS * PATCH_STORM_ROWS_PER_ITERATION
  const throughputRowsPerSec = patchTotalMs > 0 ? patchedRows / (patchTotalMs / 1000) : 0

  model.dispose()
  return {
    patchTotalMs,
    reapplyMs,
    patchedRows,
    throughputRowsPerSec,
  }
}

async function computeModelDeterminismHash(createClientRowModel, seed) {
  const rng = createRng(seed)
  const model = createClientRowModel({ rows: createRows(DETERMINISM_ROW_COUNT, seed) })

  model.setSortModel([
    { key: "revenue", direction: "desc" },
    { key: "orders", direction: "asc" },
  ])
  model.setFilterModel(buildFilterModel(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]))
  if (typeof model.patchRows === "function") {
    for (let iteration = 0; iteration < DETERMINISM_PATCH_ITERATIONS; iteration += 1) {
      const updates = createPatchUpdates(rng, DETERMINISM_ROW_COUNT, DETERMINISM_PATCH_ROWS_PER_ITERATION)
      model.patchRows(updates, {
        recomputeSort: false,
        recomputeFilter: false,
        recomputeGroup: false,
        emit: false,
      })
    }
  }
  await maybeRefresh(model, "reapply")

  const snapshot = model.getSnapshot()
  const hash = createHash("sha256")
  hash.update(JSON.stringify({
    rowCount: snapshot.rowCount,
    sortModel: snapshot.sortModel,
    filterModel: snapshot.filterModel,
    groupBy: snapshot.groupBy,
    projection: snapshot.projection,
  }))

  const rowCount = model.getRowCount()
  const chunkSize = 512
  for (let start = 0; start < rowCount; start += chunkSize) {
    const end = Math.min(rowCount - 1, start + chunkSize - 1)
    const rows = model.getRowsInRange({ start, end })
    for (const row of rows) {
      const payload = `${row.rowId}|${row.displayIndex}|${String(row.row?.revenue ?? "")}|${String(row.row?.orders ?? "")}\n`
      hash.update(payload)
    }
  }
  model.dispose()
  return hash.digest("hex")
}

async function runDeterminismScenario(createClientRowModel, seed) {
  const hashA = await computeModelDeterminismHash(createClientRowModel, seed)
  const hashB = await computeModelDeterminismHash(createClientRowModel, seed)
  return {
    hashA,
    hashB,
    matches: hashA === hashB,
  }
}

const createClientRowModel = await loadFactory()
const runResults = []
const budgetErrors = []
const varianceSkippedChecks = []

console.log("\nAffino DataGrid Hardcore Benchmark")
console.log(
  `seeds=${BENCH_SEEDS.join(",")} coldStartRows=${COLD_START_ROW_COUNTS.join(",")} sortRows=${SORT_STRESS_ROW_COUNT} filterRows=${FILTER_STRESS_ROW_COUNT} patchRows=${PATCH_STORM_ROW_COUNT}`,
)

for (const seed of BENCH_SEEDS) {
  console.log(`\n[hardcore] seed ${seed}: warmup...`)
  for (let warmup = 0; warmup < BENCH_WARMUP_RUNS; warmup += 1) {
    await runColdStartScenario(createClientRowModel, seed + warmup)
    await runSortStressScenario(createClientRowModel, seed + warmup)
    await runFilterStressScenario(createClientRowModel, seed + warmup)
    await runPatchStormScenario(createClientRowModel, seed + warmup)
    await runDeterminismScenario(createClientRowModel, seed + warmup)
  }

  const heapBefore = await sampleHeapUsed()
  const startedAt = performance.now()
  console.log(`[hardcore] seed ${seed}: cold-start...`)
  const coldStart = await runColdStartScenario(createClientRowModel, seed)
  console.log(`[hardcore] seed ${seed}: sort-stress...`)
  const sortStress = await runSortStressScenario(createClientRowModel, seed)
  console.log(`[hardcore] seed ${seed}: filter-stress...`)
  const filterStress = await runFilterStressScenario(createClientRowModel, seed)
  console.log(`[hardcore] seed ${seed}: patch-storm...`)
  const patchStorm = await runPatchStormScenario(createClientRowModel, seed)
  console.log(`[hardcore] seed ${seed}: determinism...`)
  const determinism = await runDeterminismScenario(createClientRowModel, seed)
  const elapsedMs = performance.now() - startedAt
  const heapAfter = await sampleHeapUsed()
  const heapDeltaMb = toMb(heapAfter - heapBefore)

  runResults.push({
    seed,
    elapsedMs,
    heapDeltaMb,
    scenarios: {
      coldStart,
      sortStress,
      filterStress,
      patchStorm,
      determinism,
    },
  })

  const cold10k = coldStart["10000"]?.p95 ?? 0
  const cold50k = coldStart["50000"]?.p95 ?? 0
  const cold100k = coldStart["100000"]?.p95 ?? 0
  if (cold10k > PERF_BUDGET_MAX_COLD_START_10K_P95_MS) {
    budgetErrors.push(
      `seed ${seed}: cold-start[10k] p95 ${cold10k.toFixed(3)}ms exceeds PERF_BUDGET_MAX_COLD_START_10K_P95_MS=${PERF_BUDGET_MAX_COLD_START_10K_P95_MS}ms`,
    )
  }
  if (cold50k > PERF_BUDGET_MAX_COLD_START_50K_P95_MS) {
    budgetErrors.push(
      `seed ${seed}: cold-start[50k] p95 ${cold50k.toFixed(3)}ms exceeds PERF_BUDGET_MAX_COLD_START_50K_P95_MS=${PERF_BUDGET_MAX_COLD_START_50K_P95_MS}ms`,
    )
  }
  if (cold100k > PERF_BUDGET_MAX_COLD_START_100K_P95_MS) {
    budgetErrors.push(
      `seed ${seed}: cold-start[100k] p95 ${cold100k.toFixed(3)}ms exceeds PERF_BUDGET_MAX_COLD_START_100K_P95_MS=${PERF_BUDGET_MAX_COLD_START_100K_P95_MS}ms`,
    )
  }
  if (sortStress.latencyMs.p95 > PERF_BUDGET_MAX_SORT_STRESS_P95_MS) {
    budgetErrors.push(
      `seed ${seed}: sort-stress p95 ${sortStress.latencyMs.p95.toFixed(3)}ms exceeds PERF_BUDGET_MAX_SORT_STRESS_P95_MS=${PERF_BUDGET_MAX_SORT_STRESS_P95_MS}ms`,
    )
  }
  if (sortStress.latencyMs.p99 > PERF_BUDGET_MAX_SORT_STRESS_P99_MS) {
    budgetErrors.push(
      `seed ${seed}: sort-stress p99 ${sortStress.latencyMs.p99.toFixed(3)}ms exceeds PERF_BUDGET_MAX_SORT_STRESS_P99_MS=${PERF_BUDGET_MAX_SORT_STRESS_P99_MS}ms`,
    )
  }
  if (filterStress.match30.latencyMs.p95 > PERF_BUDGET_MAX_FILTER_30_P95_MS) {
    budgetErrors.push(
      `seed ${seed}: filter[30%] p95 ${filterStress.match30.latencyMs.p95.toFixed(3)}ms exceeds PERF_BUDGET_MAX_FILTER_30_P95_MS=${PERF_BUDGET_MAX_FILTER_30_P95_MS}ms`,
    )
  }
  if (filterStress.match1.latencyMs.p95 > PERF_BUDGET_MAX_FILTER_1_P95_MS) {
    budgetErrors.push(
      `seed ${seed}: filter[1%] p95 ${filterStress.match1.latencyMs.p95.toFixed(3)}ms exceeds PERF_BUDGET_MAX_FILTER_1_P95_MS=${PERF_BUDGET_MAX_FILTER_1_P95_MS}ms`,
    )
  }
  if (filterStress.match0.latencyMs.p95 > PERF_BUDGET_MAX_FILTER_0_P95_MS) {
    budgetErrors.push(
      `seed ${seed}: filter[0%] p95 ${filterStress.match0.latencyMs.p95.toFixed(3)}ms exceeds PERF_BUDGET_MAX_FILTER_0_P95_MS=${PERF_BUDGET_MAX_FILTER_0_P95_MS}ms`,
    )
  }
  if (patchStorm.patchTotalMs > PERF_BUDGET_MAX_PATCH_STORM_TOTAL_MS) {
    budgetErrors.push(
      `seed ${seed}: patch-storm total ${patchStorm.patchTotalMs.toFixed(3)}ms exceeds PERF_BUDGET_MAX_PATCH_STORM_TOTAL_MS=${PERF_BUDGET_MAX_PATCH_STORM_TOTAL_MS}ms`,
    )
  }
  if (patchStorm.reapplyMs > PERF_BUDGET_MAX_PATCH_REAPPLY_MS) {
    budgetErrors.push(
      `seed ${seed}: patch-storm reapply ${patchStorm.reapplyMs.toFixed(3)}ms exceeds PERF_BUDGET_MAX_PATCH_REAPPLY_MS=${PERF_BUDGET_MAX_PATCH_REAPPLY_MS}ms`,
    )
  }
  if (patchStorm.throughputRowsPerSec < PERF_BUDGET_MIN_PATCH_THROUGHPUT_ROWS_PER_SEC) {
    budgetErrors.push(
      `seed ${seed}: patch throughput ${patchStorm.throughputRowsPerSec.toFixed(3)} rows/sec below PERF_BUDGET_MIN_PATCH_THROUGHPUT_ROWS_PER_SEC=${PERF_BUDGET_MIN_PATCH_THROUGHPUT_ROWS_PER_SEC}`,
    )
  }
  if (PERF_BUDGET_ENFORCE_DETERMINISM && !determinism.matches) {
    budgetErrors.push(`seed ${seed}: determinism hash mismatch (${determinism.hashA} != ${determinism.hashB})`)
  }
}

const aggregateElapsed = stats(runResults.map(run => run.elapsedMs))
const aggregateHeap = stats(runResults.map(run => run.heapDeltaMb))
const aggregateSortP95 = stats(runResults.map(run => run.scenarios.sortStress.latencyMs.p95))
const aggregateSortP99 = stats(runResults.map(run => run.scenarios.sortStress.latencyMs.p99))
const aggregateFilter30P95 = stats(runResults.map(run => run.scenarios.filterStress.match30.latencyMs.p95))
const aggregateFilter1P95 = stats(runResults.map(run => run.scenarios.filterStress.match1.latencyMs.p95))
const aggregateFilter0P95 = stats(runResults.map(run => run.scenarios.filterStress.match0.latencyMs.p95))
const aggregatePatchTotal = stats(runResults.map(run => run.scenarios.patchStorm.patchTotalMs))
const aggregatePatchReapply = stats(runResults.map(run => run.scenarios.patchStorm.reapplyMs))
const aggregatePatchThroughput = stats(runResults.map(run => run.scenarios.patchStorm.throughputRowsPerSec))

if (aggregateElapsed.p95 > PERF_BUDGET_TOTAL_MS) {
  budgetErrors.push(
    `aggregate elapsed p95 ${aggregateElapsed.p95.toFixed(3)}ms exceeds PERF_BUDGET_TOTAL_MS=${PERF_BUDGET_TOTAL_MS}ms`,
  )
}
if (shouldEnforceVariance(aggregateElapsed)) {
  if (aggregateElapsed.cvPct > PERF_BUDGET_MAX_VARIANCE_PCT) {
    budgetErrors.push(
      `elapsed CV ${aggregateElapsed.cvPct.toFixed(2)}% exceeds PERF_BUDGET_MAX_VARIANCE_PCT=${PERF_BUDGET_MAX_VARIANCE_PCT}%`,
    )
  }
} else if (PERF_BUDGET_MAX_VARIANCE_PCT !== Number.POSITIVE_INFINITY) {
  varianceSkippedChecks.push(
    `elapsed CV gate skipped (mean ${aggregateElapsed.mean.toFixed(3)}ms < PERF_BUDGET_VARIANCE_MIN_MEAN_MS=${PERF_BUDGET_VARIANCE_MIN_MEAN_MS}ms)`,
  )
}

for (const aggregate of [
  { name: "sort-stress p95", stat: aggregateSortP95 },
  { name: "sort-stress p99", stat: aggregateSortP99 },
  { name: "filter[30%] p95", stat: aggregateFilter30P95 },
  { name: "filter[1%] p95", stat: aggregateFilter1P95 },
  { name: "filter[0%] p95", stat: aggregateFilter0P95 },
  { name: "patch-storm total", stat: aggregatePatchTotal },
  { name: "patch-storm reapply", stat: aggregatePatchReapply },
  { name: "patch throughput", stat: aggregatePatchThroughput },
]) {
  if (PERF_BUDGET_MAX_VARIANCE_PCT === Number.POSITIVE_INFINITY) {
    continue
  }
  if (aggregate.stat.mean < PERF_BUDGET_VARIANCE_MIN_MEAN_MS) {
    varianceSkippedChecks.push(
      `${aggregate.name} CV gate skipped (mean ${aggregate.stat.mean.toFixed(3)}ms < PERF_BUDGET_VARIANCE_MIN_MEAN_MS=${PERF_BUDGET_VARIANCE_MIN_MEAN_MS}ms)`,
    )
    continue
  }
  if (aggregate.stat.cvPct > PERF_BUDGET_MAX_VARIANCE_PCT) {
    budgetErrors.push(
      `${aggregate.name} CV ${aggregate.stat.cvPct.toFixed(2)}% exceeds PERF_BUDGET_MAX_VARIANCE_PCT=${PERF_BUDGET_MAX_VARIANCE_PCT}%`,
    )
  }
}

const heapWorstCase = Math.max(aggregateHeap.max, 0)
if (heapWorstCase > PERF_BUDGET_HEAP_EPSILON_MB && heapWorstCase > PERF_BUDGET_MAX_HEAP_DELTA_MB) {
  budgetErrors.push(
    `heap delta ${heapWorstCase.toFixed(2)}MB exceeds PERF_BUDGET_MAX_HEAP_DELTA_MB=${PERF_BUDGET_MAX_HEAP_DELTA_MB}MB`,
  )
}

const summary = {
  benchmark: "datagrid-hardcore",
  generatedAt: new Date().toISOString(),
  config: {
    seeds: BENCH_SEEDS,
    warmupRuns: BENCH_WARMUP_RUNS,
    coldStart: {
      rowCounts: COLD_START_ROW_COUNTS,
      iterations: COLD_START_ITERATIONS,
    },
    sortStress: {
      rowCount: SORT_STRESS_ROW_COUNT,
      iterations: SORT_STRESS_ITERATIONS,
      viewport: SORT_STRESS_VIEWPORT,
    },
    filterStress: {
      rowCount: FILTER_STRESS_ROW_COUNT,
      iterations: FILTER_STRESS_ITERATIONS,
      viewport: FILTER_STRESS_VIEWPORT,
    },
    patchStorm: {
      rowCount: PATCH_STORM_ROW_COUNT,
      iterations: PATCH_STORM_ITERATIONS,
      rowsPerIteration: PATCH_STORM_ROWS_PER_ITERATION,
    },
    determinism: {
      rowCount: DETERMINISM_ROW_COUNT,
      patchIterations: DETERMINISM_PATCH_ITERATIONS,
      patchRowsPerIteration: DETERMINISM_PATCH_ROWS_PER_ITERATION,
    },
  },
  budgets: {
    totalMs: PERF_BUDGET_TOTAL_MS,
    maxVariancePct: PERF_BUDGET_MAX_VARIANCE_PCT,
    maxHeapDeltaMb: PERF_BUDGET_MAX_HEAP_DELTA_MB,
    maxColdStart10kP95Ms: PERF_BUDGET_MAX_COLD_START_10K_P95_MS,
    maxColdStart50kP95Ms: PERF_BUDGET_MAX_COLD_START_50K_P95_MS,
    maxColdStart100kP95Ms: PERF_BUDGET_MAX_COLD_START_100K_P95_MS,
    maxSortStressP95Ms: PERF_BUDGET_MAX_SORT_STRESS_P95_MS,
    maxSortStressP99Ms: PERF_BUDGET_MAX_SORT_STRESS_P99_MS,
    maxFilter30P95Ms: PERF_BUDGET_MAX_FILTER_30_P95_MS,
    maxFilter1P95Ms: PERF_BUDGET_MAX_FILTER_1_P95_MS,
    maxFilter0P95Ms: PERF_BUDGET_MAX_FILTER_0_P95_MS,
    maxPatchStormTotalMs: PERF_BUDGET_MAX_PATCH_STORM_TOTAL_MS,
    maxPatchReapplyMs: PERF_BUDGET_MAX_PATCH_REAPPLY_MS,
    minPatchThroughputRowsPerSec: PERF_BUDGET_MIN_PATCH_THROUGHPUT_ROWS_PER_SEC,
    enforceDeterminism: PERF_BUDGET_ENFORCE_DETERMINISM,
  },
  variancePolicy: {
    minMeanMsForCvGate: PERF_BUDGET_VARIANCE_MIN_MEAN_MS,
  },
  varianceSkippedChecks,
  aggregate: {
    elapsedMs: aggregateElapsed,
    heapDeltaMb: aggregateHeap,
    sortStressP95Ms: aggregateSortP95,
    sortStressP99Ms: aggregateSortP99,
    filter30P95Ms: aggregateFilter30P95,
    filter1P95Ms: aggregateFilter1P95,
    filter0P95Ms: aggregateFilter0P95,
    patchStormTotalMs: aggregatePatchTotal,
    patchReapplyMs: aggregatePatchReapply,
    patchThroughputRowsPerSec: aggregatePatchThroughput,
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

if (runResults.length > 0) {
  console.log("\nHardcore benchmark summary")
  console.log(`elapsed p50=${aggregateElapsed.p50.toFixed(2)}ms p95=${aggregateElapsed.p95.toFixed(2)}ms p99=${aggregateElapsed.p99.toFixed(2)}ms`)
  console.log(
    `patch throughput p50=${aggregatePatchThroughput.p50.toFixed(1)} rows/sec p95=${aggregatePatchThroughput.p95.toFixed(1)} rows/sec`,
  )
  const determinismSummary = runResults
    .map(run => `${run.seed}:${run.scenarios.determinism.matches ? "ok" : "mismatch"}`)
    .join(" ")
  console.log(`determinism: ${determinismSummary}`)
}

if (budgetErrors.length > 0) {
  console.error("\nHardcore benchmark budget check failed:")
  for (const error of budgetErrors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}
