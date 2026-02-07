#!/usr/bin/env node

import { performance } from "node:perf_hooks"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { JSDOM } from "jsdom"

const ROOTS_PER_KIND = Number.parseInt(process.env.ROOTS_PER_KIND ?? "120", 10)
const CONTROLLER_ITERATIONS = Number.parseInt(process.env.CONTROLLER_ITERATIONS ?? "2000", 10)
const RELAYOUT_ITERATIONS = Number.parseInt(process.env.RELAYOUT_ITERATIONS ?? "1600", 10)
const BENCH_SEED = Number.parseInt(process.env.BENCH_SEED ?? "1337", 10)
const BENCH_SEEDS = (process.env.BENCH_SEEDS ?? `${BENCH_SEED}`)
  .split(",")
  .map((value) => Number.parseInt(value.trim(), 10))
  .filter((value) => Number.isFinite(value) && value > 0)
const PERF_BUDGET_TOTAL_MS = Number.parseFloat(process.env.PERF_BUDGET_TOTAL_MS ?? "Infinity")
const PERF_BUDGET_MAX_BOOTSTRAP_MS = Number.parseFloat(process.env.PERF_BUDGET_MAX_BOOTSTRAP_MS ?? "Infinity")
const PERF_BUDGET_MAX_CONTROLLER_MS = Number.parseFloat(process.env.PERF_BUDGET_MAX_CONTROLLER_MS ?? "Infinity")
const PERF_BUDGET_MAX_RELAYOUT_MS = Number.parseFloat(process.env.PERF_BUDGET_MAX_RELAYOUT_MS ?? "Infinity")
const PERF_BUDGET_MAX_VARIANCE_PCT = Number.parseFloat(process.env.PERF_BUDGET_MAX_VARIANCE_PCT ?? "Infinity")
const PERF_BUDGET_MAX_HEAP_DELTA_MB = Number.parseFloat(process.env.PERF_BUDGET_MAX_HEAP_DELTA_MB ?? "Infinity")
const BENCH_OUTPUT_JSON = process.env.BENCH_OUTPUT_JSON ? resolve(process.env.BENCH_OUTPUT_JSON) : null

const PACKAGES = [
  { name: "dialog-vue", rootAttr: "data-affino-dialog-root", kind: "surface" },
  { name: "menu-vue", rootAttr: "data-affino-menu-root", kind: "surface" },
  { name: "popover-vue", rootAttr: "data-affino-popover-root", kind: "surface" },
  { name: "tooltip-vue", rootAttr: "data-affino-tooltip-root", kind: "surface" },
  { name: "selection-vue", rootAttr: "data-affino-selection-root", kind: "selection" },
  { name: "grid-selection-vue", rootAttr: "data-affino-grid-selection-root", kind: "selection" },
  { name: "tabs-vue", rootAttr: "data-affino-tabs-root", kind: "tabs" },
  { name: "treeview-vue", rootAttr: "data-affino-treeview-root", kind: "treeview" },
  { name: "disclosure-vue", rootAttr: "data-affino-disclosure-root", kind: "disclosure" },
]

assertPositive(ROOTS_PER_KIND, "ROOTS_PER_KIND")
assertPositive(CONTROLLER_ITERATIONS, "CONTROLLER_ITERATIONS")
assertPositive(RELAYOUT_ITERATIONS, "RELAYOUT_ITERATIONS")
assertPositive(BENCH_SEED, "BENCH_SEED")
if (!BENCH_SEEDS.length) {
  throw new Error("BENCH_SEEDS must include at least one positive integer")
}

if (PERF_BUDGET_MAX_VARIANCE_PCT !== Number.POSITIVE_INFINITY) {
  assertPositive(PERF_BUDGET_MAX_VARIANCE_PCT, "PERF_BUDGET_MAX_VARIANCE_PCT")
}
if (PERF_BUDGET_MAX_HEAP_DELTA_MB !== Number.POSITIVE_INFINITY) {
  assertPositive(PERF_BUDGET_MAX_HEAP_DELTA_MB, "PERF_BUDGET_MAX_HEAP_DELTA_MB")
}

function assertPositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be > 0`)
  }
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
    return { mean: 0, stdev: 0, p50: 0, p90: 0, cvPct: 0 }
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  const stdev = Math.sqrt(variance)
  const p50 = quantile(values, 0.5)
  const p90 = quantile(values, 0.9)
  const cvPct = mean === 0 ? 0 : (stdev / mean) * 100
  return { mean, stdev, p50, p90, cvPct }
}

function computeFloatingPosition(anchorRect, surfaceRect, viewport) {
  const gutter = 8
  const left = Math.max(8, Math.min(anchorRect.x, viewport.width - surfaceRect.width - 8))
  const top = Math.max(8, Math.min(anchorRect.y + anchorRect.height + gutter, viewport.height - surfaceRect.height - 8))
  return { left, top }
}

function runBench(seed) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>")
  const { document } = dom.window

  let rngState = seed % 2147483647
  if (rngState <= 0) {
    rngState += 2147483646
  }

  function nextRandom() {
    rngState = (rngState * 16807) % 2147483647
    return (rngState - 1) / 2147483646
  }

  function createRoots() {
    for (const pkg of PACKAGES) {
      const host = document.createElement("section")
      host.setAttribute("data-vue-bench-host", pkg.name)
      for (let index = 0; index < ROOTS_PER_KIND; index += 1) {
        const root = document.createElement("div")
        root.setAttribute(pkg.rootAttr, `${pkg.name}-${index}`)
        const trigger = document.createElement("button")
        trigger.textContent = `trigger-${index}`
        const content = document.createElement("div")
        content.textContent = `content-${index}`
        root.appendChild(trigger)
        root.appendChild(content)
        host.appendChild(root)
      }
      document.body.appendChild(host)
    }
  }

  function runBootstrapProxy(pkg) {
    const host = document.querySelector(`[data-vue-bench-host=\"${pkg.name}\"]`)
    if (!host) {
      return 0
    }
    const start = performance.now()
    const nodes = host.querySelectorAll(`[${pkg.rootAttr}]`)
    for (const node of nodes) {
      if (!node.isConnected) {
        throw new Error("Disconnected root during bootstrap proxy")
      }
    }
    return performance.now() - start
  }

  function runControllerChurnProxy(pkg) {
    const start = performance.now()
    const subscriptions = []
    for (let index = 0; index < CONTROLLER_ITERATIONS; index += 1) {
      let state = {
        open: false,
        highlighted: null,
        value: null,
        seq: index,
      }
      const listeners = []
      const subscribe = (listener) => {
        listeners.push(listener)
        return () => {
          const listenerIndex = listeners.indexOf(listener)
          if (listenerIndex >= 0) {
            listeners.splice(listenerIndex, 1)
          }
        }
      }
      const unsubscribe = subscribe((next) => {
        state = next
      })

      if (pkg.kind === "surface" || pkg.kind === "disclosure") {
        state = { ...state, open: index % 2 === 0 }
      } else if (pkg.kind === "tabs") {
        state = { ...state, value: index % 3 === 0 ? `tab-${index % 7}` : null }
      } else if (pkg.kind === "treeview") {
        state = {
          ...state,
          open: index % 2 === 0,
          highlighted: index % 4 === 0 ? `node-${index % 9}` : null,
          value: index % 3 === 0 ? `node-${(index + 1) % 11}` : null,
        }
      } else {
        state = { ...state, highlighted: index % 5 === 0 ? `item-${index}` : null }
      }

      for (const listener of listeners) {
        listener(state)
      }

      subscriptions.push(unsubscribe)
    }

    for (const unsubscribe of subscriptions) {
      unsubscribe()
    }

    return performance.now() - start
  }

  function runRelayoutProxy(pkg) {
    if (pkg.kind !== "surface") {
      return 0
    }
    const start = performance.now()
    const viewport = { width: 1440, height: 900 }
    let checksum = 0

    for (let index = 0; index < RELAYOUT_ITERATIONS; index += 1) {
      const anchorRect = {
        x: Math.round(nextRandom() * 1200),
        y: Math.round(nextRandom() * 700),
        width: 40 + Math.round(nextRandom() * 120),
        height: 24 + Math.round(nextRandom() * 40),
      }
      const surfaceRect = {
        width: 120 + Math.round(nextRandom() * 260),
        height: 80 + Math.round(nextRandom() * 220),
      }
      const pos = computeFloatingPosition(anchorRect, surfaceRect, viewport)
      checksum += pos.left + pos.top
    }

    if (!Number.isFinite(checksum)) {
      throw new Error(`Invalid relayout checksum for ${pkg.name}`)
    }

    return performance.now() - start
  }

  createRoots()

  const heapStart = process.memoryUsage().heapUsed
  const t0 = performance.now()
  const rows = PACKAGES.map((pkg) => {
    const bootstrapMs = runBootstrapProxy(pkg)
    const controllerChurnMs = runControllerChurnProxy(pkg)
    const relayoutMs = runRelayoutProxy(pkg)
    return {
      package: pkg.name,
      roots: ROOTS_PER_KIND,
      bootstrapMs: bootstrapMs.toFixed(2),
      bootstrapMsValue: bootstrapMs,
      controllerChurnMs: controllerChurnMs.toFixed(2),
      controllerChurnMsValue: controllerChurnMs,
      relayoutMs: relayoutMs.toFixed(2),
      relayoutMsValue: relayoutMs,
    }
  })
  const totalElapsed = performance.now() - t0
  const heapEnd = process.memoryUsage().heapUsed
  const heapDeltaMb = (heapEnd - heapStart) / (1024 * 1024)

  return { rows, totalElapsed, heapDeltaMb }
}

const budgetErrors = []
const runResults = []

console.log("\nAffino Vue Adapters Benchmark (synthetic)")
console.log(
  `roots/kind=${ROOTS_PER_KIND} controllerIterations=${CONTROLLER_ITERATIONS} relayoutIterations=${RELAYOUT_ITERATIONS} seeds=${BENCH_SEEDS.join(",")}`,
)

for (const seed of BENCH_SEEDS) {
  const result = runBench(seed)
  runResults.push({ seed, ...result })

  console.log(`\nSeed ${seed}`)
  console.table(
    result.rows.map((row) => ({
      package: row.package,
      roots: row.roots,
      bootstrapMs: row.bootstrapMs,
      controllerChurnMs: row.controllerChurnMs,
      relayoutMs: row.relayoutMs,
    })),
  )
  console.log(`Total elapsed: ${result.totalElapsed.toFixed(2)}ms`)
  console.log(`Heap delta: ${result.heapDeltaMb.toFixed(2)}MB`)

  if (result.totalElapsed > PERF_BUDGET_TOTAL_MS) {
    budgetErrors.push(
      `seed ${seed}: total elapsed ${result.totalElapsed.toFixed(2)}ms exceeds budget ${PERF_BUDGET_TOTAL_MS.toFixed(2)}ms`,
    )
  }
  if (result.heapDeltaMb > PERF_BUDGET_MAX_HEAP_DELTA_MB) {
    budgetErrors.push(
      `seed ${seed}: heap delta ${result.heapDeltaMb.toFixed(2)}MB exceeds budget ${PERF_BUDGET_MAX_HEAP_DELTA_MB.toFixed(2)}MB`,
    )
  }

  for (const row of result.rows) {
    if (row.bootstrapMsValue > PERF_BUDGET_MAX_BOOTSTRAP_MS) {
      budgetErrors.push(
        `seed ${seed} ${row.package}: bootstrap ${row.bootstrapMsValue.toFixed(2)}ms exceeds budget ${PERF_BUDGET_MAX_BOOTSTRAP_MS.toFixed(2)}ms`,
      )
    }
    if (row.controllerChurnMsValue > PERF_BUDGET_MAX_CONTROLLER_MS) {
      budgetErrors.push(
        `seed ${seed} ${row.package}: controller churn ${row.controllerChurnMsValue.toFixed(2)}ms exceeds budget ${PERF_BUDGET_MAX_CONTROLLER_MS.toFixed(2)}ms`,
      )
    }
    if (row.relayoutMsValue > PERF_BUDGET_MAX_RELAYOUT_MS) {
      budgetErrors.push(
        `seed ${seed} ${row.package}: relayout ${row.relayoutMsValue.toFixed(2)}ms exceeds budget ${PERF_BUDGET_MAX_RELAYOUT_MS.toFixed(2)}ms`,
      )
    }
  }
}

const summaryRows = PACKAGES.map((pkg) => {
  const bootstrapMs = runResults.map((run) => run.rows.find((row) => row.package === pkg.name)?.bootstrapMsValue ?? 0)
  const controllerMs = runResults.map((run) => run.rows.find((row) => row.package === pkg.name)?.controllerChurnMsValue ?? 0)
  const relayoutMs = runResults.map((run) => run.rows.find((row) => row.package === pkg.name)?.relayoutMsValue ?? 0)

  const bootstrapStats = stats(bootstrapMs)
  const controllerStats = stats(controllerMs)
  const relayoutStats = stats(relayoutMs)

  return {
    package: pkg.name,
    bootstrapP50: bootstrapStats.p50.toFixed(2),
    bootstrapP90: bootstrapStats.p90.toFixed(2),
    bootstrapCvPct: bootstrapStats.cvPct.toFixed(1),
    controllerP50: controllerStats.p50.toFixed(2),
    controllerP90: controllerStats.p90.toFixed(2),
    controllerCvPct: controllerStats.cvPct.toFixed(1),
    relayoutP50: relayoutStats.p50.toFixed(2),
    relayoutP90: relayoutStats.p90.toFixed(2),
    relayoutCvPct: relayoutStats.cvPct.toFixed(1),
  }
})

const elapsedStats = stats(runResults.map((run) => run.totalElapsed))
const heapStats = stats(runResults.map((run) => run.heapDeltaMb))

console.log("\nSummary (p50/p90 + CV%)")
console.table(summaryRows)
console.log(`Total elapsed p50=${elapsedStats.p50.toFixed(2)}ms p90=${elapsedStats.p90.toFixed(2)}ms CV=${elapsedStats.cvPct.toFixed(1)}%`)
console.log(`Heap delta p50=${heapStats.p50.toFixed(2)}MB p90=${heapStats.p90.toFixed(2)}MB CV=${heapStats.cvPct.toFixed(1)}%`)
console.log("Note: Synthetic proxy benchmark for Vue adapter hot paths.")

if (elapsedStats.cvPct > PERF_BUDGET_MAX_VARIANCE_PCT) {
  budgetErrors.push(
    `total elapsed CV ${elapsedStats.cvPct.toFixed(1)}% exceeded PERF_BUDGET_MAX_VARIANCE_PCT=${PERF_BUDGET_MAX_VARIANCE_PCT}%`,
  )
}

summaryRows.forEach((row) => {
  const cvTargets = [
    { label: "bootstrap", value: Number.parseFloat(row.bootstrapCvPct) },
    { label: "controller", value: Number.parseFloat(row.controllerCvPct) },
    { label: "relayout", value: Number.parseFloat(row.relayoutCvPct) },
  ]
  cvTargets.forEach((target) => {
    if (target.value > PERF_BUDGET_MAX_VARIANCE_PCT) {
      budgetErrors.push(
        `${row.package}: ${target.label} CV ${target.value.toFixed(1)}% exceeded PERF_BUDGET_MAX_VARIANCE_PCT=${PERF_BUDGET_MAX_VARIANCE_PCT}%`,
      )
    }
  })
})

const summary = {
  benchmark: "vue-adapters",
  generatedAt: new Date().toISOString(),
  config: {
    rootsPerKind: ROOTS_PER_KIND,
    controllerIterations: CONTROLLER_ITERATIONS,
    relayoutIterations: RELAYOUT_ITERATIONS,
    seeds: BENCH_SEEDS,
  },
  budgets: {
    totalMs: PERF_BUDGET_TOTAL_MS,
    maxBootstrapMs: PERF_BUDGET_MAX_BOOTSTRAP_MS,
    maxControllerMs: PERF_BUDGET_MAX_CONTROLLER_MS,
    maxRelayoutMs: PERF_BUDGET_MAX_RELAYOUT_MS,
    maxVariancePct: PERF_BUDGET_MAX_VARIANCE_PCT,
    maxHeapDeltaMb: PERF_BUDGET_MAX_HEAP_DELTA_MB,
  },
  aggregate: {
    elapsed: elapsedStats,
    heapDelta: heapStats,
  },
  perPackage: summaryRows,
  runs: runResults,
  budgetErrors,
  ok: budgetErrors.length === 0,
}

if (BENCH_OUTPUT_JSON) {
  mkdirSync(dirname(BENCH_OUTPUT_JSON), { recursive: true })
  writeFileSync(BENCH_OUTPUT_JSON, JSON.stringify(summary, null, 2))
  console.log(`Benchmark summary written: ${BENCH_OUTPUT_JSON}`)
}

if (budgetErrors.length > 0) {
  console.error("Performance budget failures:")
  for (const error of budgetErrors) {
    console.error(`- ${error}`)
  }
  process.exitCode = 1
}
