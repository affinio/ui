#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { spawn } from "node:child_process"

const mode = process.env.DATAGRID_BENCH_MODE === "ci" ? "ci" : "local"
const failFast = process.env.BENCH_FAIL_FAST !== "false"

const outputDir = resolve(process.env.DATAGRID_BENCH_OUTPUT_DIR ?? "artifacts/performance")
const reportPath = resolve(process.env.DATAGRID_BENCH_REPORT ?? `${outputDir}/datagrid-benchmark-report.json`)

const baseEnv = {
  ...process.env,
}

const sharedCiBudgets = {
  BENCH_SEEDS: "1337,7331,2026",
  BENCH_WARMUP_RUNS: "1",
  BENCH_VUE_MEASUREMENT_BATCH_SIZE: "5",
  BENCH_VUE_MEASUREMENT_SAMPLE_COUNT: "5",
  BENCH_VUE_MEASUREMENT_WARMUP_COUNT: "1",
  BENCH_ROWMODEL_MEASUREMENT_BATCH_SIZE: "8",
  BENCH_ROWMODEL_WARMUP_BATCHES: "1",
  BENCH_LIVEWIRE_MEASUREMENT_BATCH_SIZE: "5",
  BENCH_LIVEWIRE_MEASUREMENT_SAMPLE_COUNT: "5",
  BENCH_LIVEWIRE_MEASUREMENT_WARMUP_COUNT: "1",
  PERF_BUDGET_MAX_VARIANCE_PCT: "25",
  PERF_BUDGET_VARIANCE_MIN_MEAN_MS: "0.5",
  PERF_BUDGET_ENFORCE_HYDRATE_RATE_VARIANCE: "false",
  PERF_BUDGET_MAX_HEAP_DELTA_MB: "80",
  PERF_BUDGET_HEAP_EPSILON_MB: "1",
}

const sharedLocalBudgets = {
  BENCH_SEEDS: "1337,7331",
  BENCH_WARMUP_RUNS: "1",
  BENCH_VUE_MEASUREMENT_BATCH_SIZE: "5",
  BENCH_VUE_MEASUREMENT_SAMPLE_COUNT: "5",
  BENCH_VUE_MEASUREMENT_WARMUP_COUNT: "1",
  BENCH_ROWMODEL_MEASUREMENT_BATCH_SIZE: "8",
  BENCH_ROWMODEL_WARMUP_BATCHES: "1",
  BENCH_LIVEWIRE_MEASUREMENT_BATCH_SIZE: "5",
  BENCH_LIVEWIRE_MEASUREMENT_SAMPLE_COUNT: "5",
  BENCH_LIVEWIRE_MEASUREMENT_WARMUP_COUNT: "1",
  PERF_BUDGET_MAX_VARIANCE_PCT: "Infinity",
  PERF_BUDGET_VARIANCE_MIN_MEAN_MS: "0.5",
  PERF_BUDGET_ENFORCE_HYDRATE_RATE_VARIANCE: "false",
  PERF_BUDGET_MAX_HEAP_DELTA_MB: "Infinity",
  PERF_BUDGET_HEAP_EPSILON_MB: "1",
}

const selectedSharedBudgets = mode === "ci" ? sharedCiBudgets : sharedLocalBudgets

mkdirSync(outputDir, { recursive: true })

const tasks = [
  {
    id: "vue-adapters",
    command: "node",
    args: ["./scripts/bench-vue-adapters.mjs"],
    jsonPath: `${outputDir}/bench-vue-adapters.json`,
    logPath: `${outputDir}/bench-vue-adapters.log`,
    budgets: {
      ci: {
        PERF_BUDGET_TOTAL_MS: "1400",
        PERF_BUDGET_MAX_VARIANCE_PCT: "60",
        PERF_BUDGET_MAX_BOOTSTRAP_MS: "8",
        PERF_BUDGET_MAX_CONTROLLER_MS: "30",
        PERF_BUDGET_MAX_RELAYOUT_MS: "6",
      },
      local: {
        PERF_BUDGET_TOTAL_MS: "Infinity",
        PERF_BUDGET_MAX_BOOTSTRAP_MS: "Infinity",
        PERF_BUDGET_MAX_CONTROLLER_MS: "Infinity",
        PERF_BUDGET_MAX_RELAYOUT_MS: "Infinity",
      },
    },
  },
  {
    id: "laravel-morph",
    command: "node",
    args: ["./scripts/bench-livewire-morph.mjs"],
    jsonPath: `${outputDir}/bench-livewire-morph.json`,
    logPath: `${outputDir}/bench-livewire-morph.log`,
    budgets: {
      ci: {
        PERF_BUDGET_TOTAL_MS: "6000",
        PERF_BUDGET_MAX_VARIANCE_PCT: "160",
        PERF_BUDGET_MAX_BOOTSTRAP_MS: "12",
        PERF_BUDGET_MAX_HYDRATE_RATE_PCT: "25",
        PERF_BUDGET_MAX_OPEN_CLOSE_MS: "2",
      },
      local: {
        PERF_BUDGET_TOTAL_MS: "Infinity",
        PERF_BUDGET_MAX_BOOTSTRAP_MS: "Infinity",
        PERF_BUDGET_MAX_HYDRATE_RATE_PCT: "Infinity",
        PERF_BUDGET_MAX_OPEN_CLOSE_MS: "Infinity",
      },
    },
  },
  {
    id: "interaction-models",
    command: "node",
    args: ["./scripts/bench-datagrid-interactions.mjs"],
    jsonPath: `${outputDir}/bench-datagrid-interactions.json`,
    logPath: `${outputDir}/bench-datagrid-interactions.log`,
    budgets: {
      ci: {
        PERF_BUDGET_TOTAL_MS: "3500",
        PERF_BUDGET_MAX_VARIANCE_PCT: "120",
        PERF_BUDGET_MAX_SELECTION_DRAG_P95_MS: "5",
        PERF_BUDGET_MAX_SELECTION_DRAG_P99_MS: "8",
        PERF_BUDGET_MAX_FILL_APPLY_P95_MS: "8",
        PERF_BUDGET_MAX_FILL_APPLY_P99_MS: "14",
      },
      local: {
        PERF_BUDGET_TOTAL_MS: "Infinity",
        PERF_BUDGET_MAX_SELECTION_DRAG_P95_MS: "Infinity",
        PERF_BUDGET_MAX_SELECTION_DRAG_P99_MS: "Infinity",
        PERF_BUDGET_MAX_FILL_APPLY_P95_MS: "Infinity",
        PERF_BUDGET_MAX_FILL_APPLY_P99_MS: "Infinity",
      },
    },
  },
  {
    id: "datasource-churn",
    command: "node",
    args: ["./scripts/bench-datagrid-datasource-churn.mjs"],
    jsonPath: `${outputDir}/bench-datagrid-datasource-churn.json`,
    logPath: `${outputDir}/bench-datagrid-datasource-churn.log`,
    budgets: {
      ci: {
        PERF_BUDGET_TOTAL_MS: "9000",
        PERF_BUDGET_MAX_VARIANCE_PCT: "120",
        PERF_BUDGET_MAX_SCROLL_BURST_P95_MS: "20",
        PERF_BUDGET_MAX_SCROLL_BURST_P99_MS: "35",
        PERF_BUDGET_MAX_FILTER_BURST_P95_MS: "22",
        PERF_BUDGET_MAX_FILTER_BURST_P99_MS: "40",
        PERF_BUDGET_MIN_PULL_COALESCED: "1",
        PERF_BUDGET_MIN_PULL_DEFERRED: "1",
      },
      local: {
        PERF_BUDGET_TOTAL_MS: "Infinity",
        PERF_BUDGET_MAX_SCROLL_BURST_P95_MS: "Infinity",
        PERF_BUDGET_MAX_SCROLL_BURST_P99_MS: "Infinity",
        PERF_BUDGET_MAX_FILTER_BURST_P95_MS: "Infinity",
        PERF_BUDGET_MAX_FILTER_BURST_P99_MS: "Infinity",
        PERF_BUDGET_MIN_PULL_COALESCED: "0",
        PERF_BUDGET_MIN_PULL_DEFERRED: "0",
      },
    },
  },
  {
    id: "derived-cache",
    command: "node",
    args: ["--expose-gc", "./scripts/bench-datagrid-derived-cache.mjs"],
    jsonPath: `${outputDir}/bench-datagrid-derived-cache.json`,
    logPath: `${outputDir}/bench-datagrid-derived-cache.log`,
    budgets: {
      ci: {
        PERF_BUDGET_TOTAL_MS: "7000",
        PERF_BUDGET_MAX_VARIANCE_PCT: "120",
        PERF_BUDGET_MAX_STABLE_P95_MS: "8",
        PERF_BUDGET_MAX_INVALIDATED_P95_MS: "18",
        PERF_BUDGET_MIN_STABLE_FILTER_HIT_RATE_PCT: "80",
        PERF_BUDGET_MIN_STABLE_SORT_HIT_RATE_PCT: "90",
        PERF_BUDGET_MIN_STABLE_GROUP_HIT_RATE_PCT: "70",
        PERF_BUDGET_MIN_INVALIDATED_FILTER_MISSES: "10",
      },
      local: {
        PERF_BUDGET_TOTAL_MS: "Infinity",
        PERF_BUDGET_MAX_STABLE_P95_MS: "Infinity",
        PERF_BUDGET_MAX_INVALIDATED_P95_MS: "Infinity",
        PERF_BUDGET_MIN_STABLE_FILTER_HIT_RATE_PCT: "0",
        PERF_BUDGET_MIN_STABLE_SORT_HIT_RATE_PCT: "0",
        PERF_BUDGET_MIN_STABLE_GROUP_HIT_RATE_PCT: "0",
        PERF_BUDGET_MIN_INVALIDATED_FILTER_MISSES: "0",
      },
    },
  },
  {
    id: "tree-workload",
    command: "node",
    args: ["--expose-gc", "./scripts/bench-datagrid-tree-workload.mjs"],
    jsonPath: `${outputDir}/bench-datagrid-tree-workload.json`,
    logPath: `${outputDir}/bench-datagrid-tree-workload.log`,
    budgets: {
      ci: {
        PERF_BUDGET_TOTAL_MS: "9000",
        PERF_BUDGET_MAX_VARIANCE_PCT: "60",
        PERF_BUDGET_MAX_HEAP_DELTA_MB: "140",
        PERF_BUDGET_MAX_EXPAND_BURST_P95_MS: "25",
        PERF_BUDGET_MAX_EXPAND_BURST_P99_MS: "40",
        PERF_BUDGET_MAX_FILTER_SORT_BURST_P95_MS: "18",
        PERF_BUDGET_MAX_FILTER_SORT_BURST_P99_MS: "30",
      },
      local: {
        PERF_BUDGET_TOTAL_MS: "Infinity",
        PERF_BUDGET_MAX_HEAP_DELTA_MB: "Infinity",
        PERF_BUDGET_MAX_EXPAND_BURST_P95_MS: "Infinity",
        PERF_BUDGET_MAX_EXPAND_BURST_P99_MS: "Infinity",
        PERF_BUDGET_MAX_FILTER_SORT_BURST_P95_MS: "Infinity",
        PERF_BUDGET_MAX_FILTER_SORT_BURST_P99_MS: "Infinity",
      },
    },
  },
  {
    id: "row-models",
    command: "node",
    args: ["--expose-gc", "./scripts/bench-datagrid-rowmodels.mjs"],
    jsonPath: `${outputDir}/bench-datagrid-rowmodels.json`,
    logPath: `${outputDir}/bench-datagrid-rowmodels.log`,
    budgets: {
      ci: {
        PERF_BUDGET_TOTAL_MS: "9000",
        PERF_BUDGET_MAX_HEAP_DELTA_MB: "140",
        PERF_BUDGET_MAX_CLIENT_RANGE_P95_MS: "5",
        PERF_BUDGET_MAX_CLIENT_RANGE_P99_MS: "8",
        PERF_BUDGET_MAX_SERVER_RANGE_P95_MS: "35",
        PERF_BUDGET_MAX_SERVER_RANGE_P99_MS: "55",
        PERF_BUDGET_MAX_WINDOW_SHIFT_P95_MS: "10",
        PERF_BUDGET_MAX_WINDOW_SHIFT_P99_MS: "16",
      },
      local: {
        PERF_BUDGET_TOTAL_MS: "Infinity",
        PERF_BUDGET_MAX_CLIENT_RANGE_P95_MS: "Infinity",
        PERF_BUDGET_MAX_CLIENT_RANGE_P99_MS: "Infinity",
        PERF_BUDGET_MAX_SERVER_RANGE_P95_MS: "Infinity",
        PERF_BUDGET_MAX_SERVER_RANGE_P99_MS: "Infinity",
        PERF_BUDGET_MAX_WINDOW_SHIFT_P95_MS: "Infinity",
        PERF_BUDGET_MAX_WINDOW_SHIFT_P99_MS: "Infinity",
      },
    },
  },
]

const results = []
let hasFailure = false

function runTask(command, args, env) {
  return new Promise(resolveTask => {
    const proc = spawn(command, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""
    let settled = false

    const finalize = (status, signal) => {
      if (settled) {
        return
      }
      settled = true
      resolveTask({
        status: typeof status === "number" ? status : 1,
        signal: signal ?? null,
        stdout,
        stderr,
      })
    }

    proc.stdout?.on("data", chunk => {
      const text = chunk.toString()
      stdout += text
      process.stdout.write(text)
    })

    proc.stderr?.on("data", chunk => {
      const text = chunk.toString()
      stderr += text
      process.stderr.write(text)
    })

    proc.on("error", error => {
      const message = `Task process spawn error: ${error instanceof Error ? error.message : String(error)}\n`
      stderr += message
      process.stderr.write(message)
      finalize(1, null)
    })

    proc.on("close", (code, signal) => {
      finalize(code ?? 1, signal)
    })
  })
}

for (const task of tasks) {
  const taskBudgets = mode === "ci" ? task.budgets.ci : task.budgets.local
  const env = {
    ...baseEnv,
    ...selectedSharedBudgets,
    ...taskBudgets,
    BENCH_OUTPUT_JSON: task.jsonPath,
  }

  console.log(`\n[bench] running ${task.id}...`)
  const startedAt = Date.now()
  const proc = await runTask(task.command, task.args, env)
  const durationMs = Date.now() - startedAt

  const stdout = proc.stdout ?? ""
  const stderr = proc.stderr ?? ""
  const combined = `${stdout}${stderr ? `\n${stderr}` : ""}`.trim()

  writeFileSync(task.logPath, combined)

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
  budgets: {
    shared: selectedSharedBudgets,
    byTask: tasks.map((task) => ({
      id: task.id,
      budgets: mode === "ci" ? task.budgets.ci : task.budgets.local,
    })),
  },
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
