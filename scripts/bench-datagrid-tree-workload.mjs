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
const BENCH_MEASUREMENT_BATCH_SIZE = Number.parseInt(process.env.BENCH_TREE_MEASUREMENT_BATCH_SIZE ?? "4", 10)
const BENCH_WARMUP_BATCHES = Number.parseInt(process.env.BENCH_TREE_WARMUP_BATCHES ?? "1", 10)

const TREE_ROW_COUNT = Number.parseInt(process.env.BENCH_TREE_ROW_COUNT ?? "70000", 10)
const TREE_VIEWPORT_SIZE = Number.parseInt(process.env.BENCH_TREE_VIEWPORT_SIZE ?? "180", 10)
const TREE_EXPAND_ITERATIONS = Number.parseInt(process.env.BENCH_TREE_EXPAND_ITERATIONS ?? "120", 10)
const TREE_FILTER_SORT_ITERATIONS = Number.parseInt(process.env.BENCH_TREE_FILTER_SORT_ITERATIONS ?? "90", 10)
const TREE_GROUP_KEY_SAMPLE_LIMIT = Number.parseInt(process.env.BENCH_TREE_GROUP_KEY_SAMPLE_LIMIT ?? "512", 10)
const TREE_WARMUP_EXPAND_ITERATIONS = Number.parseInt(
  process.env.BENCH_TREE_WARMUP_EXPAND_ITERATIONS ?? "12",
  10,
)
const TREE_WARMUP_FILTER_SORT_ITERATIONS = Number.parseInt(
  process.env.BENCH_TREE_WARMUP_FILTER_SORT_ITERATIONS ?? "8",
  10,
)
const TREE_PROGRESS_EVERY = Number.parseInt(process.env.BENCH_TREE_PROGRESS_EVERY ?? "30", 10)

const PERF_BUDGET_TOTAL_MS = Number.parseFloat(process.env.PERF_BUDGET_TOTAL_MS ?? "Infinity")
const PERF_BUDGET_MAX_EXPAND_BURST_P95_MS = Number.parseFloat(
  process.env.PERF_BUDGET_MAX_EXPAND_BURST_P95_MS ?? "Infinity",
)
const PERF_BUDGET_MAX_EXPAND_BURST_P99_MS = Number.parseFloat(
  process.env.PERF_BUDGET_MAX_EXPAND_BURST_P99_MS ?? "Infinity",
)
const PERF_BUDGET_MAX_FILTER_SORT_BURST_P95_MS = Number.parseFloat(
  process.env.PERF_BUDGET_MAX_FILTER_SORT_BURST_P95_MS ?? "Infinity",
)
const PERF_BUDGET_MAX_FILTER_SORT_BURST_P99_MS = Number.parseFloat(
  process.env.PERF_BUDGET_MAX_FILTER_SORT_BURST_P99_MS ?? "Infinity",
)
const PERF_BUDGET_MAX_VARIANCE_PCT = Number.parseFloat(process.env.PERF_BUDGET_MAX_VARIANCE_PCT ?? "Infinity")
const PERF_BUDGET_VARIANCE_MIN_MEAN_MS = Number.parseFloat(process.env.PERF_BUDGET_VARIANCE_MIN_MEAN_MS ?? "0.5")
const PERF_BUDGET_MAX_HEAP_DELTA_MB = Number.parseFloat(process.env.PERF_BUDGET_MAX_HEAP_DELTA_MB ?? "Infinity")
const PERF_BUDGET_HEAP_EPSILON_MB = Number.parseFloat(process.env.PERF_BUDGET_HEAP_EPSILON_MB ?? "1")
const PERF_BUDGET_MAX_SEED_FAILURES = Number.parseInt(process.env.PERF_BUDGET_MAX_SEED_FAILURES ?? "0", 10)

const BENCH_OUTPUT_JSON = process.env.BENCH_OUTPUT_JSON ? resolve(process.env.BENCH_OUTPUT_JSON) : null

const OWNERS = ["NOC", "SRE", "Core", "Platform", "Payments", "Data"]
const REGIONS = ["us-east", "us-west", "eu-central", "ap-south", "sa-east"]

assertPositiveInteger(TREE_ROW_COUNT, "BENCH_TREE_ROW_COUNT")
assertPositiveInteger(TREE_VIEWPORT_SIZE, "BENCH_TREE_VIEWPORT_SIZE")
assertPositiveInteger(TREE_EXPAND_ITERATIONS, "BENCH_TREE_EXPAND_ITERATIONS")
assertPositiveInteger(TREE_FILTER_SORT_ITERATIONS, "BENCH_TREE_FILTER_SORT_ITERATIONS")
assertPositiveInteger(TREE_GROUP_KEY_SAMPLE_LIMIT, "BENCH_TREE_GROUP_KEY_SAMPLE_LIMIT")
assertPositiveInteger(TREE_WARMUP_EXPAND_ITERATIONS, "BENCH_TREE_WARMUP_EXPAND_ITERATIONS")
assertPositiveInteger(TREE_WARMUP_FILTER_SORT_ITERATIONS, "BENCH_TREE_WARMUP_FILTER_SORT_ITERATIONS")
assertPositiveInteger(TREE_PROGRESS_EVERY, "BENCH_TREE_PROGRESS_EVERY")
assertPositiveInteger(BENCH_MEASUREMENT_BATCH_SIZE, "BENCH_TREE_MEASUREMENT_BATCH_SIZE")
assertNonNegativeInteger(BENCH_WARMUP_BATCHES, "BENCH_TREE_WARMUP_BATCHES")
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
if (!Number.isFinite(PERF_BUDGET_MAX_SEED_FAILURES) || PERF_BUDGET_MAX_SEED_FAILURES < 0) {
  throw new Error("PERF_BUDGET_MAX_SEED_FAILURES must be a non-negative integer")
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

function runOptionalGc() {
  const gcRef = globalThis.gc
  if (typeof gcRef === "function") {
    gcRef()
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

function createTreeRows(count) {
  const rows = new Array(count)
  for (let index = 0; index < count; index += 1) {
    const org = `org-${Math.floor(index / 35000) % 3}`
    const region = `region-${Math.floor(index / 7000) % 5}`
    const domain = `domain-${Math.floor(index / 1400) % 5}`
    const service = `service-${Math.floor(index / 280) % 5}`
    const cluster = `cluster-${Math.floor(index / 56) % 5}`
    const shard = `shard-${Math.floor(index / 8) % 7}`
    rows[index] = {
      rowId: index,
      owner: OWNERS[index % OWNERS.length] ?? "NOC",
      region: REGIONS[index % REGIONS.length] ?? "us-east",
      latency: (index * 17) % 900,
      status: index % 3 === 0 ? "critical" : index % 3 === 1 ? "warning" : "ok",
      path: [org, region, domain, service, cluster, shard],
      serviceName: `${service}-${index % 11}`,
    }
  }
  return rows
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
  throw new Error("Unable to locate datagrid-core build artifacts. Run `pnpm --filter @affino/datagrid-core build`.")
}

function collectVisibleGroupKeys(model, limit = TREE_GROUP_KEY_SAMPLE_LIMIT) {
  const keys = new Set()
  const rowCount = model.getRowCount()
  if (rowCount <= 0) {
    return keys
  }
  const step = Math.max(TREE_VIEWPORT_SIZE, 64)
  let cursor = 0
  while (cursor < rowCount && keys.size < limit) {
    const range = normalizeRange(cursor, Math.min(rowCount - 1, cursor + TREE_VIEWPORT_SIZE))
    model.setViewportRange(range)
    const rows = model.getRowsInRange(range)
    for (const row of rows) {
      if (row?.kind !== "group") {
        continue
      }
      const key = row.groupMeta?.groupKey
      if (typeof key === "string" && key.length > 0) {
        keys.add(key)
        if (keys.size >= limit) {
          break
        }
      }
    }
    cursor += step
  }
  return keys
}

function collectGroupKeysFromExpansion(model, limit = TREE_GROUP_KEY_SAMPLE_LIMIT) {
  const expansionSnapshot =
    (typeof model.getGroupExpansion === "function" ? model.getGroupExpansion() : null) ??
    (typeof model.getSnapshot === "function" ? model.getSnapshot()?.groupExpansion : null) ??
    {}

  const keys = new Set()

  // Modern snapshot shape: { expandedByDefault, toggledGroupKeys[] }.
  if (
    expansionSnapshot &&
    typeof expansionSnapshot === "object" &&
    Array.isArray(expansionSnapshot.toggledGroupKeys)
  ) {
    for (const groupKey of expansionSnapshot.toggledGroupKeys) {
      if (typeof groupKey !== "string" || !groupKey) {
        continue
      }
      keys.add(groupKey)
      if (keys.size >= limit) {
        break
      }
    }
    return keys
  }

  // Legacy fallback shape: { [groupKey]: boolean }.
  for (const [groupKey, expanded] of Object.entries(expansionSnapshot)) {
    if (!expanded || typeof groupKey !== "string" || !groupKey) {
      continue
    }
    keys.add(groupKey)
    if (keys.size >= limit) {
      break
    }
  }
  return keys
}

function runExpandBurstScenario(createClientRowModel, rows, seed, options = {}) {
  const scenarioIterations =
    Number.isFinite(options.iterations) && options.iterations > 0
      ? Math.trunc(options.iterations)
      : TREE_EXPAND_ITERATIONS
  const scenarioWarmupBatches =
    Number.isFinite(options.warmupBatches) && options.warmupBatches >= 0
      ? Math.trunc(options.warmupBatches)
      : BENCH_WARMUP_BATCHES
  const progressEvery =
    Number.isFinite(options.progressEvery) && options.progressEvery > 0
      ? Math.trunc(options.progressEvery)
      : TREE_PROGRESS_EVERY
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : null

  const rng = createRng(seed)
  const model = createClientRowModel({
    rows,
    initialTreeData: {
      mode: "path",
      expandedByDefault: false,
      filterMode: "include-parents",
      getDataPath: row => row.path,
    },
  })
  const durations = []
  let checksum = 0

  try {
    model.setSortModel([{ key: "latency", direction: "desc" }])
    model.expandAllGroups()
    let warmGroupKeys = collectGroupKeysFromExpansion(model)
    if (!warmGroupKeys.size) {
      // Fallback for runtimes that do not expose expansion snapshot fully.
      warmGroupKeys = collectVisibleGroupKeys(model)
    }
    model.collapseAllGroups()
    const groupKeys = [...warmGroupKeys]
    if (!groupKeys.length) {
      throw new Error("Tree benchmark failed to collect group keys")
    }

    let viewportRange = normalizeRange(0, Math.min(model.getRowCount() - 1, TREE_VIEWPORT_SIZE))
    model.setViewportRange(viewportRange)

    const runOne = () => {
      const key = groupKeys[randomInt(rng, 0, groupKeys.length - 1)] ?? groupKeys[0]
      model.toggleGroup(String(key))

      const rowCount = Math.max(1, model.getRowCount())
      const maxStart = Math.max(0, rowCount - TREE_VIEWPORT_SIZE - 1)
      const start = randomInt(rng, 0, maxStart)
      viewportRange = normalizeRange(start, Math.min(rowCount - 1, start + TREE_VIEWPORT_SIZE))
      model.setViewportRange(viewportRange)
      const rowsInRange = model.getRowsInRange(viewportRange)
      checksum += rowsInRange.length + rowCount + start
    }

    for (let warmup = 0; warmup < scenarioWarmupBatches; warmup += 1) {
      for (let batch = 0; batch < BENCH_MEASUREMENT_BATCH_SIZE; batch += 1) {
        runOne()
      }
    }

    for (let iteration = 0; iteration < scenarioIterations; iteration += 1) {
      const startedAt = performance.now()
      for (let batch = 0; batch < BENCH_MEASUREMENT_BATCH_SIZE; batch += 1) {
        runOne()
      }
      durations.push((performance.now() - startedAt) / BENCH_MEASUREMENT_BATCH_SIZE)
      const completed = iteration + 1
      if (onProgress && (completed % progressEvery === 0 || completed === scenarioIterations)) {
        onProgress(completed, scenarioIterations)
      }
    }

    if (!Number.isFinite(checksum)) {
      throw new Error("Tree expand scenario checksum is invalid")
    }
    return {
      stat: stats(durations),
      sampleGroupCount: groupKeys.length,
    }
  } finally {
    model.dispose()
  }
}

function runFilterSortScenario(createClientRowModel, rows, seed, options = {}) {
  const scenarioIterations =
    Number.isFinite(options.iterations) && options.iterations > 0
      ? Math.trunc(options.iterations)
      : TREE_FILTER_SORT_ITERATIONS
  const scenarioWarmupBatches =
    Number.isFinite(options.warmupBatches) && options.warmupBatches >= 0
      ? Math.trunc(options.warmupBatches)
      : BENCH_WARMUP_BATCHES
  const progressEvery =
    Number.isFinite(options.progressEvery) && options.progressEvery > 0
      ? Math.trunc(options.progressEvery)
      : TREE_PROGRESS_EVERY
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : null

  const rng = createRng(seed + 9127)
  const model = createClientRowModel({
    rows,
    initialTreeData: {
      mode: "path",
      expandedByDefault: true,
      filterMode: "include-parents",
      getDataPath: row => row.path,
    },
  })
  const durations = []
  let checksum = 0
  let ownerIndex = 0
  let sortAsc = false

  try {
    const runOne = () => {
      ownerIndex = (ownerIndex + 1) % OWNERS.length
      sortAsc = !sortAsc

      const owner = OWNERS[ownerIndex] ?? "NOC"
      const region = REGIONS[ownerIndex % REGIONS.length] ?? "us-east"

      model.setFilterModel({
        columnFilters: {
          owner: [owner],
          region: [region],
        },
        advancedFilters: {},
      })
      model.setSortModel([{ key: "latency", direction: sortAsc ? "asc" : "desc" }])

      const rowCount = Math.max(1, model.getRowCount())
      const maxStart = Math.max(0, rowCount - TREE_VIEWPORT_SIZE - 1)
      const start = randomInt(rng, 0, maxStart)
      const range = normalizeRange(start, Math.min(rowCount - 1, start + TREE_VIEWPORT_SIZE))
      model.setViewportRange(range)
      const visible = model.getRowsInRange(range)
      checksum += visible.length + start + rowCount
    }

    for (let warmup = 0; warmup < scenarioWarmupBatches; warmup += 1) {
      for (let batch = 0; batch < BENCH_MEASUREMENT_BATCH_SIZE; batch += 1) {
        runOne()
      }
    }

    for (let iteration = 0; iteration < scenarioIterations; iteration += 1) {
      const startedAt = performance.now()
      for (let batch = 0; batch < BENCH_MEASUREMENT_BATCH_SIZE; batch += 1) {
        runOne()
      }
      durations.push((performance.now() - startedAt) / BENCH_MEASUREMENT_BATCH_SIZE)
      const completed = iteration + 1
      if (onProgress && (completed % progressEvery === 0 || completed === scenarioIterations)) {
        onProgress(completed, scenarioIterations)
      }
    }

    if (!Number.isFinite(checksum)) {
      throw new Error("Tree filter/sort scenario checksum is invalid")
    }
    return { stat: stats(durations) }
  } finally {
    model.dispose()
  }
}

const createClientRowModel = await loadFactory()
const sharedRows = createTreeRows(TREE_ROW_COUNT)
const runResults = []
const budgetErrors = []
const varianceSkippedChecks = []
const perSeedBudgetErrors = []

console.log("\nAffino DataGrid Tree Workload Benchmark")
console.log(
  `seeds=${BENCH_SEEDS.join(",")} rows=${TREE_ROW_COUNT} viewportSize=${TREE_VIEWPORT_SIZE} expandIterations=${TREE_EXPAND_ITERATIONS} filterSortIterations=${TREE_FILTER_SORT_ITERATIONS} warmupRuns=${BENCH_WARMUP_RUNS} batchSize=${BENCH_MEASUREMENT_BATCH_SIZE}`,
)

for (const seed of BENCH_SEEDS) {
  console.log(`\n[tree-workload] seed ${seed}: warmup...`)
  for (let warmup = 0; warmup < BENCH_WARMUP_RUNS; warmup += 1) {
    const warmupSeed = seed + (warmup + 1) * 4099
    runExpandBurstScenario(createClientRowModel, sharedRows, warmupSeed, {
      iterations: TREE_WARMUP_EXPAND_ITERATIONS,
      warmupBatches: 0,
    })
    runFilterSortScenario(createClientRowModel, sharedRows, warmupSeed, {
      iterations: TREE_WARMUP_FILTER_SORT_ITERATIONS,
      warmupBatches: 0,
    })
  }

  console.log(`[tree-workload] seed ${seed}: measure...`)
  runOptionalGc()
  const heapStart = process.memoryUsage().heapUsed
  const startedAt = performance.now()
  console.log(`[tree-workload] seed ${seed}: expand scenario...`)
  const expandBurst = runExpandBurstScenario(createClientRowModel, sharedRows, seed, {
    onProgress: (done, total) => {
      console.log(`[tree-workload] seed ${seed}: expand ${done}/${total}`)
    },
  })
  runOptionalGc()
  console.log(`[tree-workload] seed ${seed}: filter-sort scenario...`)
  const filterSortBurst = runFilterSortScenario(createClientRowModel, sharedRows, seed, {
    onProgress: (done, total) => {
      console.log(`[tree-workload] seed ${seed}: filter-sort ${done}/${total}`)
    },
  })
  const elapsed = performance.now() - startedAt
  const heapDeltaMb = (process.memoryUsage().heapUsed - heapStart) / (1024 * 1024)

  runResults.push({
    seed,
    elapsedMs: elapsed,
    heapDeltaMb,
    scenarios: { expandBurst, filterSortBurst },
  })

  console.log(`\nSeed ${seed}`)
  console.table([
    {
      scenario: "expand-burst",
      p50Ms: expandBurst.stat.p50.toFixed(3),
      p95Ms: expandBurst.stat.p95.toFixed(3),
      p99Ms: expandBurst.stat.p99.toFixed(3),
      cvPct: expandBurst.stat.cvPct.toFixed(2),
      sampledGroupKeys: expandBurst.sampleGroupCount,
    },
    {
      scenario: "filter-sort-burst",
      p50Ms: filterSortBurst.stat.p50.toFixed(3),
      p95Ms: filterSortBurst.stat.p95.toFixed(3),
      p99Ms: filterSortBurst.stat.p99.toFixed(3),
      cvPct: filterSortBurst.stat.cvPct.toFixed(2),
      sampledGroupKeys: "-",
    },
  ])
  console.log(`Total elapsed: ${elapsed.toFixed(2)}ms`)
  console.log(`Heap delta: ${heapDeltaMb.toFixed(2)}MB`)

  const seedErrors = []

  if (PERF_BUDGET_TOTAL_MS !== Number.POSITIVE_INFINITY && elapsed > PERF_BUDGET_TOTAL_MS) {
    seedErrors.push(`total elapsed ${elapsed.toFixed(2)}ms exceeded PERF_BUDGET_TOTAL_MS=${PERF_BUDGET_TOTAL_MS}`)
  }
  if (
    PERF_BUDGET_MAX_EXPAND_BURST_P95_MS !== Number.POSITIVE_INFINITY &&
    expandBurst.stat.p95 > PERF_BUDGET_MAX_EXPAND_BURST_P95_MS
  ) {
    seedErrors.push(
      `expand-burst p95 ${expandBurst.stat.p95.toFixed(3)}ms exceeded PERF_BUDGET_MAX_EXPAND_BURST_P95_MS=${PERF_BUDGET_MAX_EXPAND_BURST_P95_MS}`,
    )
  }
  if (
    PERF_BUDGET_MAX_EXPAND_BURST_P99_MS !== Number.POSITIVE_INFINITY &&
    expandBurst.stat.p99 > PERF_BUDGET_MAX_EXPAND_BURST_P99_MS
  ) {
    seedErrors.push(
      `expand-burst p99 ${expandBurst.stat.p99.toFixed(3)}ms exceeded PERF_BUDGET_MAX_EXPAND_BURST_P99_MS=${PERF_BUDGET_MAX_EXPAND_BURST_P99_MS}`,
    )
  }
  if (
    PERF_BUDGET_MAX_FILTER_SORT_BURST_P95_MS !== Number.POSITIVE_INFINITY &&
    filterSortBurst.stat.p95 > PERF_BUDGET_MAX_FILTER_SORT_BURST_P95_MS
  ) {
    seedErrors.push(
      `filter-sort-burst p95 ${filterSortBurst.stat.p95.toFixed(3)}ms exceeded PERF_BUDGET_MAX_FILTER_SORT_BURST_P95_MS=${PERF_BUDGET_MAX_FILTER_SORT_BURST_P95_MS}`,
    )
  }
  if (
    PERF_BUDGET_MAX_FILTER_SORT_BURST_P99_MS !== Number.POSITIVE_INFINITY &&
    filterSortBurst.stat.p99 > PERF_BUDGET_MAX_FILTER_SORT_BURST_P99_MS
  ) {
    seedErrors.push(
      `filter-sort-burst p99 ${filterSortBurst.stat.p99.toFixed(3)}ms exceeded PERF_BUDGET_MAX_FILTER_SORT_BURST_P99_MS=${PERF_BUDGET_MAX_FILTER_SORT_BURST_P99_MS}`,
    )
  }
  if (shouldEnforceVariance(expandBurst.stat) && expandBurst.stat.cvPct > PERF_BUDGET_MAX_VARIANCE_PCT) {
    seedErrors.push(
      `expand-burst CV ${expandBurst.stat.cvPct.toFixed(2)}% exceeded PERF_BUDGET_MAX_VARIANCE_PCT=${PERF_BUDGET_MAX_VARIANCE_PCT}%`,
    )
  } else if (!shouldEnforceVariance(expandBurst.stat)) {
    varianceSkippedChecks.push({
      scenario: "expand-burst",
      seed,
      meanMs: expandBurst.stat.mean,
      thresholdMs: PERF_BUDGET_VARIANCE_MIN_MEAN_MS,
    })
  }
  if (shouldEnforceVariance(filterSortBurst.stat) && filterSortBurst.stat.cvPct > PERF_BUDGET_MAX_VARIANCE_PCT) {
    seedErrors.push(
      `filter-sort-burst CV ${filterSortBurst.stat.cvPct.toFixed(2)}% exceeded PERF_BUDGET_MAX_VARIANCE_PCT=${PERF_BUDGET_MAX_VARIANCE_PCT}%`,
    )
  } else if (!shouldEnforceVariance(filterSortBurst.stat)) {
    varianceSkippedChecks.push({
      scenario: "filter-sort-burst",
      seed,
      meanMs: filterSortBurst.stat.mean,
      thresholdMs: PERF_BUDGET_VARIANCE_MIN_MEAN_MS,
    })
  }
  if (
    PERF_BUDGET_MAX_HEAP_DELTA_MB !== Number.POSITIVE_INFINITY &&
    heapDeltaMb - PERF_BUDGET_HEAP_EPSILON_MB > PERF_BUDGET_MAX_HEAP_DELTA_MB
  ) {
    seedErrors.push(
      `heap delta ${heapDeltaMb.toFixed(2)}MB exceeded PERF_BUDGET_MAX_HEAP_DELTA_MB=${PERF_BUDGET_MAX_HEAP_DELTA_MB}MB`,
    )
  }

  perSeedBudgetErrors.push({ seed, errors: seedErrors })
}

const failingSeedChecks = perSeedBudgetErrors.filter(entry => entry.errors.length > 0)
if (failingSeedChecks.length > PERF_BUDGET_MAX_SEED_FAILURES) {
  for (const entry of failingSeedChecks) {
    for (const error of entry.errors) {
      budgetErrors.push(`seed ${entry.seed}: ${error}`)
    }
  }
}

const aggregate = (() => {
  const elapsedStat = stats(runResults.map(run => run.elapsedMs))
  const heapStat = stats(runResults.map(run => run.heapDeltaMb))
  const expandStat = stats(runResults.map(run => run.scenarios.expandBurst.stat.mean))
  const filterSortStat = stats(runResults.map(run => run.scenarios.filterSortBurst.stat.mean))
  return {
    elapsedMs: elapsedStat,
    heapDeltaMb: heapStat,
    expandBurstMeanMs: expandStat,
    filterSortBurstMeanMs: filterSortStat,
  }
})()

const summary = {
  benchmark: "Affino DataGrid Tree Workload Benchmark",
  generatedAt: new Date().toISOString(),
  config: {
    seeds: BENCH_SEEDS,
    rows: TREE_ROW_COUNT,
    viewportSize: TREE_VIEWPORT_SIZE,
    expandIterations: TREE_EXPAND_ITERATIONS,
    filterSortIterations: TREE_FILTER_SORT_ITERATIONS,
    measurementBatchSize: BENCH_MEASUREMENT_BATCH_SIZE,
    warmupRuns: BENCH_WARMUP_RUNS,
  },
  runs: runResults,
  aggregate,
  budgets: {
    totalMs: PERF_BUDGET_TOTAL_MS,
    maxExpandBurstP95Ms: PERF_BUDGET_MAX_EXPAND_BURST_P95_MS,
    maxExpandBurstP99Ms: PERF_BUDGET_MAX_EXPAND_BURST_P99_MS,
    maxFilterSortBurstP95Ms: PERF_BUDGET_MAX_FILTER_SORT_BURST_P95_MS,
    maxFilterSortBurstP99Ms: PERF_BUDGET_MAX_FILTER_SORT_BURST_P99_MS,
    maxVariancePct: PERF_BUDGET_MAX_VARIANCE_PCT,
    varianceMinMeanMs: PERF_BUDGET_VARIANCE_MIN_MEAN_MS,
    maxHeapDeltaMb: PERF_BUDGET_MAX_HEAP_DELTA_MB,
    heapEpsilonMb: PERF_BUDGET_HEAP_EPSILON_MB,
    maxSeedFailures: PERF_BUDGET_MAX_SEED_FAILURES,
  },
  perSeedBudgetErrors,
  varianceSkippedChecks,
  budgetErrors,
  ok: budgetErrors.length === 0,
}

if (BENCH_OUTPUT_JSON) {
  mkdirSync(dirname(BENCH_OUTPUT_JSON), { recursive: true })
  writeFileSync(BENCH_OUTPUT_JSON, JSON.stringify(summary, null, 2))
  console.log(`Benchmark summary written: ${BENCH_OUTPUT_JSON}`)
}

if (budgetErrors.length > 0) {
  console.error("\nTree workload benchmark budget check failed:")
  for (const error of budgetErrors) {
    console.error(`- ${error}`)
  }
  process.exitCode = 1
}
