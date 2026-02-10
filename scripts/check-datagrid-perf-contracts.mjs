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

function registerConditionCheck(id, ok, description, message) {
  checks.push({
    id,
    description,
    type: "condition",
    ok: Boolean(ok),
    message: ok ? "ok" : message,
  })
}

function extractEnvNumberFromScript(script, key) {
  if (typeof script !== "string" || script.length === 0) {
    return null
  }
  const pattern = new RegExp(`${key}=([^\\s]+)`)
  const match = script.match(pattern)
  if (!match) {
    return null
  }
  const raw = String(match[1] ?? "").trim()
  if (raw.length === 0 || raw.toLowerCase() === "infinity") {
    return null
  }
  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function extractFunctionBody(source, functionName) {
  if (typeof source !== "string" || source.length === 0) {
    return null
  }
  const marker = `function ${functionName}(`
  const start = source.indexOf(marker)
  if (start < 0) {
    return null
  }
  const bodyStart = source.indexOf("{", start)
  if (bodyStart < 0) {
    return null
  }
  const nextFunctionIndex = source.indexOf("\n\t\tfunction ", bodyStart + 1)
  const end = nextFunctionIndex > bodyStart ? nextFunctionIndex : source.length
  return source.slice(bodyStart + 1, end)
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
  "viewport-integration-contract-test",
  "packages/datagrid-core/src/viewport/__tests__/integrationSnapshot.contract.spec.ts",
  "Viewport integration snapshot contract tests",
)
registerFileCheck(
  "viewport-model-bridge-contract-test",
  "packages/datagrid-core/src/viewport/__tests__/modelBridge.contract.spec.ts",
  "Viewport model bridge contract tests",
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
registerFileCheck(
  "benchmark-baseline-lock-file",
  "docs/perf/datagrid-benchmark-baseline.json",
  "Benchmark baseline lock file for CI drift guard",
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

registerTokenCheck(
  "viewport-integration-contract-scenarios",
  "packages/datagrid-core/src/viewport/__tests__/integrationSnapshot.contract.spec.ts",
  [
    "keeps imperative non-force setters in async input->compute->apply phase",
    "uses refresh(true) only as scheduler flush and keeps async update phase",
    "schedules model invalidations asynchronously and keeps axis updates scoped",
    "keeps horizontal meta/sizing stable on pure vertical scroll motion",
    "skips heavy viewport apply for offscreen content-only row invalidation",
    "applies visible-range content-only row invalidation asynchronously",
  ],
  "Viewport integration contracts lock async-phase and axis/range invalidation scenarios",
)

registerTokenCheck(
  "viewport-axis-scope-horizontal-counter-contract",
  "packages/datagrid-core/src/viewport/__tests__/integrationSnapshot.contract.spec.ts",
  [
    "let buildHorizontalMetaCalls = 0",
    "expect(buildHorizontalMetaCalls).toBe(postColumnMetaCalls)",
    "expect(resolveHorizontalSizingCalls).toBe(postColumnSizingCalls)",
  ],
  "Axis-scoped row invalidation contract locks no horizontal meta/sizing recompute",
)

registerTokenCheck(
  "viewport-model-bridge-contract-scenarios",
  "packages/datagrid-core/src/viewport/__tests__/modelBridge.contract.spec.ts",
  [
    "does not emit bridge invalidation for viewport-only row model updates",
    "keeps row invalidation when row content changes with same rowCount",
    "emits normalized row-range payload for row-axis invalidation",
    "scope: \"content\"",
  ],
  "Model bridge contracts lock scoped invalidation semantics",
)

registerTokenCheck(
  "viewport-horizontal-sizing-decoupled-content-height",
  "packages/datagrid-core/src/viewport/dataGridViewportController.ts",
  [
    "const contentHeightEstimate = Math.max(rowCount * resolvedRowHeight, viewportHeightValue)",
    "resolveHorizontalSizingFn({",
    "viewportWidth: viewportWidthValue",
  ],
  "Controller keeps vertical content-height math outside horizontal sizing contract",
)

registerTokenCheck(
  "viewport-horizontal-meta-reuse-contract",
  "packages/datagrid-core/src/viewport/dataGridViewportController.ts",
  [
    "if (!lastHorizontalMeta || horizontalStructureDirty)",
    "columnMeta = lastHorizontalMeta",
    "const horizontalMotionDirty =",
    "const horizontalStructureDirty =",
  ],
  "Controller reuses horizontal meta across motion-only updates and rebuilds only on structural changes",
)

registerForbiddenTokenCheck(
  "viewport-no-legacy-horizontal-sizing-vertical-deps",
  "packages/datagrid-core/src/viewport/dataGridViewportController.ts",
  [
    "lastHorizontalSizingTotalRowCount",
    "lastHorizontalSizingResolvedRowHeight",
    "lastHorizontalSizingViewportHeight",
  ],
  "Controller does not keep legacy vertical dependency cache for horizontal sizing",
)

registerTokenCheck(
  "viewport-bridge-async-invalidation-contract",
  "packages/datagrid-core/src/viewport/dataGridViewportController.ts",
  [
    "onInvalidate: (invalidation: DataGridViewportModelBridgeInvalidation) => {",
    "scheduleUpdate(false)",
  ],
  "Bridge invalidations are scheduled through async non-force frame pipeline",
)

registerTokenCheck(
  "viewport-content-invalidation-offscreen-skip-contract",
  "packages/datagrid-core/src/viewport/dataGridViewportController.ts",
  [
    "pendingContentInvalidationRange",
    "invalidation.scope === \"content\"",
    "isRangeOutsideVisibleRows(",
  ],
  "Controller keeps explicit offscreen skip path for content-only row invalidations",
)

registerTokenCheck(
  "viewport-bridge-invalidation-scope-contract",
  "packages/datagrid-core/src/viewport/dataGridViewportModelBridgeService.ts",
  [
    "scope: \"structural\" | \"content\"",
    "const scope = isStableStructuralState ? \"content\" : \"structural\"",
  ],
  "Model bridge emits scoped row invalidations (structural/content)",
)

registerTokenCheck(
  "viewport-bridge-axis-rowrange-contract",
  "packages/datagrid-core/src/viewport/dataGridViewportModelBridgeService.ts",
  [
    "rows: reason !== \"columns\"",
    "columns: reason !== \"rows\"",
    "rowRange: reason === \"rows\" || reason === \"both\" ? normalizeViewportRange(rowRange) : null",
  ],
  "Model bridge invalidation payload keeps axis flags and rowRange scoped by reason",
)

{
  const controllerPath = resolve("packages/datagrid-core/src/viewport/dataGridViewportController.ts")
  const setterPhaseGuardId = "viewport-setter-no-sync-measure-layout"
  if (!existsSync(controllerPath)) {
    registerConditionCheck(
      setterPhaseGuardId,
      false,
      "setViewportMetricsValue keeps input phase async (no direct measureLayout)",
      "viewport controller file missing",
    )
  } else {
    const source = readFileSync(controllerPath, "utf8")
    const body = extractFunctionBody(source, "setViewportMetricsValue")
    const ok =
      body != null &&
      body.includes("scheduleUpdate(false)") &&
      !body.includes("measureLayout()")
    registerConditionCheck(
      setterPhaseGuardId,
      ok,
      "setViewportMetricsValue keeps input phase async (no direct measureLayout)",
      body == null
        ? "setViewportMetricsValue body not found"
        : "setViewportMetricsValue must schedule async update and avoid direct measureLayout()",
    )
  }
}

{
  const controllerPath = resolve("packages/datagrid-core/src/viewport/dataGridViewportController.ts")
  const refreshPhaseGuardId = "viewport-refresh-keeps-async-phase"
  if (!existsSync(controllerPath)) {
    registerConditionCheck(
      refreshPhaseGuardId,
      false,
      "refresh(force) keeps async input phase and only flushes scheduler",
      "viewport controller file missing",
    )
  } else {
    const source = readFileSync(controllerPath, "utf8")
    const body = extractFunctionBody(source, "refreshValue")
    const ok =
      body != null &&
      body.includes("scheduleUpdate(false)") &&
      !body.includes("scheduleUpdate(force === true)") &&
      body.includes("if (force === true)") &&
      body.includes("flushSchedulers()")
    registerConditionCheck(
      refreshPhaseGuardId,
      ok,
      "refresh(force) keeps async input phase and only flushes scheduler",
      body == null
        ? "refreshValue body not found"
        : "refreshValue must schedule non-force update and only use force to flush scheduler",
    )
  }
}

{
  const controllerPath = resolve("packages/datagrid-core/src/viewport/dataGridViewportController.ts")
  const forcePathGuardId = "viewport-force-path-limited-to-imperative-scroll"
  if (!existsSync(controllerPath)) {
    registerConditionCheck(
      forcePathGuardId,
      false,
      "force scheduleUpdate(true) is limited to imperative scroll APIs",
      "viewport controller file missing",
    )
  } else {
    const source = readFileSync(controllerPath, "utf8")
    const forceMatches = source.match(/scheduleUpdate\(true\)/g) ?? []
    const scrollToRowBody = extractFunctionBody(source, "scrollToRowValue")
    const scrollToColumnBody = extractFunctionBody(source, "scrollToColumnValue")
    const rowHasForce = Boolean(scrollToRowBody?.includes("scheduleUpdate(true)"))
    const colHasForce = Boolean(scrollToColumnBody?.includes("scheduleUpdate(true)"))
    const ok = forceMatches.length === 2 && rowHasForce && colHasForce
    registerConditionCheck(
      forcePathGuardId,
      ok,
      "force scheduleUpdate(true) is limited to imperative scroll APIs",
      `scheduleUpdate(true) count=${forceMatches.length}, scrollToRowHasForce=${rowHasForce}, scrollToColumnHasForce=${colHasForce}`,
    )
  }
}

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
    "bench:datagrid:datasource-churn",
    "bench:datagrid:datasource-churn:assert",
    "bench:datagrid:derived-cache",
    "bench:datagrid:derived-cache:assert",
  ],
  "Runtime benchmark regression uses explicit report gate script",
)

registerTokenCheck(
  "benchmark-harness-task-matrix-contract",
  "scripts/bench-datagrid-harness.mjs",
  [
    "id: \"vue-adapters\"",
    "id: \"laravel-morph\"",
    "id: \"interaction-models\"",
    "id: \"datasource-churn\"",
    "id: \"derived-cache\"",
    "id: \"row-models\"",
    "mode === \"ci\" ? task.budgets.ci : task.budgets.local",
  ],
  "Harness task matrix keeps required suite IDs and mode-scoped budget selection",
)

{
  const packageJsonPath = resolve("package.json")
  const benchGateOrderId = "benchmark-gate-script-order"
  if (!existsSync(packageJsonPath)) {
    registerConditionCheck(
      benchGateOrderId,
      false,
      "Benchmark gate script keeps order: harness ci -> benchmark report check",
      "package.json missing",
    )
  } else {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"))
    const gateScript = String(pkg?.scripts?.["bench:datagrid:harness:ci:gate"] ?? "")
    const harnessIndex = gateScript.indexOf("bench:datagrid:harness:ci")
    const reportCheckIndex = gateScript.indexOf("check-datagrid-benchmark-report.mjs")
    const ordered = harnessIndex >= 0 && reportCheckIndex > harnessIndex
    registerConditionCheck(
      benchGateOrderId,
      ordered,
      "Benchmark gate script keeps order: harness ci -> benchmark report check",
      `unexpected bench gate script order: '${gateScript}'`,
    )
  }
}

{
  const packageJsonPath = resolve("package.json")
  const regressionWiringId = "benchmark-regression-wiring"
  if (!existsSync(packageJsonPath)) {
    registerConditionCheck(
      regressionWiringId,
      false,
      "bench:regression delegates to bench:datagrid:harness:ci:gate",
      "package.json missing",
    )
  } else {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"))
    const regressionScript = String(pkg?.scripts?.["bench:regression"] ?? "")
    const wired = regressionScript.includes("bench:datagrid:harness:ci:gate")
    registerConditionCheck(
      regressionWiringId,
      wired,
      "bench:regression delegates to bench:datagrid:harness:ci:gate",
      `unexpected bench:regression script: '${regressionScript}'`,
    )
  }
}

{
  const packageJsonPath = resolve("package.json")
  const harnessCiModeId = "benchmark-harness-ci-mode"
  if (!existsSync(packageJsonPath)) {
    registerConditionCheck(
      harnessCiModeId,
      false,
      "bench:datagrid:harness:ci runs harness in DATAGRID_BENCH_MODE=ci profile",
      "package.json missing",
    )
  } else {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"))
    const harnessCiScript = String(pkg?.scripts?.["bench:datagrid:harness:ci"] ?? "")
    const hasCiMode = harnessCiScript.includes("DATAGRID_BENCH_MODE=ci")
    registerConditionCheck(
      harnessCiModeId,
      hasCiMode,
      "bench:datagrid:harness:ci runs harness in DATAGRID_BENCH_MODE=ci profile",
      `unexpected bench:datagrid:harness:ci script: '${harnessCiScript}'`,
    )
  }
}

{
  const packageJsonPath = resolve("package.json")
  const assertBudgetId = "benchmark-assert-finite-budgets"
  if (!existsSync(packageJsonPath)) {
    registerConditionCheck(
      assertBudgetId,
      false,
      "Rowmodel/interaction/datasource/derived assert scripts keep finite variance + heap budgets",
      "package.json missing",
    )
  } else {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"))
    const rowmodelsAssertScript = String(pkg?.scripts?.["bench:datagrid:rowmodels:assert"] ?? "")
    const interactionsAssertScript = String(pkg?.scripts?.["bench:datagrid:interactions:assert"] ?? "")
    const datasourceAssertScript = String(pkg?.scripts?.["bench:datagrid:datasource-churn:assert"] ?? "")
    const derivedCacheAssertScript = String(pkg?.scripts?.["bench:datagrid:derived-cache:assert"] ?? "")
    const rowmodelsVariance = extractEnvNumberFromScript(rowmodelsAssertScript, "PERF_BUDGET_MAX_VARIANCE_PCT")
    const rowmodelsHeap = extractEnvNumberFromScript(rowmodelsAssertScript, "PERF_BUDGET_MAX_HEAP_DELTA_MB")
    const interactionsVariance = extractEnvNumberFromScript(interactionsAssertScript, "PERF_BUDGET_MAX_VARIANCE_PCT")
    const interactionsHeap = extractEnvNumberFromScript(interactionsAssertScript, "PERF_BUDGET_MAX_HEAP_DELTA_MB")
    const datasourceVariance = extractEnvNumberFromScript(datasourceAssertScript, "PERF_BUDGET_MAX_VARIANCE_PCT")
    const datasourceHeap = extractEnvNumberFromScript(datasourceAssertScript, "PERF_BUDGET_MAX_HEAP_DELTA_MB")
    const derivedVariance = extractEnvNumberFromScript(derivedCacheAssertScript, "PERF_BUDGET_MAX_VARIANCE_PCT")
    const derivedHeap = extractEnvNumberFromScript(derivedCacheAssertScript, "PERF_BUDGET_MAX_HEAP_DELTA_MB")
    const ok =
      rowmodelsVariance != null &&
      rowmodelsHeap != null &&
      interactionsVariance != null &&
      interactionsHeap != null &&
      datasourceVariance != null &&
      datasourceHeap != null &&
      derivedVariance != null &&
      derivedHeap != null
    registerConditionCheck(
      assertBudgetId,
      ok,
      "Rowmodel/interaction/datasource/derived assert scripts keep finite variance + heap budgets",
      ok
        ? "ok"
        : `missing finite budget(s): rowmodels variance=${rowmodelsVariance}, rowmodels heap=${rowmodelsHeap}, interactions variance=${interactionsVariance}, interactions heap=${interactionsHeap}, datasource variance=${datasourceVariance}, datasource heap=${datasourceHeap}, derived variance=${derivedVariance}, derived heap=${derivedHeap}`,
    )
  }
}

registerTokenCheck(
  "benchmark-gate-finite-ci-guards",
  "scripts/check-datagrid-benchmark-report.mjs",
  [
    "shared-ci-variance-budget-finite",
    "shared-ci-heap-budget-finite",
    "shared-ci-no-infinity-budgets",
    "results-no-duplicate-task-ids",
    "task-${taskId}-ci-budgets-finite",
    "task-${taskId}-status-consistency",
    "task-${taskId}-artifact-freshness",
    "task-${taskId}-variance-budget-finite",
    "task-${taskId}-heap-budget-finite",
    "task-${taskId}-elapsed-variance",
    "task-${taskId}-heap-growth",
    "baseline-file",
    "task-${taskId}-baseline-entry",
    "task-${taskId}-baseline-duration-drift",
    "task-${taskId}-baseline-elapsed-drift",
    "task-${taskId}-baseline-heap-drift",
  ],
  "Benchmark gate enforces finite CI variance/heap budgets, aggregate variance+memory thresholds, and baseline drift lock",
)

registerTokenCheck(
  "benchmark-gate-ci-wiring",
  ".github/workflows/ci.yml",
  [
    "quality-gates:",
    "pnpm run quality:lock:datagrid:parity",
    "name: datagrid-quality-gates",
  ],
  "CI quality-gates job executes parity lock and publishes benchmark/quality artifacts",
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
