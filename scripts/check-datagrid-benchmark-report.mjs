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

  const results = Array.isArray(report.results) ? report.results : []
  register(results.length > 0, "results-present", "benchmark harness report contains suite results")

  for (const taskId of requiredTasks) {
    const result = results.find(item => item && item.id === taskId)
    if (!result) {
      register(false, `task-${taskId}-present`, `missing benchmark result for task '${taskId}'`)
      continue
    }
    register(Boolean(result.ok), `task-${taskId}-ok`, `task '${taskId}' must pass`, {
      status: result.status,
      signal: result.signal,
    })

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
