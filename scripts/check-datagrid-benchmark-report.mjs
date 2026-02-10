#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, resolve } from "node:path"

const reportPath = resolve(process.env.DATAGRID_BENCH_REPORT ?? "artifacts/performance/datagrid-benchmark-report.json")
const outputPath = resolve(
  process.env.DATAGRID_BENCH_GATES_REPORT ?? "artifacts/quality/datagrid-benchmark-gates-report.json",
)
const requiredTasks = (process.env.DATAGRID_BENCH_REQUIRED_TASKS ?? "vue-adapters,laravel-morph,interaction-models,row-models")
  .split(",")
  .map(task => task.trim())
  .filter(Boolean)
const expectedMode = process.env.DATAGRID_BENCH_EXPECT_MODE ?? "ci"
const maxReportAgeMinutes = Number.parseFloat(process.env.DATAGRID_BENCH_MAX_REPORT_AGE_MINUTES ?? "180")

const failures = []
const checks = []

function register(ok, id, message, meta = {}) {
  checks.push({ ok, id, message, ...meta })
  if (!ok) {
    failures.push({ id, message, ...meta })
  }
}

function resolveReportLinkedPath(candidate, fallbackBaseDir) {
  if (typeof candidate !== "string" || candidate.length === 0) {
    return null
  }
  if (existsSync(candidate)) {
    return candidate
  }
  const fallback = resolve(fallbackBaseDir, basename(candidate))
  if (existsSync(fallback)) {
    return fallback
  }
  return null
}

function parseFiniteNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === "string") {
    const normalized = value.trim()
    if (normalized.length === 0 || normalized.toLowerCase() === "infinity") {
      return null
    }
    const parsed = Number.parseFloat(normalized)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function readNestedNumber(root, path) {
  if (!root || typeof root !== "object") {
    return null
  }
  const parts = path.split(".")
  let current = root
  for (const part of parts) {
    if (!current || typeof current !== "object" || !(part in current)) {
      return null
    }
    current = current[part]
  }
  return parseFiniteNumber(current)
}

function resolveHeapWorstCase(stat) {
  if (!stat || typeof stat !== "object") {
    return null
  }
  return (
    parseFiniteNumber(stat.max) ??
    parseFiniteNumber(stat.p99) ??
    parseFiniteNumber(stat.p95) ??
    parseFiniteNumber(stat.p90) ??
    parseFiniteNumber(stat.p50) ??
    parseFiniteNumber(stat.mean)
  )
}

function isFiniteBudgetLiteral(value) {
  if (typeof value === "number") {
    return Number.isFinite(value)
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    if (normalized.length === 0 || normalized === "infinity") {
      return false
    }
    return Number.isFinite(Number.parseFloat(normalized))
  }
  return false
}

if (!existsSync(reportPath)) {
  register(false, "report-file", "datagrid benchmark report is missing", { reportPath })
} else {
  register(true, "report-file", "datagrid benchmark report is present", { reportPath })
}

let report = null
if (existsSync(reportPath)) {
  try {
    report = JSON.parse(readFileSync(reportPath, "utf8"))
    register(true, "report-json", "datagrid benchmark report is valid JSON")
  } catch (error) {
    register(false, "report-json", "failed to parse datagrid benchmark report", {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

if (report) {
  const generatedAt = typeof report.generatedAt === "string" ? Date.parse(report.generatedAt) : Number.NaN
  if (!Number.isFinite(generatedAt)) {
    register(false, "report-generated-at", "generatedAt is missing or invalid")
  } else if (Number.isFinite(maxReportAgeMinutes) && maxReportAgeMinutes >= 0) {
    const ageMinutes = (Date.now() - generatedAt) / (1000 * 60)
    register(
      ageMinutes <= maxReportAgeMinutes,
      "report-freshness",
      `report age is ${ageMinutes.toFixed(1)} minutes (max ${maxReportAgeMinutes.toFixed(1)} minutes)`,
      { ageMinutes, maxReportAgeMinutes },
    )
  }

  register(report.mode === expectedMode, "report-mode", `expected mode ${expectedMode}, got ${String(report.mode)}`, {
    expectedMode,
    actualMode: report.mode,
  })
  register(Boolean(report.ok), "report-ok", "benchmark harness report must be ok=true")

  const byTaskBudgets = Array.isArray(report.budgets?.byTask) ? report.budgets.byTask : []
  register(byTaskBudgets.length > 0, "report-task-budget-map", "benchmark harness report must expose byTask budgets")

  if (expectedMode === "ci") {
    const sharedBudgets = report.budgets?.shared ?? {}
    const seedsRaw = String(sharedBudgets.BENCH_SEEDS ?? "")
    const seedCount = seedsRaw
      .split(",")
      .map(value => value.trim())
      .filter(Boolean)
      .length
    register(seedCount >= 3, "shared-ci-seeds", "CI harness must run at least 3 seeds", { seedsRaw, seedCount })

    const sharedVarianceBudget = parseFiniteNumber(sharedBudgets.PERF_BUDGET_MAX_VARIANCE_PCT)
    register(
      sharedVarianceBudget != null,
      "shared-ci-variance-budget-finite",
      "CI shared variance budget must be finite",
      { value: sharedBudgets.PERF_BUDGET_MAX_VARIANCE_PCT },
    )

    const sharedHeapBudget = parseFiniteNumber(sharedBudgets.PERF_BUDGET_MAX_HEAP_DELTA_MB)
    register(
      sharedHeapBudget != null,
      "shared-ci-heap-budget-finite",
      "CI shared heap budget must be finite",
      { value: sharedBudgets.PERF_BUDGET_MAX_HEAP_DELTA_MB },
    )

    const sharedInfinityKeys = Object.entries(sharedBudgets)
      .filter(([, value]) => typeof value === "string" && value.trim().toLowerCase() === "infinity")
      .map(([key]) => key)
    register(
      sharedInfinityKeys.length === 0,
      "shared-ci-no-infinity-budgets",
      "CI shared budgets must not use Infinity values",
      { sharedInfinityKeys },
    )
  }

  const results = Array.isArray(report.results) ? report.results : []
  register(results.length > 0, "results-present", "benchmark harness report contains suite results")
  register(
    results.length >= requiredTasks.length,
    "results-cover-required-count",
    "benchmark harness report must include all required task results",
    { resultsCount: results.length, requiredCount: requiredTasks.length },
  )

  const duplicateResultIds = [
    ...new Set(
      results
        .map(result => (result && typeof result.id === "string" ? result.id : null))
        .filter((id, index, array) => id != null && array.indexOf(id) !== index),
    ),
  ]
  register(
    duplicateResultIds.length === 0,
    "results-no-duplicate-task-ids",
    "benchmark harness report must not contain duplicate task ids",
    { duplicateResultIds },
  )

  for (const taskId of requiredTasks) {
    const result = results.find(item => item && item.id === taskId)
    if (!result) {
      register(false, `task-${taskId}-present`, `missing benchmark result for task '${taskId}'`)
      continue
    }
    register(
      Number.isFinite(result.durationMs) && result.durationMs > 0,
      `task-${taskId}-duration-valid`,
      `task '${taskId}' durationMs must be finite and > 0`,
      { durationMs: result.durationMs },
    )
    register(
      typeof result.logPath === "string" && result.logPath.length > 0,
      `task-${taskId}-log-path`,
      `task '${taskId}' must publish log path`,
      { logPath: result.logPath ?? null },
    )
    register(
      (result.ok === true && result.status === 0) || (result.ok === false && result.status !== 0),
      `task-${taskId}-status-consistency`,
      `task '${taskId}' status/ok must be consistent`,
      { ok: result.ok, status: result.status },
    )
    register(Boolean(result.ok), `task-${taskId}-ok`, `task '${taskId}' must pass`, {
      status: result.status,
      signal: result.signal,
    })

    const taskBudgetEntry = byTaskBudgets.find(entry => entry && entry.id === taskId)
    register(
      Boolean(taskBudgetEntry),
      `task-${taskId}-budget-map-entry`,
      `task '${taskId}' must exist in report.budgets.byTask`,
    )
    if (expectedMode === "ci" && taskBudgetEntry?.budgets && typeof taskBudgetEntry.budgets === "object") {
      const infiniteBudgetKeys = Object.entries(taskBudgetEntry.budgets)
        .filter(([, value]) => !isFiniteBudgetLiteral(value))
        .map(([key]) => key)
      register(
        infiniteBudgetKeys.length === 0,
        `task-${taskId}-ci-budgets-finite`,
        `task '${taskId}' CI budgets must be finite`,
        { infiniteBudgetKeys },
      )
    }

    const linkedPath = resolveReportLinkedPath(result.jsonPath, dirname(reportPath))
    register(Boolean(linkedPath), `task-${taskId}-artifact`, `task '${taskId}' json artifact must exist`, {
      reportedPath: result.jsonPath,
    })
    if (!linkedPath) {
      continue
    }

    let benchmarkJson = null
    try {
      benchmarkJson = JSON.parse(readFileSync(linkedPath, "utf8"))
      register(true, `task-${taskId}-artifact-json`, `task '${taskId}' artifact is valid JSON`)
    } catch (error) {
      register(false, `task-${taskId}-artifact-json`, `task '${taskId}' artifact failed JSON parse`, {
        error: error instanceof Error ? error.message : String(error),
      })
      continue
    }

    register(
      typeof benchmarkJson.benchmark === "string" && benchmarkJson.benchmark.length > 0,
      `task-${taskId}-benchmark-name`,
      `task '${taskId}' artifact must expose benchmark name`,
    )
    register(
      typeof benchmarkJson.aggregate === "object" && benchmarkJson.aggregate !== null,
      `task-${taskId}-aggregate`,
      `task '${taskId}' artifact must expose aggregate metrics`,
    )
    register(
      typeof benchmarkJson.budgets === "object" && benchmarkJson.budgets !== null,
      `task-${taskId}-budgets`,
      `task '${taskId}' artifact must expose budget section`,
    )
    const benchmarkGeneratedAt = typeof benchmarkJson.generatedAt === "string" ? Date.parse(benchmarkJson.generatedAt) : Number.NaN
    register(
      Number.isFinite(benchmarkGeneratedAt),
      `task-${taskId}-artifact-generated-at`,
      `task '${taskId}' artifact must expose valid generatedAt`,
      { generatedAt: benchmarkJson.generatedAt ?? null },
    )
    if (Number.isFinite(benchmarkGeneratedAt) && Number.isFinite(maxReportAgeMinutes) && maxReportAgeMinutes >= 0) {
      const taskAgeMinutes = (Date.now() - benchmarkGeneratedAt) / (1000 * 60)
      register(
        taskAgeMinutes <= maxReportAgeMinutes,
        `task-${taskId}-artifact-freshness`,
        `task '${taskId}' artifact age is ${taskAgeMinutes.toFixed(1)} minutes (max ${maxReportAgeMinutes.toFixed(1)} minutes)`,
        { taskAgeMinutes, maxReportAgeMinutes },
      )
    }

    register(Boolean(benchmarkJson.ok), `task-${taskId}-benchmark-ok`, `task '${taskId}' benchmark summary must be ok=true`)
    const budgetErrors = Array.isArray(benchmarkJson.budgetErrors) ? benchmarkJson.budgetErrors : []
    register(
      budgetErrors.length === 0,
      `task-${taskId}-budget-errors-empty`,
      `task '${taskId}' benchmark summary must not contain budget errors`,
      { budgetErrorsCount: budgetErrors.length },
    )

    if (expectedMode !== "ci") {
      continue
    }

    const maxVariancePct = parseFiniteNumber(benchmarkJson.budgets?.maxVariancePct)
    register(
      maxVariancePct != null,
      `task-${taskId}-variance-budget-finite`,
      `task '${taskId}' maxVariancePct must be finite in CI`,
      { value: benchmarkJson.budgets?.maxVariancePct ?? null },
    )

    const maxHeapDeltaMb = parseFiniteNumber(benchmarkJson.budgets?.maxHeapDeltaMb)
    register(
      maxHeapDeltaMb != null,
      `task-${taskId}-heap-budget-finite`,
      `task '${taskId}' maxHeapDeltaMb must be finite in CI`,
      { value: benchmarkJson.budgets?.maxHeapDeltaMb ?? null },
    )

    const varianceMinMeanMs = parseFiniteNumber(benchmarkJson.budgets?.varianceMinMeanMs) ?? 0
    const elapsedMean =
      readNestedNumber(benchmarkJson, "aggregate.elapsedMs.mean") ??
      readNestedNumber(benchmarkJson, "aggregate.elapsed.mean")
    const elapsedCv =
      readNestedNumber(benchmarkJson, "aggregate.elapsedMs.cvPct") ??
      readNestedNumber(benchmarkJson, "aggregate.elapsed.cvPct")

    if (maxVariancePct != null && elapsedMean != null && elapsedCv != null && elapsedMean >= varianceMinMeanMs) {
      register(
        elapsedCv <= maxVariancePct,
        `task-${taskId}-elapsed-variance`,
        `task '${taskId}' elapsed CV ${elapsedCv.toFixed(2)}% must be <= ${maxVariancePct.toFixed(2)}%`,
        { elapsedCvPct: elapsedCv, maxVariancePct, elapsedMeanMs: elapsedMean, varianceMinMeanMs },
      )
    }

    const heapStat = benchmarkJson.aggregate?.heapDeltaMb ?? benchmarkJson.aggregate?.heapDelta ?? null
    const heapWorstCase = resolveHeapWorstCase(heapStat)
    const heapEpsilonMb = parseFiniteNumber(benchmarkJson.budgets?.heapEpsilonMb) ?? 0
    if (maxHeapDeltaMb != null && heapWorstCase != null) {
      register(
        heapWorstCase <= maxHeapDeltaMb + heapEpsilonMb,
        `task-${taskId}-heap-growth`,
        `task '${taskId}' heap delta ${heapWorstCase.toFixed(2)}MB must be <= ${(maxHeapDeltaMb + heapEpsilonMb).toFixed(2)}MB`,
        { heapWorstCaseMb: heapWorstCase, maxHeapDeltaMb, heapEpsilonMb },
      )
    }
  }
}

const summary = {
  generatedAt: new Date().toISOString(),
  reportPath,
  outputPath,
  expectedMode,
  requiredTasks,
  maxReportAgeMinutes,
  ok: failures.length === 0,
  totals: {
    checks: checks.length,
    failed: failures.length,
  },
  failures,
  checks,
}

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, JSON.stringify(summary, null, 2))

console.log("\nDatagrid Benchmark Gates")
console.log(`report: ${reportPath}`)
console.log(`output: ${outputPath}`)
console.log(`checks: ${checks.length - failures.length}/${checks.length}`)

if (failures.length > 0) {
  console.error("\nFailed checks:")
  for (const failure of failures) {
    console.error(`- [${failure.id}] ${failure.message}`)
  }
  process.exit(1)
}
