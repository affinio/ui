#!/usr/bin/env node

import { performance } from "node:perf_hooks"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { chromium } from "@playwright/test"

const BENCH_BROWSER_BASE_URL = process.env.BENCH_BROWSER_BASE_URL ?? "http://127.0.0.1:4173"
const BENCH_BROWSER_ROUTE = process.env.BENCH_BROWSER_ROUTE ?? "/datagrid/worker"
const BENCH_BROWSER_MODES = (process.env.BENCH_WORKER_BROWSER_MODES ?? "main-thread,worker-owned")
  .split(",")
  .map(value => value.trim())
  .filter(Boolean)
const BENCH_BROWSER_SESSIONS = Number.parseInt(process.env.BENCH_BROWSER_SESSIONS ?? "3", 10)
const BENCH_BROWSER_SCROLL_STEPS = Number.parseInt(process.env.BENCH_BROWSER_SCROLL_STEPS ?? "180", 10)
const BENCH_BROWSER_STEP_DELAY_MS = Number.parseInt(process.env.BENCH_BROWSER_STEP_DELAY_MS ?? "8", 10)
const BENCH_BROWSER_HEADLESS = (process.env.BENCH_BROWSER_HEADLESS ?? "true").trim().toLowerCase() !== "false"
const BENCH_OUTPUT_JSON = process.env.BENCH_OUTPUT_JSON
  ? resolve(process.env.BENCH_OUTPUT_JSON)
  : resolve("artifacts/performance/bench-datagrid-worker-browser-frames.json")
const BENCH_VIEWPORT_SELECTOR = ".datagrid-sugar-stage__viewport, .datagrid-stage__viewport"

const PERF_BUDGET_TOTAL_MS = Number.parseFloat(process.env.PERF_BUDGET_TOTAL_MS ?? "Infinity")
const PERF_BUDGET_MAX_MAIN_FRAME_P95_MS = Number.parseFloat(process.env.PERF_BUDGET_MAX_MAIN_FRAME_P95_MS ?? "Infinity")
const PERF_BUDGET_MAX_MAIN_DROPPED_PCT = Number.parseFloat(process.env.PERF_BUDGET_MAX_MAIN_DROPPED_PCT ?? "Infinity")
const PERF_BUDGET_MAX_WORKER_FRAME_P95_MS = Number.parseFloat(process.env.PERF_BUDGET_MAX_WORKER_FRAME_P95_MS ?? "Infinity")
const PERF_BUDGET_MAX_WORKER_DROPPED_PCT = Number.parseFloat(process.env.PERF_BUDGET_MAX_WORKER_DROPPED_PCT ?? "Infinity")
const PERF_BUDGET_MAX_WORKER_FRAME_DRIFT_PCT = Number.parseFloat(process.env.PERF_BUDGET_MAX_WORKER_FRAME_DRIFT_PCT ?? "Infinity")
const PERF_BUDGET_MAX_VARIANCE_PCT = Number.parseFloat(process.env.PERF_BUDGET_MAX_VARIANCE_PCT ?? "Infinity")
const PERF_BUDGET_VARIANCE_MIN_MEAN_MS = Number.parseFloat(process.env.PERF_BUDGET_VARIANCE_MIN_MEAN_MS ?? "0.5")

assertPositiveInteger(BENCH_BROWSER_SESSIONS, "BENCH_BROWSER_SESSIONS")
assertPositiveInteger(BENCH_BROWSER_SCROLL_STEPS, "BENCH_BROWSER_SCROLL_STEPS")
assertPositiveInteger(BENCH_BROWSER_STEP_DELAY_MS, "BENCH_BROWSER_STEP_DELAY_MS")
if (!BENCH_BROWSER_MODES.length) {
  throw new Error("BENCH_WORKER_BROWSER_MODES must include at least one mode")
}

function assertPositiveInteger(value, label) {
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
    throw new Error(`${label} must be a positive integer`)
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

function computeFrameMetrics(frameDeltas) {
  const filtered = frameDeltas.filter(delta => Number.isFinite(delta) && delta > 0).slice(2)
  const frameStats = stats(filtered)
  const droppedFrames = filtered.filter(delta => delta > 20).length
  const droppedPct = filtered.length > 0 ? (droppedFrames / filtered.length) * 100 : 0
  const fps = frameStats.mean > 0 ? 1000 / frameStats.mean : 0
  return {
    sampleCount: filtered.length,
    frameStats,
    droppedFrames,
    droppedPct,
    fps,
  }
}

async function runSession(page, mode, index) {
  await page.goto(`${BENCH_BROWSER_BASE_URL}${BENCH_BROWSER_ROUTE}`, {
    waitUntil: "networkidle",
    timeout: 120000,
  })
  await page.waitForSelector(BENCH_VIEWPORT_SELECTOR, { timeout: 30000 })
  await page.waitForSelector("[data-bench-runtime-mode]", { timeout: 30000 })
  const currentMode = await page.$eval(
    "[data-bench-runtime-mode]",
    element => (element instanceof HTMLSelectElement ? element.value : ""),
  )
  if (currentMode === mode) {
    const fallbackMode = mode === "worker-owned" ? "main-thread" : "worker-owned"
    await page.selectOption("[data-bench-runtime-mode]", fallbackMode)
    await page.waitForTimeout(100)
  }
  await page.selectOption("[data-bench-runtime-mode]", mode)
  await page.waitForFunction(
    ({ runtimeMode, viewportSelector }) => {
      const modeSelect = document.querySelector("[data-bench-runtime-mode]")
      if (!(modeSelect instanceof HTMLSelectElement) || modeSelect.value !== runtimeMode) {
        return false
      }
      const viewport = document.querySelector(viewportSelector)
      if (!(viewport instanceof HTMLElement)) {
        return false
      }
      return viewport.clientHeight > 0
    },
    {
      runtimeMode: mode,
      viewportSelector: BENCH_VIEWPORT_SELECTOR,
    },
    { timeout: 15000 },
  )
  await page.waitForTimeout(120)

  const result = await page.evaluate(async ({ steps, stepDelayMs, index, viewportSelector }) => {
    const viewport = document.querySelector(viewportSelector)
    if (!(viewport instanceof HTMLElement)) {
      throw new Error(`Datagrid viewport not found (${viewportSelector})`)
    }

    const maxTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
    const maxLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
    const frameDeltas = []

    let running = true
    let last = performance.now()

    const tick = (timestamp) => {
      frameDeltas.push(timestamp - last)
      last = timestamp
      if (running) {
        requestAnimationFrame(tick)
      }
    }
    requestAnimationFrame(tick)

    const pause = (ms) => new Promise(resolvePause => setTimeout(resolvePause, ms))

    for (let step = 1; step <= steps; step += 1) {
      const phase = ((step + index) % 4)
      if (phase === 0 || phase === 1) {
        if (maxTop > 0) {
          viewport.scrollTop = Math.round((maxTop * step) / steps)
        }
      } else if (maxLeft > 0) {
        viewport.scrollLeft = Math.round((maxLeft * step) / steps)
      }
      await pause(stepDelayMs)
    }

    await pause(Math.max(32, stepDelayMs * 2))
    running = false
    await pause(24)

    return {
      frameDeltas,
      maxTop,
      maxLeft,
      finalTop: viewport.scrollTop,
      finalLeft: viewport.scrollLeft,
    }
  }, {
    steps: BENCH_BROWSER_SCROLL_STEPS,
    stepDelayMs: BENCH_BROWSER_STEP_DELAY_MS,
    index,
    viewportSelector: BENCH_VIEWPORT_SELECTOR,
  })

  return {
    mode,
    ...computeFrameMetrics(result.frameDeltas),
    maxTop: result.maxTop,
    maxLeft: result.maxLeft,
    finalTop: result.finalTop,
    finalLeft: result.finalLeft,
  }
}

const budgetErrors = []
const varianceSkippedChecks = []
const startedAt = performance.now()

console.log("\nAffino DataGrid Worker Browser Frame Benchmark")
console.log(`baseUrl=${BENCH_BROWSER_BASE_URL} route=${BENCH_BROWSER_ROUTE} modes=${BENCH_BROWSER_MODES.join(",")} sessions=${BENCH_BROWSER_SESSIONS}`)

const browser = await chromium.launch({
  headless: BENCH_BROWSER_HEADLESS,
  args: ["--disable-dev-shm-usage"],
})

const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
})

const sessions = []

try {
  for (const mode of BENCH_BROWSER_MODES) {
    for (let session = 0; session < BENCH_BROWSER_SESSIONS; session += 1) {
      console.log(`[worker-browser] mode=${mode} session ${session + 1}/${BENCH_BROWSER_SESSIONS}...`)
      const page = await context.newPage()
      const metrics = await runSession(page, mode, session)
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

const nonScrollableSessions = sessions.filter(session => session.maxTop <= 0 && session.maxLeft <= 0)
if (nonScrollableSessions.length > 0) {
  const sample = nonScrollableSessions
    .slice(0, 4)
    .map(session => `${session.mode}#${session.session}`)
    .join(", ")
  budgetErrors.push(
    `non-scrollable viewport in ${nonScrollableSessions.length}/${sessions.length} sessions (${sample})`,
  )
}

const byMode = {}
for (const mode of BENCH_BROWSER_MODES) {
  const modeSessions = sessions.filter(session => session.mode === mode)
  byMode[mode] = {
    frameP95Ms: stats(modeSessions.map(session => session.frameStats.p95)),
    frameP99Ms: stats(modeSessions.map(session => session.frameStats.p99)),
    droppedPct: stats(modeSessions.map(session => session.droppedPct)),
    fps: stats(modeSessions.map(session => session.fps)),
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
      `main-thread dropped frame pct p95 ${byMode["main-thread"].droppedPct.p95.toFixed(2)} exceeds PERF_BUDGET_MAX_MAIN_DROPPED_PCT=${PERF_BUDGET_MAX_MAIN_DROPPED_PCT}`,
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
      `worker-owned dropped frame pct p95 ${byMode["worker-owned"].droppedPct.p95.toFixed(2)} exceeds PERF_BUDGET_MAX_WORKER_DROPPED_PCT=${PERF_BUDGET_MAX_WORKER_DROPPED_PCT}`,
    )
  }
}

if (
  byMode["main-thread"]
  && byMode["worker-owned"]
  && PERF_BUDGET_MAX_WORKER_FRAME_DRIFT_PCT !== Number.POSITIVE_INFINITY
) {
  const mainP95 = byMode["main-thread"].frameP95Ms.p95
  if (mainP95 > 0) {
    const driftPct = ((byMode["worker-owned"].frameP95Ms.p95 - mainP95) / mainP95) * 100
    if (driftPct > PERF_BUDGET_MAX_WORKER_FRAME_DRIFT_PCT) {
      budgetErrors.push(
        `worker-owned frame drift ${driftPct.toFixed(2)}% exceeds PERF_BUDGET_MAX_WORKER_FRAME_DRIFT_PCT=${PERF_BUDGET_MAX_WORKER_FRAME_DRIFT_PCT}%`,
      )
    }
  }
}

for (const mode of BENCH_BROWSER_MODES) {
  const aggregate = byMode[mode]
  if (!aggregate) {
    continue
  }
  for (const metric of [
    { name: `${mode} frame p95`, stat: aggregate.frameP95Ms },
    { name: `${mode} dropped pct`, stat: aggregate.droppedPct },
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
  benchmark: "datagrid-worker-browser-frames",
  generatedAt: new Date().toISOString(),
  config: {
    baseUrl: BENCH_BROWSER_BASE_URL,
    route: BENCH_BROWSER_ROUTE,
    modes: BENCH_BROWSER_MODES,
    sessions: BENCH_BROWSER_SESSIONS,
    scrollSteps: BENCH_BROWSER_SCROLL_STEPS,
    stepDelayMs: BENCH_BROWSER_STEP_DELAY_MS,
    headless: BENCH_BROWSER_HEADLESS,
  },
  budgets: {
    totalMs: PERF_BUDGET_TOTAL_MS,
    maxMainFrameP95Ms: PERF_BUDGET_MAX_MAIN_FRAME_P95_MS,
    maxMainDroppedPct: PERF_BUDGET_MAX_MAIN_DROPPED_PCT,
    maxWorkerFrameP95Ms: PERF_BUDGET_MAX_WORKER_FRAME_P95_MS,
    maxWorkerDroppedPct: PERF_BUDGET_MAX_WORKER_DROPPED_PCT,
    maxWorkerFrameDriftPct: PERF_BUDGET_MAX_WORKER_FRAME_DRIFT_PCT,
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
for (const mode of BENCH_BROWSER_MODES) {
  const aggregate = byMode[mode]
  if (!aggregate) continue
  console.log(
    `${mode}: frame p95=${aggregate.frameP95Ms.p95.toFixed(3)}ms dropped p95=${aggregate.droppedPct.p95.toFixed(2)}%`,
  )
}

if (budgetErrors.length > 0) {
  console.error("\nWorker browser-frame benchmark budget check failed:")
  for (const error of budgetErrors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}
