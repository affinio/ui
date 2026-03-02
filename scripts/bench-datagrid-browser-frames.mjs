#!/usr/bin/env node

import { performance } from "node:perf_hooks"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { chromium } from "@playwright/test"

const BENCH_BROWSER_BASE_URL = process.env.BENCH_BROWSER_BASE_URL ?? "http://127.0.0.1:4173"
const BENCH_BROWSER_ROUTE = process.env.BENCH_BROWSER_ROUTE ?? "/datagrid"
const BENCH_BROWSER_SESSIONS = Number.parseInt(process.env.BENCH_BROWSER_SESSIONS ?? "3", 10)
const BENCH_BROWSER_SCROLL_STEPS = Number.parseInt(process.env.BENCH_BROWSER_SCROLL_STEPS ?? "180", 10)
const BENCH_BROWSER_STEP_DELAY_MS = Number.parseInt(process.env.BENCH_BROWSER_STEP_DELAY_MS ?? "8", 10)
const BENCH_BROWSER_HEADLESS = (process.env.BENCH_BROWSER_HEADLESS ?? "true").trim().toLowerCase() !== "false"
const BENCH_OUTPUT_JSON = process.env.BENCH_OUTPUT_JSON
  ? resolve(process.env.BENCH_OUTPUT_JSON)
  : resolve("artifacts/performance/bench-datagrid-browser-frames.json")

const PERF_BUDGET_MAX_FRAME_P95_MS = Number.parseFloat(process.env.PERF_BUDGET_MAX_FRAME_P95_MS ?? "Infinity")
const PERF_BUDGET_MAX_FRAME_P99_MS = Number.parseFloat(process.env.PERF_BUDGET_MAX_FRAME_P99_MS ?? "Infinity")
const PERF_BUDGET_MIN_FPS = Number.parseFloat(process.env.PERF_BUDGET_MIN_FPS ?? "0")
const PERF_BUDGET_MAX_DROPPED_FRAME_PCT = Number.parseFloat(process.env.PERF_BUDGET_MAX_DROPPED_FRAME_PCT ?? "Infinity")
const PERF_BUDGET_MAX_LONG_TASK_FRAMES = Number.parseFloat(process.env.PERF_BUDGET_MAX_LONG_TASK_FRAMES ?? "Infinity")
const PERF_BUDGET_TOTAL_MS = Number.parseFloat(process.env.PERF_BUDGET_TOTAL_MS ?? "Infinity")
const PERF_BUDGET_MAX_VARIANCE_PCT = Number.parseFloat(process.env.PERF_BUDGET_MAX_VARIANCE_PCT ?? "Infinity")
const PERF_BUDGET_VARIANCE_MIN_MEAN_MS = Number.parseFloat(process.env.PERF_BUDGET_VARIANCE_MIN_MEAN_MS ?? "0.5")

assertPositiveInteger(BENCH_BROWSER_SESSIONS, "BENCH_BROWSER_SESSIONS")
assertPositiveInteger(BENCH_BROWSER_SCROLL_STEPS, "BENCH_BROWSER_SCROLL_STEPS")
assertPositiveInteger(BENCH_BROWSER_STEP_DELAY_MS, "BENCH_BROWSER_STEP_DELAY_MS")

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
  const longTaskFrames = filtered.filter(delta => delta > 50).length
  const droppedPct = filtered.length > 0 ? (droppedFrames / filtered.length) * 100 : 0
  const fps = frameStats.mean > 0 ? 1000 / frameStats.mean : 0
  return {
    sampleCount: filtered.length,
    frameStats,
    droppedFrames,
    droppedPct,
    longTaskFrames,
    fps,
  }
}

async function runSession(page, index) {
  const result = await page.evaluate(async ({ steps, stepDelayMs, index }) => {
    const viewport = document.querySelector(".datagrid-stage__viewport")
    if (!(viewport instanceof HTMLElement)) {
      throw new Error("Datagrid viewport not found (.datagrid-stage__viewport)")
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
      } else {
        if (maxLeft > 0) {
          viewport.scrollLeft = Math.round((maxLeft * step) / steps)
        }
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
  })

  const metrics = computeFrameMetrics(result.frameDeltas)
  return {
    ...metrics,
    maxTop: result.maxTop,
    maxLeft: result.maxLeft,
    finalTop: result.finalTop,
    finalLeft: result.finalLeft,
  }
}

const budgetErrors = []
const varianceSkippedChecks = []
const startedAt = performance.now()

console.log("\nAffino DataGrid Browser Frame Benchmark")
console.log(`baseUrl=${BENCH_BROWSER_BASE_URL} route=${BENCH_BROWSER_ROUTE} sessions=${BENCH_BROWSER_SESSIONS} steps=${BENCH_BROWSER_SCROLL_STEPS}`)

const browser = await chromium.launch({
  headless: BENCH_BROWSER_HEADLESS,
  args: ["--disable-dev-shm-usage"],
})

const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
})

const sessions = []

try {
  for (let session = 0; session < BENCH_BROWSER_SESSIONS; session += 1) {
    console.log(`[browser-frames] session ${session + 1}/${BENCH_BROWSER_SESSIONS}...`)
    const page = await context.newPage()
    await page.goto(`${BENCH_BROWSER_BASE_URL}${BENCH_BROWSER_ROUTE}`, {
      waitUntil: "networkidle",
      timeout: 120000,
    })
    await page.waitForSelector(".datagrid-stage__viewport", { timeout: 30000 })
    const metrics = await runSession(page, session)
    sessions.push({
      session: session + 1,
      ...metrics,
    })
    await page.close()
  }
} finally {
  await context.close()
  await browser.close()
}

const elapsedMs = performance.now() - startedAt
const frameP95 = stats(sessions.map(session => session.frameStats.p95))
const frameP99 = stats(sessions.map(session => session.frameStats.p99))
const fps = stats(sessions.map(session => session.fps))
const droppedPct = stats(sessions.map(session => session.droppedPct))
const longTaskFrames = stats(sessions.map(session => session.longTaskFrames))

if (elapsedMs > PERF_BUDGET_TOTAL_MS) {
  budgetErrors.push(`elapsed ${elapsedMs.toFixed(3)}ms exceeds PERF_BUDGET_TOTAL_MS=${PERF_BUDGET_TOTAL_MS}ms`)
}
if (frameP95.p95 > PERF_BUDGET_MAX_FRAME_P95_MS) {
  budgetErrors.push(`frame p95 ${frameP95.p95.toFixed(3)}ms exceeds PERF_BUDGET_MAX_FRAME_P95_MS=${PERF_BUDGET_MAX_FRAME_P95_MS}ms`)
}
if (frameP99.p95 > PERF_BUDGET_MAX_FRAME_P99_MS) {
  budgetErrors.push(`frame p99 ${frameP99.p95.toFixed(3)}ms exceeds PERF_BUDGET_MAX_FRAME_P99_MS=${PERF_BUDGET_MAX_FRAME_P99_MS}ms`)
}
if (fps.p50 < PERF_BUDGET_MIN_FPS) {
  budgetErrors.push(`fps p50 ${fps.p50.toFixed(2)} below PERF_BUDGET_MIN_FPS=${PERF_BUDGET_MIN_FPS}`)
}
if (droppedPct.p95 > PERF_BUDGET_MAX_DROPPED_FRAME_PCT) {
  budgetErrors.push(`dropped frame pct p95 ${droppedPct.p95.toFixed(2)} exceeds PERF_BUDGET_MAX_DROPPED_FRAME_PCT=${PERF_BUDGET_MAX_DROPPED_FRAME_PCT}`)
}
if (longTaskFrames.p95 > PERF_BUDGET_MAX_LONG_TASK_FRAMES) {
  budgetErrors.push(`long-task frames p95 ${longTaskFrames.p95.toFixed(2)} exceeds PERF_BUDGET_MAX_LONG_TASK_FRAMES=${PERF_BUDGET_MAX_LONG_TASK_FRAMES}`)
}

for (const aggregate of [
  { name: "frame p95", stat: frameP95 },
  { name: "frame p99", stat: frameP99 },
  { name: "fps", stat: fps },
  { name: "dropped frame pct", stat: droppedPct },
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
  benchmark: "datagrid-browser-frames",
  generatedAt: new Date().toISOString(),
  config: {
    baseUrl: BENCH_BROWSER_BASE_URL,
    route: BENCH_BROWSER_ROUTE,
    sessions: BENCH_BROWSER_SESSIONS,
    steps: BENCH_BROWSER_SCROLL_STEPS,
    stepDelayMs: BENCH_BROWSER_STEP_DELAY_MS,
    headless: BENCH_BROWSER_HEADLESS,
  },
  budgets: {
    totalMs: PERF_BUDGET_TOTAL_MS,
    maxFrameP95Ms: PERF_BUDGET_MAX_FRAME_P95_MS,
    maxFrameP99Ms: PERF_BUDGET_MAX_FRAME_P99_MS,
    minFps: PERF_BUDGET_MIN_FPS,
    maxDroppedFramePct: PERF_BUDGET_MAX_DROPPED_FRAME_PCT,
    maxLongTaskFrames: PERF_BUDGET_MAX_LONG_TASK_FRAMES,
    maxVariancePct: PERF_BUDGET_MAX_VARIANCE_PCT,
  },
  variancePolicy: {
    minMeanMsForCvGate: PERF_BUDGET_VARIANCE_MIN_MEAN_MS,
  },
  varianceSkippedChecks,
  aggregate: {
    elapsedMs,
    frameP95Ms: frameP95,
    frameP99Ms: frameP99,
    fps,
    droppedFramePct: droppedPct,
    longTaskFrames,
  },
  sessions,
  budgetErrors,
  ok: budgetErrors.length === 0,
}

mkdirSync(dirname(BENCH_OUTPUT_JSON), { recursive: true })
writeFileSync(BENCH_OUTPUT_JSON, JSON.stringify(summary, null, 2))

console.log(`\nBenchmark summary written: ${BENCH_OUTPUT_JSON}`)
console.log(`frame p95 p50=${frameP95.p50.toFixed(3)}ms p95=${frameP95.p95.toFixed(3)}ms fps p50=${fps.p50.toFixed(2)}`)

if (budgetErrors.length > 0) {
  console.error("\nBrowser frame benchmark budget check failed:")
  for (const error of budgetErrors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}
