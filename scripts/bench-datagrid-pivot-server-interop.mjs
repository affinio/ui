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

const BENCH_ROW_COUNT = Number.parseInt(process.env.BENCH_SERVER_PIVOT_ROW_COUNT ?? "30000", 10)
const BENCH_ITERATIONS = Number.parseInt(process.env.BENCH_SERVER_PIVOT_ITERATIONS ?? "80", 10)
const BENCH_VIEWPORT_SIZE = Number.parseInt(process.env.BENCH_SERVER_PIVOT_VIEWPORT_SIZE ?? "200", 10)
const BENCH_WARMUP_RUNS = Number.parseInt(process.env.BENCH_WARMUP_RUNS ?? "1", 10)
const BENCH_OUTPUT_JSON = process.env.BENCH_OUTPUT_JSON
  ? resolve(process.env.BENCH_OUTPUT_JSON)
  : resolve("artifacts/performance/bench-datagrid-pivot-server-interop.json")

const PERF_BUDGET_TOTAL_MS = Number.parseFloat(process.env.PERF_BUDGET_TOTAL_MS ?? "Infinity")
const PERF_BUDGET_MAX_SERVER_PIVOT_PULL_P95_MS = Number.parseFloat(process.env.PERF_BUDGET_MAX_SERVER_PIVOT_PULL_P95_MS ?? "Infinity")
const PERF_BUDGET_MAX_EXPORT_INTEROP_P95_MS = Number.parseFloat(process.env.PERF_BUDGET_MAX_EXPORT_INTEROP_P95_MS ?? "Infinity")
const PERF_BUDGET_MAX_IMPORT_LAYOUT_P95_MS = Number.parseFloat(process.env.PERF_BUDGET_MAX_IMPORT_LAYOUT_P95_MS ?? "Infinity")
const PERF_BUDGET_MAX_DRILLDOWN_P95_MS = Number.parseFloat(process.env.PERF_BUDGET_MAX_DRILLDOWN_P95_MS ?? "Infinity")
const PERF_BUDGET_MIN_INTEROP_ROWS = Number.parseInt(process.env.PERF_BUDGET_MIN_INTEROP_ROWS ?? "0", 10)
const PERF_BUDGET_MIN_PIVOT_COLUMNS = Number.parseInt(process.env.PERF_BUDGET_MIN_PIVOT_COLUMNS ?? "0", 10)
const PERF_BUDGET_MAX_VARIANCE_PCT = Number.parseFloat(process.env.PERF_BUDGET_MAX_VARIANCE_PCT ?? "Infinity")
const PERF_BUDGET_VARIANCE_MIN_MEAN_MS = Number.parseFloat(process.env.PERF_BUDGET_VARIANCE_MIN_MEAN_MS ?? "0.5")
const PERF_BUDGET_MAX_HEAP_DELTA_MB = Number.parseFloat(process.env.PERF_BUDGET_MAX_HEAP_DELTA_MB ?? "Infinity")
const PERF_BUDGET_HEAP_EPSILON_MB = Number.parseFloat(process.env.PERF_BUDGET_HEAP_EPSILON_MB ?? "1")

assertPositiveInteger(BENCH_ROW_COUNT, "BENCH_SERVER_PIVOT_ROW_COUNT")
assertPositiveInteger(BENCH_ITERATIONS, "BENCH_SERVER_PIVOT_ITERATIONS")
assertPositiveInteger(BENCH_VIEWPORT_SIZE, "BENCH_SERVER_PIVOT_VIEWPORT_SIZE")
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
      revenue: Math.floor(rng() * 100_000),
      orders: (index % 20) + 1,
      latency: Math.floor(rng() * 1400),
      bucketA: `A-${index % 20}`,
      bucketB: `B-${(index * 3) % 30}`,
    }
  }
  return rows
}

function getPivotModels() {
  return [
    {
      rows: ["region"],
      columns: ["year"],
      values: [{ field: "revenue", agg: "sum" }],
      grandTotal: true,
      columnGrandTotal: true,
    },
    {
      rows: ["region", "team"],
      columns: ["year", "quarter"],
      values: [
        { field: "revenue", agg: "sum" },
        { field: "orders", agg: "count" },
      ],
      grandTotal: true,
      columnGrandTotal: true,
    },
    {
      rows: ["team"],
      columns: ["bucketA", "bucketB"],
      values: [{ field: "latency", agg: "avg" }],
      grandTotal: false,
      columnGrandTotal: false,
    },
  ]
}

async function loadFactories() {
  const candidates = [
    resolve("packages/datagrid-core/dist/src/public.js"),
    resolve("packages/datagrid-core/dist/src/models/index.js"),
  ]
  const sourceCandidates = [
    resolve("packages/datagrid-core/src/public.ts"),
    resolve("packages/datagrid-core/src/models/index.ts"),
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
      if (
        typeof module.createClientRowModel === "function" &&
        typeof module.createDataSourceBackedRowModel === "function" &&
        typeof module.createDataGridColumnModel === "function" &&
        typeof module.createDataGridCore === "function" &&
        typeof module.createDataGridApi === "function"
      ) {
        return {
          createClientRowModel: module.createClientRowModel,
          createDataSourceBackedRowModel: module.createDataSourceBackedRowModel,
          createDataGridColumnModel: module.createDataGridColumnModel,
          createDataGridCore: module.createDataGridCore,
          createDataGridApi: module.createDataGridApi,
        }
      }
    } catch (error) {
      lastError = error
    }
  }

  if (lastError) {
    throw new Error(`Failed to load datagrid factories: ${String(lastError)}`)
  }
  throw new Error("Unable to locate datagrid-core build artifacts. Run `pnpm --filter @affino/datagrid-core build`.")
}

async function waitForPivotMaterialized(model, timeoutMs = 3000) {
  const startedAt = performance.now()
  while (performance.now() - startedAt <= timeoutMs) {
    const snapshot = model.getSnapshot()
    const hasRows = snapshot.rowCount > 0
    const hasPivotColumns = Array.isArray(snapshot.pivotColumns) && snapshot.pivotColumns.length > 0
    if (hasRows && hasPivotColumns) {
      return snapshot
    }
    await sleepTick()
  }
  return model.getSnapshot()
}

async function runServerPivotInteropScenario(factories, seed) {
  const {
    createClientRowModel,
    createDataSourceBackedRowModel,
    createDataGridColumnModel,
    createDataGridCore,
    createDataGridApi,
  } = factories

  const sourceRows = createRows(BENCH_ROW_COUNT, seed)
  const pivotModels = getPivotModels()

  const pullDurations = []
  const exportDurations = []
  const importDurations = []
  const drilldownDurations = []
  const interopRowCounts = []
  const pivotColumnCounts = []

  const dataSource = {
    async pull(request) {
      const pullStart = performance.now()
      const serverBuilder = createClientRowModel({
        rows: sourceRows,
        resolveRowId: row => row.id,
        initialSortModel: request.sortModel,
        initialFilterModel: request.filterModel,
        initialGroupBy: request.groupBy,
        initialGroupExpansion: request.groupExpansion,
        initialPivotModel: request.pivot?.pivotModel ?? null,
        initialAggregationModel: request.pivot?.aggregationModel ?? null,
      })
      serverBuilder.refresh("manual")
      const snapshot = serverBuilder.getSnapshot()
      const start = Math.max(0, request.range.start)
      const end = Math.max(start, Math.min(Math.max(0, snapshot.rowCount - 1), request.range.end))
      const rows = snapshot.rowCount > 0
        ? serverBuilder.getRowsInRange({ start, end }).map(row => ({
          index: row.displayIndex,
          rowId: row.rowId,
          kind: row.kind,
          groupMeta: row.groupMeta,
          state: row.state,
          row: row.data,
        }))
        : []
      const result = {
        rows,
        total: snapshot.rowCount,
        pivotColumns: snapshot.pivotColumns ?? [],
      }
      serverBuilder.dispose()
      pullDurations.push(performance.now() - pullStart)
      return result
    },
  }

  const rowModel = createDataSourceBackedRowModel({
    dataSource,
    resolveRowId: row => row.id,
    initialTotal: BENCH_ROW_COUNT,
    initialPagination: { pageSize: Math.max(BENCH_VIEWPORT_SIZE, 100), currentPage: 1 },
    initialPivotModel: pivotModels[0],
  })

  const columnModel = createDataGridColumnModel({
    columns: [
      { key: "region", label: "Region" },
      { key: "team", label: "Team" },
      { key: "year", label: "Year" },
      { key: "quarter", label: "Quarter" },
      { key: "bucketA", label: "Bucket A" },
      { key: "bucketB", label: "Bucket B" },
      { key: "revenue", label: "Revenue" },
      { key: "orders", label: "Orders" },
      { key: "latency", label: "Latency" },
    ],
  })

  const core = createDataGridCore({
    services: {
      rowModel: { name: "rowModel", model: rowModel },
      columnModel: { name: "columnModel", model: columnModel },
    },
  })
  const api = createDataGridApi({ core })

  const heapBefore = await sampleHeapUsed()
  const startedAt = performance.now()

  for (let iteration = 0; iteration < BENCH_ITERATIONS; iteration += 1) {
    const pivotModel = pivotModels[iteration % pivotModels.length] ?? null

    const importStart = performance.now()
    api.pivot.setModel(pivotModel)
    rowModel.setViewportRange({
      start: 0,
      end: Math.min(BENCH_VIEWPORT_SIZE - 1, Math.max(0, BENCH_ROW_COUNT - 1)),
    })
    await waitForPivotMaterialized(rowModel)
    importDurations.push(performance.now() - importStart)

    const exportStart = performance.now()
    const interop = api.pivot.exportInterop()
    exportDurations.push(performance.now() - exportStart)

    if (interop) {
      interopRowCounts.push(interop.rows.length)
      pivotColumnCounts.push(interop.pivotColumns.length)
      if (interop.rows.length > 0 && interop.pivotColumns.length > 0) {
        const firstRow = interop.rows.find(row => row.kind === "leaf") ?? interop.rows[0]
        const firstColumn = interop.pivotColumns[0]
        if (firstRow && firstColumn?.id) {
          const drilldownStart = performance.now()
          api.pivot.getCellDrilldown({
            rowId: firstRow.rowId,
            columnId: firstColumn.id,
            limit: 50,
          })
          drilldownDurations.push(performance.now() - drilldownStart)
        }
      }

      const layout = api.pivot.exportLayout()
      const layoutImportStart = performance.now()
      api.pivot.importLayout(layout)
      importDurations.push(performance.now() - layoutImportStart)
    }
  }

  const elapsedMs = performance.now() - startedAt
  const heapAfter = await sampleHeapUsed()

  const result = {
    elapsedMs,
    pullMs: stats(pullDurations),
    exportInteropMs: stats(exportDurations),
    importLayoutMs: stats(importDurations),
    drilldownMs: stats(drilldownDurations),
    interopRowsMean: stats(interopRowCounts).mean,
    pivotColumnsMean: stats(pivotColumnCounts).mean,
    heapDeltaMb: toMb(heapAfter - heapBefore),
  }

  core.dispose()
  rowModel.dispose()

  return result
}

const factories = await loadFactories()
const runResults = []
const budgetErrors = []
const varianceSkippedChecks = []

console.log("\nAffino DataGrid Server Pivot + Interop Benchmark")
console.log(`seeds=${BENCH_SEEDS.join(",")} rows=${BENCH_ROW_COUNT} iterations=${BENCH_ITERATIONS} viewport=${BENCH_VIEWPORT_SIZE}`)

for (const seed of BENCH_SEEDS) {
  console.log(`\n[server-pivot] seed ${seed}: warmup...`)
  for (let warmup = 0; warmup < BENCH_WARMUP_RUNS; warmup += 1) {
    await runServerPivotInteropScenario(factories, seed + warmup)
  }

  console.log(`[server-pivot] seed ${seed}: measure...`)
  const scenario = await runServerPivotInteropScenario(factories, seed)
  runResults.push({ seed, scenario })

  if (scenario.elapsedMs > PERF_BUDGET_TOTAL_MS) {
    budgetErrors.push(
      `seed ${seed}: elapsed ${scenario.elapsedMs.toFixed(3)}ms exceeds PERF_BUDGET_TOTAL_MS=${PERF_BUDGET_TOTAL_MS}ms`,
    )
  }
  if (scenario.pullMs.p95 > PERF_BUDGET_MAX_SERVER_PIVOT_PULL_P95_MS) {
    budgetErrors.push(
      `seed ${seed}: pull p95 ${scenario.pullMs.p95.toFixed(3)}ms exceeds PERF_BUDGET_MAX_SERVER_PIVOT_PULL_P95_MS=${PERF_BUDGET_MAX_SERVER_PIVOT_PULL_P95_MS}ms`,
    )
  }
  if (scenario.exportInteropMs.p95 > PERF_BUDGET_MAX_EXPORT_INTEROP_P95_MS) {
    budgetErrors.push(
      `seed ${seed}: exportInterop p95 ${scenario.exportInteropMs.p95.toFixed(3)}ms exceeds PERF_BUDGET_MAX_EXPORT_INTEROP_P95_MS=${PERF_BUDGET_MAX_EXPORT_INTEROP_P95_MS}ms`,
    )
  }
  if (scenario.importLayoutMs.p95 > PERF_BUDGET_MAX_IMPORT_LAYOUT_P95_MS) {
    budgetErrors.push(
      `seed ${seed}: importLayout p95 ${scenario.importLayoutMs.p95.toFixed(3)}ms exceeds PERF_BUDGET_MAX_IMPORT_LAYOUT_P95_MS=${PERF_BUDGET_MAX_IMPORT_LAYOUT_P95_MS}ms`,
    )
  }
  if (scenario.drilldownMs.p95 > PERF_BUDGET_MAX_DRILLDOWN_P95_MS) {
    budgetErrors.push(
      `seed ${seed}: drilldown p95 ${scenario.drilldownMs.p95.toFixed(3)}ms exceeds PERF_BUDGET_MAX_DRILLDOWN_P95_MS=${PERF_BUDGET_MAX_DRILLDOWN_P95_MS}ms`,
    )
  }
  if (scenario.interopRowsMean < PERF_BUDGET_MIN_INTEROP_ROWS) {
    budgetErrors.push(
      `seed ${seed}: interop rows mean ${scenario.interopRowsMean.toFixed(1)} below PERF_BUDGET_MIN_INTEROP_ROWS=${PERF_BUDGET_MIN_INTEROP_ROWS}`,
    )
  }
  if (scenario.pivotColumnsMean < PERF_BUDGET_MIN_PIVOT_COLUMNS) {
    budgetErrors.push(
      `seed ${seed}: pivot columns mean ${scenario.pivotColumnsMean.toFixed(1)} below PERF_BUDGET_MIN_PIVOT_COLUMNS=${PERF_BUDGET_MIN_PIVOT_COLUMNS}`,
    )
  }
  if (scenario.heapDeltaMb > PERF_BUDGET_HEAP_EPSILON_MB && scenario.heapDeltaMb > PERF_BUDGET_MAX_HEAP_DELTA_MB) {
    budgetErrors.push(
      `seed ${seed}: heap delta ${scenario.heapDeltaMb.toFixed(2)}MB exceeds PERF_BUDGET_MAX_HEAP_DELTA_MB=${PERF_BUDGET_MAX_HEAP_DELTA_MB}MB`,
    )
  }
}

const aggregateElapsed = stats(runResults.map(run => run.scenario.elapsedMs))
const aggregatePull = stats(runResults.map(run => run.scenario.pullMs.p95))
const aggregateExport = stats(runResults.map(run => run.scenario.exportInteropMs.p95))
const aggregateImport = stats(runResults.map(run => run.scenario.importLayoutMs.p95))
const aggregateDrilldown = stats(runResults.map(run => run.scenario.drilldownMs.p95))
const aggregateInteropRows = stats(runResults.map(run => run.scenario.interopRowsMean))
const aggregatePivotColumns = stats(runResults.map(run => run.scenario.pivotColumnsMean))
const aggregateHeap = stats(runResults.map(run => run.scenario.heapDeltaMb))

for (const aggregate of [
  { name: "pull p95", stat: aggregatePull },
  { name: "exportInterop p95", stat: aggregateExport },
  { name: "importLayout p95", stat: aggregateImport },
  { name: "drilldown p95", stat: aggregateDrilldown },
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
  benchmark: "datagrid-pivot-server-interop",
  generatedAt: new Date().toISOString(),
  config: {
    seeds: BENCH_SEEDS,
    rowCount: BENCH_ROW_COUNT,
    iterations: BENCH_ITERATIONS,
    viewportSize: BENCH_VIEWPORT_SIZE,
    warmupRuns: BENCH_WARMUP_RUNS,
  },
  budgets: {
    totalMs: PERF_BUDGET_TOTAL_MS,
    maxServerPivotPullP95Ms: PERF_BUDGET_MAX_SERVER_PIVOT_PULL_P95_MS,
    maxExportInteropP95Ms: PERF_BUDGET_MAX_EXPORT_INTEROP_P95_MS,
    maxImportLayoutP95Ms: PERF_BUDGET_MAX_IMPORT_LAYOUT_P95_MS,
    maxDrilldownP95Ms: PERF_BUDGET_MAX_DRILLDOWN_P95_MS,
    minInteropRows: PERF_BUDGET_MIN_INTEROP_ROWS,
    minPivotColumns: PERF_BUDGET_MIN_PIVOT_COLUMNS,
    maxVariancePct: PERF_BUDGET_MAX_VARIANCE_PCT,
    maxHeapDeltaMb: PERF_BUDGET_MAX_HEAP_DELTA_MB,
  },
  variancePolicy: {
    minMeanMsForCvGate: PERF_BUDGET_VARIANCE_MIN_MEAN_MS,
  },
  varianceSkippedChecks,
  aggregate: {
    elapsedMs: aggregateElapsed,
    pullP95Ms: aggregatePull,
    exportInteropP95Ms: aggregateExport,
    importLayoutP95Ms: aggregateImport,
    drilldownP95Ms: aggregateDrilldown,
    interopRowsMean: aggregateInteropRows,
    pivotColumnsMean: aggregatePivotColumns,
    heapDeltaMb: aggregateHeap,
  },
  runs: runResults,
  budgetErrors,
  ok: budgetErrors.length === 0,
}

mkdirSync(dirname(BENCH_OUTPUT_JSON), { recursive: true })
writeFileSync(BENCH_OUTPUT_JSON, JSON.stringify(summary, null, 2))

console.log(`\nBenchmark summary written: ${BENCH_OUTPUT_JSON}`)
console.log(`pull p95=${aggregatePull.p95.toFixed(3)}ms export p95=${aggregateExport.p95.toFixed(3)}ms import p95=${aggregateImport.p95.toFixed(3)}ms`)
console.log(`interopRows mean=${aggregateInteropRows.mean.toFixed(1)} pivotColumns mean=${aggregatePivotColumns.mean.toFixed(1)}`)

if (budgetErrors.length > 0) {
  console.error("\nServer pivot interop benchmark budget check failed:")
  for (const error of budgetErrors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}
