#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { spawnSync } from "node:child_process"

const mode = process.env.DATAGRID_BENCH_MODE === "ci" ? "ci" : "local"
const failFast = process.env.BENCH_FAIL_FAST !== "false"

const outputDir = resolve(process.env.DATAGRID_BENCH_OUTPUT_DIR ?? "artifacts/performance")
const reportPath = resolve(process.env.DATAGRID_BENCH_REPORT ?? `${outputDir}/datagrid-benchmark-report.json`)

const baseEnv = {
  ...process.env,
}

const ciBudgets = {
  BENCH_SEEDS: "1337,7331,2026",
  PERF_BUDGET_TOTAL_MS: "1400",
  PERF_BUDGET_MAX_BOOTSTRAP_MS: "8",
  PERF_BUDGET_MAX_CONTROLLER_MS: "30",
  PERF_BUDGET_MAX_RELAYOUT_MS: "6",
  PERF_BUDGET_MAX_HYDRATE_RATE_PCT: "25",
  PERF_BUDGET_MAX_OPEN_CLOSE_MS: "2",
  PERF_BUDGET_MAX_VARIANCE_PCT: "25",
  PERF_BUDGET_MAX_HEAP_DELTA_MB: "80",
}

const localBudgets = {
  BENCH_SEEDS: "1337,7331",
  PERF_BUDGET_TOTAL_MS: "Infinity",
  PERF_BUDGET_MAX_BOOTSTRAP_MS: "Infinity",
  PERF_BUDGET_MAX_CONTROLLER_MS: "Infinity",
  PERF_BUDGET_MAX_RELAYOUT_MS: "Infinity",
  PERF_BUDGET_MAX_HYDRATE_RATE_PCT: "Infinity",
  PERF_BUDGET_MAX_OPEN_CLOSE_MS: "Infinity",
  PERF_BUDGET_MAX_VARIANCE_PCT: "Infinity",
  PERF_BUDGET_MAX_HEAP_DELTA_MB: "Infinity",
}

const selectedBudgets = mode === "ci" ? ciBudgets : localBudgets

mkdirSync(outputDir, { recursive: true })

const tasks = [
  {
    id: "vue-adapters",
    command: "node",
    args: ["./scripts/bench-vue-adapters.mjs"],
    jsonPath: `${outputDir}/bench-vue-adapters.json`,
    logPath: `${outputDir}/bench-vue-adapters.log`,
  },
  {
    id: "laravel-morph",
    command: "node",
    args: ["./scripts/bench-livewire-morph.mjs"],
    jsonPath: `${outputDir}/bench-livewire-morph.json`,
    logPath: `${outputDir}/bench-livewire-morph.log`,
  },
]

const results = []
let hasFailure = false

for (const task of tasks) {
  const env = {
    ...baseEnv,
    ...selectedBudgets,
    BENCH_OUTPUT_JSON: task.jsonPath,
  }

  const startedAt = Date.now()
  const proc = spawnSync(task.command, task.args, {
    env,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  })
  const durationMs = Date.now() - startedAt

  const stdout = proc.stdout ?? ""
  const stderr = proc.stderr ?? ""
  const combined = `${stdout}${stderr ? `\n${stderr}` : ""}`.trim()

  writeFileSync(task.logPath, combined)
  if (stdout) process.stdout.write(stdout)
  if (stderr) process.stderr.write(stderr)

  const ok = proc.status === 0
  const result = {
    id: task.id,
    ok,
    status: proc.status,
    signal: proc.signal,
    durationMs,
    jsonPath: task.jsonPath,
    logPath: task.logPath,
  }

  results.push(result)
  if (!ok) {
    hasFailure = true
    if (failFast) {
      break
    }
  }
}

const report = {
  mode,
  failFast,
  generatedAt: new Date().toISOString(),
  budgets: selectedBudgets,
  results,
  ok: !hasFailure,
}

writeFileSync(reportPath, JSON.stringify(report, null, 2))

console.log("\nDatagrid benchmark harness")
console.log(`mode: ${mode}`)
console.log(`report: ${reportPath}`)
for (const result of results) {
  console.log(`- ${result.id}: ${result.ok ? "ok" : "failed"} (${result.durationMs}ms)`)
}

if (hasFailure) {
  process.exit(1)
}
