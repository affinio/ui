#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { spawn } from "node:child_process"

const BENCH_ROW_COUNTS = parsePositiveIntegerList(
  process.env.BENCH_TREE_ROW_MATRIX ?? "10000,25000,50000,100000",
  "BENCH_TREE_ROW_MATRIX",
)
const BENCH_OUTPUT_JSON = resolve(
  process.env.BENCH_OUTPUT_JSON ?? "artifacts/performance/bench-datagrid-tree-workload-matrix.json",
)
const BENCH_OUTPUT_DIR = resolve(process.env.BENCH_TREE_MATRIX_OUTPUT_DIR ?? dirname(BENCH_OUTPUT_JSON))
const BENCH_SCRIPT = resolve(process.env.BENCH_TREE_WORKLOAD_SCRIPT ?? "./scripts/bench-datagrid-tree-workload.mjs")

const DEFAULT_BUDGET_MAX_EXPAND_BURST_P95_MS_BY_ROWS = {
  10000: 35,
  25000: 50,
  50000: 80,
  100000: 130,
}
const DEFAULT_BUDGET_MAX_EXPAND_BURST_P99_MS_BY_ROWS = {
  10000: 55,
  25000: 75,
  50000: 120,
  100000: 190,
}
const DEFAULT_BUDGET_MAX_FILTER_SORT_BURST_P95_MS_BY_ROWS = {
  10000: 55,
  25000: 80,
  50000: 130,
  100000: 220,
}
const DEFAULT_BUDGET_MAX_FILTER_SORT_BURST_P99_MS_BY_ROWS = {
  10000: 70,
  25000: 110,
  50000: 180,
  100000: 300,
}
const DEFAULT_BUDGET_MAX_VARIANCE_PCT_BY_ROWS = {
  10000: 75,
  25000: 85,
  50000: 95,
  100000: 110,
}
const DEFAULT_BUDGET_MAX_HEAP_DELTA_MB_BY_ROWS = {
  10000: 140,
  25000: 220,
  50000: 360,
  100000: 640,
}

const budgetMaps = {
  maxExpandBurstP95MsByRows: parseBudgetMap(
    process.env.PERF_MATRIX_BUDGET_MAX_EXPAND_BURST_P95_MS_BY_ROWS,
    DEFAULT_BUDGET_MAX_EXPAND_BURST_P95_MS_BY_ROWS,
  ),
  maxExpandBurstP99MsByRows: parseBudgetMap(
    process.env.PERF_MATRIX_BUDGET_MAX_EXPAND_BURST_P99_MS_BY_ROWS,
    DEFAULT_BUDGET_MAX_EXPAND_BURST_P99_MS_BY_ROWS,
  ),
  maxFilterSortBurstP95MsByRows: parseBudgetMap(
    process.env.PERF_MATRIX_BUDGET_MAX_FILTER_SORT_BURST_P95_MS_BY_ROWS,
    DEFAULT_BUDGET_MAX_FILTER_SORT_BURST_P95_MS_BY_ROWS,
  ),
  maxFilterSortBurstP99MsByRows: parseBudgetMap(
    process.env.PERF_MATRIX_BUDGET_MAX_FILTER_SORT_BURST_P99_MS_BY_ROWS,
    DEFAULT_BUDGET_MAX_FILTER_SORT_BURST_P99_MS_BY_ROWS,
  ),
  maxVariancePctByRows: parseBudgetMap(
    process.env.PERF_MATRIX_BUDGET_MAX_VARIANCE_PCT_BY_ROWS,
    DEFAULT_BUDGET_MAX_VARIANCE_PCT_BY_ROWS,
  ),
  maxHeapDeltaMbByRows: parseBudgetMap(
    process.env.PERF_MATRIX_BUDGET_MAX_HEAP_DELTA_MB_BY_ROWS,
    DEFAULT_BUDGET_MAX_HEAP_DELTA_MB_BY_ROWS,
  ),
}

const matrixDefaultsByRows = {
  10000: {
    BENCH_TREE_VIEWPORT_SIZE: "160",
    BENCH_TREE_EXPAND_ITERATIONS: "48",
    BENCH_TREE_FILTER_SORT_ITERATIONS: "36",
    BENCH_TREE_WARMUP_EXPAND_ITERATIONS: "8",
    BENCH_TREE_WARMUP_FILTER_SORT_ITERATIONS: "6",
    BENCH_TREE_GROUP_KEY_SAMPLE_LIMIT: "256",
    BENCH_TREE_PROGRESS_EVERY: "24",
  },
  25000: {
    BENCH_TREE_VIEWPORT_SIZE: "180",
    BENCH_TREE_EXPAND_ITERATIONS: "56",
    BENCH_TREE_FILTER_SORT_ITERATIONS: "42",
    BENCH_TREE_WARMUP_EXPAND_ITERATIONS: "10",
    BENCH_TREE_WARMUP_FILTER_SORT_ITERATIONS: "8",
    BENCH_TREE_GROUP_KEY_SAMPLE_LIMIT: "320",
    BENCH_TREE_PROGRESS_EVERY: "24",
  },
  50000: {
    BENCH_TREE_VIEWPORT_SIZE: "180",
    BENCH_TREE_EXPAND_ITERATIONS: "64",
    BENCH_TREE_FILTER_SORT_ITERATIONS: "48",
    BENCH_TREE_WARMUP_EXPAND_ITERATIONS: "12",
    BENCH_TREE_WARMUP_FILTER_SORT_ITERATIONS: "10",
    BENCH_TREE_GROUP_KEY_SAMPLE_LIMIT: "448",
    BENCH_TREE_PROGRESS_EVERY: "32",
  },
  100000: {
    BENCH_TREE_VIEWPORT_SIZE: "200",
    BENCH_TREE_EXPAND_ITERATIONS: "72",
    BENCH_TREE_FILTER_SORT_ITERATIONS: "56",
    BENCH_TREE_WARMUP_EXPAND_ITERATIONS: "14",
    BENCH_TREE_WARMUP_FILTER_SORT_ITERATIONS: "12",
    BENCH_TREE_GROUP_KEY_SAMPLE_LIMIT: "640",
    BENCH_TREE_PROGRESS_EVERY: "36",
  },
}

const matrixRuns = []
const matrixBudgetErrors = []

for (const rowCount of BENCH_ROW_COUNTS) {
  const rowOutputJson = resolve(BENCH_OUTPUT_DIR, `bench-datagrid-tree-workload-${rowCount}.json`)
  const rowEnv = buildRowBenchmarkEnvironment(rowCount, rowOutputJson)
  console.log(`\n[tree-matrix] rows=${rowCount}: running workload benchmark...`)
  try {
    await runNodeProcess(process.execPath, [
      "--expose-gc",
      "--experimental-specifier-resolution=node",
      BENCH_SCRIPT,
    ], rowEnv)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    matrixBudgetErrors.push(`rows=${rowCount}: ${message}`)
    continue
  }

  if (!existsSync(rowOutputJson)) {
    matrixBudgetErrors.push(`rows=${rowCount}: benchmark output not found at ${rowOutputJson}`)
    continue
  }

  const rowReport = JSON.parse(readFileSync(rowOutputJson, "utf8"))
  const metrics = collectRowMetrics(rowReport)
  const rowBudgetErrors = evaluateRowBudgets(rowCount, metrics, budgetMaps)
  if (rowBudgetErrors.length > 0) {
    for (const error of rowBudgetErrors) {
      matrixBudgetErrors.push(error)
    }
  }
  matrixRuns.push({
    rows: rowCount,
    outputJson: rowOutputJson,
    metrics,
    budgetErrors: rowBudgetErrors,
  })
}

const matrixReport = {
  benchmark: "Affino DataGrid Tree Workload Matrix Benchmark",
  generatedAt: new Date().toISOString(),
  config: {
    rows: BENCH_ROW_COUNTS,
    workloadScript: BENCH_SCRIPT,
  },
  budgets: budgetMaps,
  runs: matrixRuns,
  budgetErrors: matrixBudgetErrors,
  ok: matrixBudgetErrors.length === 0,
}

mkdirSync(dirname(BENCH_OUTPUT_JSON), { recursive: true })
writeFileSync(BENCH_OUTPUT_JSON, JSON.stringify(matrixReport, null, 2))
console.log(`\nTree workload matrix summary written: ${BENCH_OUTPUT_JSON}`)

if (matrixBudgetErrors.length > 0) {
  console.error("\nTree workload matrix budget check failed:")
  for (const error of matrixBudgetErrors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

function parsePositiveIntegerList(raw, label) {
  const values = String(raw ?? "")
    .split(",")
    .map(item => Number.parseInt(item.trim(), 10))
    .filter(value => Number.isInteger(value) && value > 0)
  if (values.length === 0) {
    throw new Error(`${label} must contain at least one positive integer`)
  }
  return values
}

function parseBudgetMap(raw, fallback) {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ...fallback }
  }
  const parsed = {}
  for (const entry of raw.split(",")) {
    const [rowRaw, budgetRaw] = entry.split(":", 2).map(item => String(item ?? "").trim())
    const rowCount = Number.parseInt(rowRaw, 10)
    const budget = Number.parseFloat(budgetRaw)
    if (!Number.isInteger(rowCount) || rowCount <= 0 || !Number.isFinite(budget) || budget < 0) {
      throw new Error(`Invalid budget map entry '${entry}'`)
    }
    parsed[rowCount] = budget
  }
  return parsed
}

function resolveBudget(mapByRows, rowCount) {
  const direct = mapByRows[rowCount]
  if (Number.isFinite(direct)) {
    return direct
  }
  const knownRows = Object.keys(mapByRows)
    .map(value => Number.parseInt(value, 10))
    .filter(value => Number.isInteger(value) && value > 0)
    .sort((left, right) => left - right)
  for (const known of knownRows) {
    if (rowCount <= known) {
      return mapByRows[known]
    }
  }
  const fallbackRow = knownRows[knownRows.length - 1]
  return mapByRows[fallbackRow]
}

function buildRowBenchmarkEnvironment(rowCount, rowOutputJson) {
  const defaults = matrixDefaultsByRows[rowCount] ?? matrixDefaultsByRows[100000]
  return {
    ...process.env,
    BENCH_TREE_ROW_COUNT: String(rowCount),
    BENCH_OUTPUT_JSON: rowOutputJson,
    BENCH_TREE_VIEWPORT_SIZE: process.env.BENCH_TREE_VIEWPORT_SIZE ?? defaults.BENCH_TREE_VIEWPORT_SIZE,
    BENCH_TREE_EXPAND_ITERATIONS: process.env.BENCH_TREE_EXPAND_ITERATIONS ?? defaults.BENCH_TREE_EXPAND_ITERATIONS,
    BENCH_TREE_FILTER_SORT_ITERATIONS: process.env.BENCH_TREE_FILTER_SORT_ITERATIONS
      ?? defaults.BENCH_TREE_FILTER_SORT_ITERATIONS,
    BENCH_TREE_WARMUP_EXPAND_ITERATIONS: process.env.BENCH_TREE_WARMUP_EXPAND_ITERATIONS
      ?? defaults.BENCH_TREE_WARMUP_EXPAND_ITERATIONS,
    BENCH_TREE_WARMUP_FILTER_SORT_ITERATIONS: process.env.BENCH_TREE_WARMUP_FILTER_SORT_ITERATIONS
      ?? defaults.BENCH_TREE_WARMUP_FILTER_SORT_ITERATIONS,
    BENCH_TREE_GROUP_KEY_SAMPLE_LIMIT: process.env.BENCH_TREE_GROUP_KEY_SAMPLE_LIMIT
      ?? defaults.BENCH_TREE_GROUP_KEY_SAMPLE_LIMIT,
    BENCH_TREE_PROGRESS_EVERY: process.env.BENCH_TREE_PROGRESS_EVERY ?? defaults.BENCH_TREE_PROGRESS_EVERY,
    BENCH_TREE_MEASUREMENT_BATCH_SIZE: process.env.BENCH_TREE_MEASUREMENT_BATCH_SIZE ?? "2",
    BENCH_TREE_WARMUP_BATCHES: process.env.BENCH_TREE_WARMUP_BATCHES ?? "0",
  }
}

function runNodeProcess(command, args, env) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      env,
      stdio: "inherit",
      cwd: resolve("."),
    })
    child.on("error", rejectPromise)
    child.on("exit", code => {
      if (code === 0) {
        resolvePromise()
        return
      }
      rejectPromise(new Error(`Command failed (${code}): ${command} ${args.join(" ")}`))
    })
  })
}

function collectRowMetrics(report) {
  const runs = Array.isArray(report?.runs) ? report.runs : []
  const expandP95 = runs.map(run => run?.scenarios?.expandBurst?.stat?.p95).filter(Number.isFinite)
  const expandP99 = runs.map(run => run?.scenarios?.expandBurst?.stat?.p99).filter(Number.isFinite)
  const filterSortP95 = runs.map(run => run?.scenarios?.filterSortBurst?.stat?.p95).filter(Number.isFinite)
  const filterSortP99 = runs.map(run => run?.scenarios?.filterSortBurst?.stat?.p99).filter(Number.isFinite)
  const variancePct = runs.flatMap(run => [
    run?.scenarios?.expandBurst?.stat?.cvPct,
    run?.scenarios?.filterSortBurst?.stat?.cvPct,
  ]).filter(Number.isFinite)
  const heapDeltaMb = runs.map(run => run?.heapDeltaMb).filter(Number.isFinite)
  return {
    expandBurstP95MsMax: expandP95.length > 0 ? Math.max(...expandP95) : 0,
    expandBurstP99MsMax: expandP99.length > 0 ? Math.max(...expandP99) : 0,
    filterSortBurstP95MsMax: filterSortP95.length > 0 ? Math.max(...filterSortP95) : 0,
    filterSortBurstP99MsMax: filterSortP99.length > 0 ? Math.max(...filterSortP99) : 0,
    variancePctMax: variancePct.length > 0 ? Math.max(...variancePct) : 0,
    heapDeltaMbMax: heapDeltaMb.length > 0 ? Math.max(...heapDeltaMb) : 0,
  }
}

function evaluateRowBudgets(rowCount, metrics, budgets) {
  const errors = []
  const maxExpandP95 = resolveBudget(budgets.maxExpandBurstP95MsByRows, rowCount)
  const maxExpandP99 = resolveBudget(budgets.maxExpandBurstP99MsByRows, rowCount)
  const maxFilterSortP95 = resolveBudget(budgets.maxFilterSortBurstP95MsByRows, rowCount)
  const maxFilterSortP99 = resolveBudget(budgets.maxFilterSortBurstP99MsByRows, rowCount)
  const maxVariance = resolveBudget(budgets.maxVariancePctByRows, rowCount)
  const maxHeapDelta = resolveBudget(budgets.maxHeapDeltaMbByRows, rowCount)

  if (metrics.expandBurstP95MsMax > maxExpandP95) {
    errors.push(`rows=${rowCount}: expandBurst p95 ${metrics.expandBurstP95MsMax.toFixed(3)}ms > ${maxExpandP95}`)
  }
  if (metrics.expandBurstP99MsMax > maxExpandP99) {
    errors.push(`rows=${rowCount}: expandBurst p99 ${metrics.expandBurstP99MsMax.toFixed(3)}ms > ${maxExpandP99}`)
  }
  if (metrics.filterSortBurstP95MsMax > maxFilterSortP95) {
    errors.push(`rows=${rowCount}: filterSort p95 ${metrics.filterSortBurstP95MsMax.toFixed(3)}ms > ${maxFilterSortP95}`)
  }
  if (metrics.filterSortBurstP99MsMax > maxFilterSortP99) {
    errors.push(`rows=${rowCount}: filterSort p99 ${metrics.filterSortBurstP99MsMax.toFixed(3)}ms > ${maxFilterSortP99}`)
  }
  if (metrics.variancePctMax > maxVariance) {
    errors.push(`rows=${rowCount}: variance ${metrics.variancePctMax.toFixed(2)}% > ${maxVariance}%`)
  }
  if (metrics.heapDeltaMbMax > maxHeapDelta) {
    errors.push(`rows=${rowCount}: heap delta ${metrics.heapDeltaMbMax.toFixed(2)}MB > ${maxHeapDelta}MB`)
  }
  return errors
}
