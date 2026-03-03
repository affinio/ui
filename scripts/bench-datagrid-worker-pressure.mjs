#!/usr/bin/env node

import { performance } from "node:perf_hooks"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { chromium } from "@playwright/test"

const BENCH_BROWSER_BASE_URL = process.env.BENCH_BROWSER_BASE_URL ?? "http://127.0.0.1:4173"
const BENCH_BROWSER_ROUTE = process.env.BENCH_BROWSER_ROUTE ?? "/datagrid/worker"
const BENCH_WORKER_MODES = (process.env.BENCH_WORKER_PRESSURE_MODES ?? "main-thread,worker-owned")
  .split(",")
  .map(value => value.trim())
  .filter(Boolean)
const BENCH_SESSIONS = Number.parseInt(process.env.BENCH_WORKER_PRESSURE_SESSIONS ?? "2", 10)
const BENCH_ROW_COUNT = Number.parseInt(process.env.BENCH_WORKER_PRESSURE_ROW_COUNT ?? "100000", 10)
const BENCH_PATCH_ITERATIONS = Number.parseInt(process.env.BENCH_WORKER_PRESSURE_PATCH_ITERATIONS ?? "36", 10)
const BENCH_PATCH_SIZE = Number.parseInt(process.env.BENCH_WORKER_PRESSURE_PATCH_SIZE ?? "4000", 10)
const BENCH_FORMATTER_PASSES = Number.parseInt(process.env.BENCH_WORKER_PRESSURE_FORMATTER_PASSES ?? "4", 10)
const BENCH_DEEP_CLONE_PASSES = Number.parseInt(process.env.BENCH_WORKER_PRESSURE_DEEP_CLONE_PASSES ?? "3", 10)
const BENCH_VIEWPORT_SAMPLE_SIZE = Number.parseInt(process.env.BENCH_WORKER_PRESSURE_VIEWPORT_SAMPLE_SIZE ?? "220", 10)
const BENCH_HEADLESS = (process.env.BENCH_WORKER_PRESSURE_HEADLESS ?? "true").trim().toLowerCase() !== "false"
const BENCH_OUTPUT_JSON = process.env.BENCH_OUTPUT_JSON
  ? resolve(process.env.BENCH_OUTPUT_JSON)
  : resolve("artifacts/performance/bench-datagrid-worker-pressure.json")
const BENCH_VIEWPORT_SELECTOR = ".datagrid-sugar-stage__viewport, .datagrid-stage__viewport"

const PERF_BUDGET_TOTAL_MS = Number.parseFloat(process.env.PERF_BUDGET_TOTAL_MS ?? "Infinity")
const PERF_BUDGET_MAX_MAIN_FRAME_P95_MS = Number.parseFloat(process.env.PERF_BUDGET_MAX_MAIN_FRAME_P95_MS ?? "Infinity")
const PERF_BUDGET_MAX_MAIN_DROPPED_PCT = Number.parseFloat(process.env.PERF_BUDGET_MAX_MAIN_DROPPED_PCT ?? "Infinity")
const PERF_BUDGET_MAX_WORKER_FRAME_P95_MS = Number.parseFloat(process.env.PERF_BUDGET_MAX_WORKER_FRAME_P95_MS ?? "Infinity")
const PERF_BUDGET_MAX_WORKER_DROPPED_PCT = Number.parseFloat(process.env.PERF_BUDGET_MAX_WORKER_DROPPED_PCT ?? "Infinity")
const PERF_BUDGET_MAX_WORKER_FRAME_DRIFT_PCT = Number.parseFloat(process.env.PERF_BUDGET_MAX_WORKER_FRAME_DRIFT_PCT ?? "Infinity")
const PERF_BUDGET_MAX_WORKER_TOTAL_DRIFT_PCT = Number.parseFloat(process.env.PERF_BUDGET_MAX_WORKER_TOTAL_DRIFT_PCT ?? "Infinity")
const PERF_BUDGET_MAX_VARIANCE_PCT = Number.parseFloat(process.env.PERF_BUDGET_MAX_VARIANCE_PCT ?? "Infinity")
const PERF_BUDGET_VARIANCE_MIN_MEAN_MS = Number.parseFloat(process.env.PERF_BUDGET_VARIANCE_MIN_MEAN_MS ?? "0.5")

assertPositiveInteger(BENCH_SESSIONS, "BENCH_WORKER_PRESSURE_SESSIONS")
assertPositiveInteger(BENCH_ROW_COUNT, "BENCH_WORKER_PRESSURE_ROW_COUNT")
assertPositiveInteger(BENCH_PATCH_ITERATIONS, "BENCH_WORKER_PRESSURE_PATCH_ITERATIONS")
assertPositiveInteger(BENCH_PATCH_SIZE, "BENCH_WORKER_PRESSURE_PATCH_SIZE")
assertNonNegativeInteger(BENCH_FORMATTER_PASSES, "BENCH_WORKER_PRESSURE_FORMATTER_PASSES")
assertNonNegativeInteger(BENCH_DEEP_CLONE_PASSES, "BENCH_WORKER_PRESSURE_DEEP_CLONE_PASSES")
assertPositiveInteger(BENCH_VIEWPORT_SAMPLE_SIZE, "BENCH_WORKER_PRESSURE_VIEWPORT_SAMPLE_SIZE")
if (!BENCH_WORKER_MODES.length) {
  throw new Error("BENCH_WORKER_PRESSURE_MODES must include at least one runtime mode")
}

function assertPositiveInteger(value, label) {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
}

function assertNonNegativeInteger(value, label) {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`)
  }
}

function quantile(values, q) {
  if (!values.length) {
    return 0
  }
  const sorted = [...values].sort((left, right) => left - right)
  const position = Math.max(0, Math.min(1, q)) * (sorted.length - 1)
  const base = Math.floor(position)
  const rest = position - base
  const current = sorted[base] ?? 0
  const next = sorted[base + 1] ?? current
  return current + (next - current) * rest
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

function shouldEnforceVariance(metric) {
  return (
    PERF_BUDGET_MAX_VARIANCE_PCT !== Number.POSITIVE_INFINITY
    && metric.mean >= PERF_BUDGET_VARIANCE_MIN_MEAN_MS
  )
}

function computeFrameMetrics(frameDeltas) {
  const normalized = frameDeltas.filter(delta => Number.isFinite(delta) && delta > 0).slice(2)
  const frameStats = stats(normalized)
  const droppedFrames = normalized.filter(delta => delta > 20).length
  const droppedPct = normalized.length > 0 ? (droppedFrames / normalized.length) * 100 : 0
  return {
    sampleCount: normalized.length,
    frameStats,
    droppedFrames,
    droppedPct,
  }
}

async function runPressureSession(page, mode, sessionIndex) {
  await page.goto(`${BENCH_BROWSER_BASE_URL}${BENCH_BROWSER_ROUTE}`, {
    waitUntil: "networkidle",
    timeout: 120000,
  })
  await page.waitForSelector(BENCH_VIEWPORT_SELECTOR, { timeout: 30000 })
  await page.waitForFunction(() => Boolean(window.__affinoWorkerBench?.runPressureScenario), { timeout: 30000 })

  const result = await page.evaluate(async (input) => {
    const bridge = window.__affinoWorkerBench
    if (!bridge) {
      throw new Error("window.__affinoWorkerBench bridge is unavailable")
    }
    const frameDeltas = []
    let active = true
    let lastTs = performance.now()
    const tick = (ts) => {
      frameDeltas.push(ts - lastTs)
      lastTs = ts
      if (active) {
        requestAnimationFrame(tick)
      }
    }
    requestAnimationFrame(tick)

    const report = await bridge.runPressureScenario({
      mode: input.mode,
      rowCount: input.rowCount,
      patchIterations: input.patchIterations,
      patchSize: input.patchSize,
      formatterPasses: input.formatterPasses,
      deepClonePasses: input.deepClonePasses,
      viewportSampleSize: input.viewportSampleSize,
    })

    await new Promise(resolvePause => setTimeout(resolvePause, 32))
    active = false
    await new Promise(resolvePause => setTimeout(resolvePause, 20))

    return { report, frameDeltas }
  }, {
    mode,
    rowCount: BENCH_ROW_COUNT,
    patchIterations: BENCH_PATCH_ITERATIONS,
    patchSize: BENCH_PATCH_SIZE,
    formatterPasses: BENCH_FORMATTER_PASSES,
    deepClonePasses: BENCH_DEEP_CLONE_PASSES,
    viewportSampleSize: BENCH_VIEWPORT_SAMPLE_SIZE,
    sessionIndex,
  })

  return {
    mode,
    report: result.report,
    frame: computeFrameMetrics(result.frameDeltas),
  }
}

const budgetErrors = []
const varianceSkippedChecks = []
const startedAt = performance.now()

console.log("\nAffino DataGrid Worker Pressure Benchmark")
console.log(
  `baseUrl=${BENCH_BROWSER_BASE_URL} route=${BENCH_BROWSER_ROUTE} modes=${BENCH_WORKER_MODES.join(",")} sessions=${BENCH_SESSIONS} rows=${BENCH_ROW_COUNT}`,
)

const browser = await chromium.launch({
  headless: BENCH_HEADLESS,
  args: ["--disable-dev-shm-usage"],
})
const context = await browser.newContext({
  viewport: { width: 1680, height: 1050 },
})

const sessions = []

try {
  for (const mode of BENCH_WORKER_MODES) {
    for (let session = 0; session < BENCH_SESSIONS; session += 1) {
      console.log(`[worker-pressure] mode=${mode} session ${session + 1}/${BENCH_SESSIONS}...`)
      const page = await context.newPage()
      const metrics = await runPressureSession(page, mode, session)
      sessions.push({
        mode,
        session: session + 1,
        ...metrics,
      })
      await page.close()
    }
  }
} finally {
  await context.close()
  await browser.close()
}

const elapsedMs = performance.now() - startedAt
if (elapsedMs > PERF_BUDGET_TOTAL_MS) {
  budgetErrors.push(`elapsed ${elapsedMs.toFixed(3)}ms exceeds PERF_BUDGET_TOTAL_MS=${PERF_BUDGET_TOTAL_MS}ms`)
}

const byMode = {}
for (const mode of BENCH_WORKER_MODES) {
  const modeSessions = sessions.filter(entry => entry.mode === mode)
  byMode[mode] = {
    frameP95Ms: stats(modeSessions.map(entry => entry.frame.frameStats.p95)),
    frameP99Ms: stats(modeSessions.map(entry => entry.frame.frameStats.p99)),
    droppedPct: stats(modeSessions.map(entry => entry.frame.droppedPct)),
    totalElapsedMs: stats(modeSessions.map(entry => entry.report.totalElapsedMs)),
    patchAppliedP95Ms: stats(modeSessions.map(entry => entry.report.patchAppliedP95Ms)),
    patchAppliedP99Ms: stats(modeSessions.map(entry => entry.report.patchAppliedP99Ms)),
  }
}

if (byMode["main-thread"]) {
  if (byMode["main-thread"].frameP95Ms.p95 > PERF_BUDGET_MAX_MAIN_FRAME_P95_MS) {
    budgetErrors.push(
      `main-thread frame p95 ${byMode["main-thread"].frameP95Ms.p95.toFixed(3)}ms exceeds PERF_BUDGET_MAX_MAIN_FRAME_P95_MS=${PERF_BUDGET_MAX_MAIN_FRAME_P95_MS}ms`,
    )
  }
  if (byMode["main-thread"].droppedPct.p95 > PERF_BUDGET_MAX_MAIN_DROPPED_PCT) {
    budgetErrors.push(
      `main-thread dropped p95 ${byMode["main-thread"].droppedPct.p95.toFixed(2)}% exceeds PERF_BUDGET_MAX_MAIN_DROPPED_PCT=${PERF_BUDGET_MAX_MAIN_DROPPED_PCT}%`,
    )
  }
}

if (byMode["worker-owned"]) {
  if (byMode["worker-owned"].frameP95Ms.p95 > PERF_BUDGET_MAX_WORKER_FRAME_P95_MS) {
    budgetErrors.push(
      `worker-owned frame p95 ${byMode["worker-owned"].frameP95Ms.p95.toFixed(3)}ms exceeds PERF_BUDGET_MAX_WORKER_FRAME_P95_MS=${PERF_BUDGET_MAX_WORKER_FRAME_P95_MS}ms`,
    )
  }
  if (byMode["worker-owned"].droppedPct.p95 > PERF_BUDGET_MAX_WORKER_DROPPED_PCT) {
    budgetErrors.push(
      `worker-owned dropped p95 ${byMode["worker-owned"].droppedPct.p95.toFixed(2)}% exceeds PERF_BUDGET_MAX_WORKER_DROPPED_PCT=${PERF_BUDGET_MAX_WORKER_DROPPED_PCT}%`,
    )
  }
}

if (byMode["main-thread"] && byMode["worker-owned"]) {
  const mainFrame = byMode["main-thread"].frameP95Ms.p95
  if (mainFrame > 0 && PERF_BUDGET_MAX_WORKER_FRAME_DRIFT_PCT !== Number.POSITIVE_INFINITY) {
    const frameDriftPct = ((byMode["worker-owned"].frameP95Ms.p95 - mainFrame) / mainFrame) * 100
    if (frameDriftPct > PERF_BUDGET_MAX_WORKER_FRAME_DRIFT_PCT) {
      budgetErrors.push(
        `worker-owned frame drift ${frameDriftPct.toFixed(2)}% exceeds PERF_BUDGET_MAX_WORKER_FRAME_DRIFT_PCT=${PERF_BUDGET_MAX_WORKER_FRAME_DRIFT_PCT}%`,
      )
    }
  }

  const mainElapsed = byMode["main-thread"].totalElapsedMs.p95
  if (mainElapsed > 0 && PERF_BUDGET_MAX_WORKER_TOTAL_DRIFT_PCT !== Number.POSITIVE_INFINITY) {
    const totalDriftPct = ((byMode["worker-owned"].totalElapsedMs.p95 - mainElapsed) / mainElapsed) * 100
    if (totalDriftPct > PERF_BUDGET_MAX_WORKER_TOTAL_DRIFT_PCT) {
      budgetErrors.push(
        `worker-owned total elapsed drift ${totalDriftPct.toFixed(2)}% exceeds PERF_BUDGET_MAX_WORKER_TOTAL_DRIFT_PCT=${PERF_BUDGET_MAX_WORKER_TOTAL_DRIFT_PCT}%`,
      )
    }
  }
}

for (const mode of BENCH_WORKER_MODES) {
  const aggregate = byMode[mode]
  if (!aggregate) {
    continue
  }
  for (const metric of [
    { name: `${mode} frame p95`, stat: aggregate.frameP95Ms },
    { name: `${mode} dropped`, stat: aggregate.droppedPct },
    { name: `${mode} elapsed`, stat: aggregate.totalElapsedMs },
  ]) {
    if (PERF_BUDGET_MAX_VARIANCE_PCT === Number.POSITIVE_INFINITY) {
      continue
    }
    if (!shouldEnforceVariance(metric.stat)) {
      varianceSkippedChecks.push(
        `${metric.name} CV gate skipped (mean ${metric.stat.mean.toFixed(3)} < PERF_BUDGET_VARIANCE_MIN_MEAN_MS=${PERF_BUDGET_VARIANCE_MIN_MEAN_MS})`,
      )
      continue
    }
    if (metric.stat.cvPct > PERF_BUDGET_MAX_VARIANCE_PCT) {
      budgetErrors.push(
        `${metric.name} CV ${metric.stat.cvPct.toFixed(2)}% exceeds PERF_BUDGET_MAX_VARIANCE_PCT=${PERF_BUDGET_MAX_VARIANCE_PCT}%`,
      )
    }
  }
}

const summary = {
  benchmark: "datagrid-worker-pressure",
  generatedAt: new Date().toISOString(),
  config: {
    baseUrl: BENCH_BROWSER_BASE_URL,
    route: BENCH_BROWSER_ROUTE,
    modes: BENCH_WORKER_MODES,
    sessions: BENCH_SESSIONS,
    rowCount: BENCH_ROW_COUNT,
    patchIterations: BENCH_PATCH_ITERATIONS,
    patchSize: BENCH_PATCH_SIZE,
    formatterPasses: BENCH_FORMATTER_PASSES,
    deepClonePasses: BENCH_DEEP_CLONE_PASSES,
    viewportSampleSize: BENCH_VIEWPORT_SAMPLE_SIZE,
    headless: BENCH_HEADLESS,
  },
  budgets: {
    totalMs: PERF_BUDGET_TOTAL_MS,
    maxMainFrameP95Ms: PERF_BUDGET_MAX_MAIN_FRAME_P95_MS,
    maxMainDroppedPct: PERF_BUDGET_MAX_MAIN_DROPPED_PCT,
    maxWorkerFrameP95Ms: PERF_BUDGET_MAX_WORKER_FRAME_P95_MS,
    maxWorkerDroppedPct: PERF_BUDGET_MAX_WORKER_DROPPED_PCT,
    maxWorkerFrameDriftPct: PERF_BUDGET_MAX_WORKER_FRAME_DRIFT_PCT,
    maxWorkerTotalDriftPct: PERF_BUDGET_MAX_WORKER_TOTAL_DRIFT_PCT,
    maxVariancePct: PERF_BUDGET_MAX_VARIANCE_PCT,
    varianceMinMeanMs: PERF_BUDGET_VARIANCE_MIN_MEAN_MS,
  },
  aggregate: {
    elapsedMs,
    byMode,
  },
  varianceSkippedChecks,
  sessions,
  budgetErrors,
  ok: budgetErrors.length === 0,
}

mkdirSync(dirname(BENCH_OUTPUT_JSON), { recursive: true })
writeFileSync(BENCH_OUTPUT_JSON, JSON.stringify(summary, null, 2))

console.log(`\nBenchmark summary written: ${BENCH_OUTPUT_JSON}`)
for (const mode of BENCH_WORKER_MODES) {
  const aggregate = byMode[mode]
  if (!aggregate) {
    continue
  }
  console.log(
    `${mode}: frame p95=${aggregate.frameP95Ms.p95.toFixed(3)}ms dropped p95=${aggregate.droppedPct.p95.toFixed(2)}% total p95=${aggregate.totalElapsedMs.p95.toFixed(2)}ms`,
  )
}

if (budgetErrors.length > 0) {
  console.error("\nWorker pressure benchmark budget check failed:")
  for (const error of budgetErrors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}
