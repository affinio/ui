#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

const reportPath = resolve(
  process.env.DATAGRID_PERF_CONTRACTS_REPORT ?? "artifacts/quality/datagrid-perf-contracts-report.json",
)
const targetScore = Number.parseFloat(process.env.DATAGRID_PERF_CONTRACTS_TARGET_SCORE ?? "9.5")

const checks = []

function registerFileCheck(id, file, description) {
  const absolutePath = resolve(file)
  const ok = existsSync(absolutePath)
  checks.push({
    id,
    description,
    type: "file",
    file,
    ok,
    message: ok ? "present" : "missing",
  })
}

function registerTokenCheck(id, file, tokens, description) {
  const absolutePath = resolve(file)
  if (!existsSync(absolutePath)) {
    checks.push({
      id,
      description,
      type: "token",
      file,
      tokens,
      ok: false,
      message: "file-missing",
    })
    return
  }

  const source = readFileSync(absolutePath, "utf8")
  const missing = tokens.filter(token => !source.includes(token))
  checks.push({
    id,
    description,
    type: "token",
    file,
    tokens,
    ok: missing.length === 0,
    message: missing.length === 0 ? "all-tokens-present" : `missing: ${missing.join(", ")}`,
  })
}

function registerForbiddenTokenCheck(id, file, forbidden, description) {
  const absolutePath = resolve(file)
  if (!existsSync(absolutePath)) {
    checks.push({
      id,
      description,
      type: "forbidden-token",
      file,
      forbidden,
      ok: false,
      message: "file-missing",
    })
    return
  }

  const source = readFileSync(absolutePath, "utf8")
  const found = forbidden.filter(token => source.includes(token))
  checks.push({
    id,
    description,
    type: "forbidden-token",
    file,
    forbidden,
    ok: found.length === 0,
    message: found.length === 0 ? "none-found" : `found-forbidden: ${found.join(", ")}`,
  })
}

registerFileCheck(
  "viewport-virtualization-file",
  "packages/datagrid-core/src/viewport/dataGridViewportVirtualization.ts",
  "Viewport virtualization hot path implementation",
)
registerFileCheck(
  "perf-hot-path-contract-test",
  "packages/datagrid-core/src/viewport/__tests__/perfHotPath.contract.spec.ts",
  "Perf hot-path contract tests",
)
registerFileCheck(
  "perf-gates-doc",
  "docs/datagrid-performance-gates.md",
  "Performance gates documentation",
)
registerFileCheck(
  "perf-runtime-doc",
  "docs/datagrid-perf-by-design-runtime.md",
  "Perf-by-design runtime contracts documentation",
)
registerFileCheck(
  "benchmark-report-gate-script",
  "scripts/check-datagrid-benchmark-report.mjs",
  "Runtime benchmark report gate script",
)
registerFileCheck(
  "interaction-benchmark-script",
  "scripts/bench-datagrid-interactions.mjs",
  "Interaction benchmark for selection/fill virtualization pressure",
)

registerTokenCheck(
  "viewport-object-pool-contract",
  "packages/datagrid-core/src/viewport/dataGridViewportVirtualization.ts",
  [
    "const rowPool: RowPoolItem[] = []",
    "const visibleSnapshotBuffers: VisibleRow[][] = [[], [], []]",
    "function copyToSnapshot(",
    "function computeRowsCallbackSignature(",
  ],
  "Viewport hot path uses explicit object-pool contracts",
)

registerForbiddenTokenCheck(
  "viewport-no-slice-allocation-hot-path",
  "packages/datagrid-core/src/viewport/dataGridViewportVirtualization.ts",
  ["buffer.slice(0, filled)", '.join("|")'],
  "Viewport hot path avoids per-frame slice/join allocations",
)

registerTokenCheck(
  "rowmodels-p99-budgets",
  "scripts/bench-datagrid-rowmodels.mjs",
  [
    "PERF_BUDGET_MAX_CLIENT_RANGE_P99_MS",
    "PERF_BUDGET_MAX_SERVER_RANGE_P99_MS",
    "PERF_BUDGET_MAX_WINDOW_SHIFT_P99_MS",
  ],
  "Row-model benchmark enforces p99 frame budgets",
)

registerTokenCheck(
  "harness-p99-budgets",
  "scripts/bench-datagrid-harness.mjs",
  [
    "PERF_BUDGET_MAX_CLIENT_RANGE_P99_MS",
    "PERF_BUDGET_MAX_SERVER_RANGE_P99_MS",
    "PERF_BUDGET_MAX_WINDOW_SHIFT_P99_MS",
    "PERF_BUDGET_MAX_SELECTION_DRAG_P99_MS",
    "PERF_BUDGET_MAX_FILL_APPLY_P99_MS",
  ],
  "Benchmark harness propagates p99 budgets into CI profile",
)

registerTokenCheck(
  "interaction-benchmark-p99-budgets",
  "scripts/bench-datagrid-interactions.mjs",
  [
    "PERF_BUDGET_MAX_SELECTION_DRAG_P95_MS",
    "PERF_BUDGET_MAX_SELECTION_DRAG_P99_MS",
    "PERF_BUDGET_MAX_FILL_APPLY_P95_MS",
    "PERF_BUDGET_MAX_FILL_APPLY_P99_MS",
  ],
  "Interaction benchmark enforces p95/p99 budgets for selection/fill flows",
)

registerTokenCheck(
  "quality-script-perf-contracts",
  "package.json",
  ["quality:perf:datagrid", "check-datagrid-perf-contracts.mjs"],
  "Root scripts include perf contract gate command",
)

registerTokenCheck(
  "benchmark-regression-gate-script",
  "package.json",
  [
    "bench:datagrid:harness:ci:gate",
    "check-datagrid-benchmark-report.mjs",
    "bench:regression",
    "bench:datagrid:interactions",
    "bench:datagrid:interactions:assert",
  ],
  "Runtime benchmark regression uses explicit report gate script",
)

const totalChecks = checks.length
const passedChecks = checks.filter(check => check.ok).length
const failedChecks = checks.filter(check => !check.ok)
const score = Number(((passedChecks / totalChecks) * 10).toFixed(2))
const ok = failedChecks.length === 0 && score >= targetScore

const report = {
  generatedAt: new Date().toISOString(),
  targetScore,
  score,
  ok,
  totals: {
    checks: totalChecks,
    passed: passedChecks,
    failed: failedChecks.length,
  },
  failedChecks,
  checks,
}

mkdirSync(dirname(reportPath), { recursive: true })
writeFileSync(reportPath, JSON.stringify(report, null, 2))

console.log("\nDataGrid Perf Contracts")
console.log(`report: ${reportPath}`)
console.log(`score: ${score.toFixed(2)} / 10`)
console.log(`target: ${targetScore.toFixed(2)}`)
console.log(`checks: ${passedChecks}/${totalChecks}`)

if (failedChecks.length > 0) {
  console.error("\nFailed checks:")
  for (const check of failedChecks) {
    console.error(`- [${check.id}] ${check.description} (${check.message})`)
  }
}

if (!ok) {
  process.exit(1)
}
