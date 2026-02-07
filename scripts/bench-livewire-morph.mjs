#!/usr/bin/env node

import { performance } from "node:perf_hooks"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { JSDOM } from "jsdom"

const ROOTS_PER_KIND = Number.parseInt(process.env.ROOTS_PER_KIND ?? "150", 10)
const ITERATIONS = Number.parseInt(process.env.ITERATIONS ?? "800", 10)
const STRUCTURE_MUTATION_RATE = Number.parseFloat(process.env.STRUCTURE_MUTATION_RATE ?? "0.15")
const BENCH_SEED = Number.parseInt(process.env.BENCH_SEED ?? "1337", 10)
const BENCH_SEEDS = (process.env.BENCH_SEEDS ?? `${BENCH_SEED}`)
  .split(",")
  .map((value) => Number.parseInt(value.trim(), 10))
  .filter((value) => Number.isFinite(value) && value > 0)
const PERF_BUDGET_TOTAL_MS = Number.parseFloat(process.env.PERF_BUDGET_TOTAL_MS ?? "Infinity")
const PERF_BUDGET_MAX_HYDRATE_RATE_PCT = Number.parseFloat(process.env.PERF_BUDGET_MAX_HYDRATE_RATE_PCT ?? "Infinity")
const PERF_BUDGET_MAX_BOOTSTRAP_MS = Number.parseFloat(process.env.PERF_BUDGET_MAX_BOOTSTRAP_MS ?? "Infinity")
const PERF_BUDGET_MAX_OPEN_CLOSE_MS = Number.parseFloat(process.env.PERF_BUDGET_MAX_OPEN_CLOSE_MS ?? "Infinity")
const PERF_BUDGET_MAX_VARIANCE_PCT = Number.parseFloat(process.env.PERF_BUDGET_MAX_VARIANCE_PCT ?? "Infinity")
const PERF_BUDGET_MAX_HEAP_DELTA_MB = Number.parseFloat(process.env.PERF_BUDGET_MAX_HEAP_DELTA_MB ?? "Infinity")
const BENCH_OUTPUT_JSON = process.env.BENCH_OUTPUT_JSON ? resolve(process.env.BENCH_OUTPUT_JSON) : null

const PACKAGES = [
  { name: "dialog", root: "[data-affino-dialog-root]", trigger: "[data-affino-dialog-trigger]", content: "[data-affino-dialog-overlay]" },
  { name: "menu", root: "[data-affino-menu-root]", trigger: "[data-affino-menu-trigger]", content: "[data-affino-menu-panel]" },
  { name: "popover", root: "[data-affino-popover-root]", trigger: "[data-affino-popover-trigger]", content: "[data-affino-popover-content]" },
  { name: "combobox", root: "[data-affino-combobox-root]", trigger: "[data-affino-combobox-input]", content: "[data-affino-combobox-surface]" },
  { name: "listbox", root: "[data-affino-listbox-root]", trigger: "[data-affino-listbox-trigger]", content: "[data-affino-listbox-surface]" },
  { name: "treeview", root: "[data-affino-treeview-root]", trigger: "[data-affino-treeview-item]", content: "[data-affino-treeview-item]" },
  { name: "tooltip", root: "[data-affino-tooltip-root]", trigger: "[data-affino-tooltip-trigger]", content: "[data-affino-tooltip-surface]" },
  { name: "tabs", root: "[data-affino-tabs-root]", trigger: "[data-affino-tabs-trigger]", content: "[data-affino-tabs-content]" },
  { name: "disclosure", root: "[data-affino-disclosure-root]", trigger: "[data-affino-disclosure-trigger]", content: "[data-affino-disclosure-content]" },
]

function assertFiniteInt(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number`)
  }
}

function assertFiniteNonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number`)
  }
}

assertFiniteInt(ROOTS_PER_KIND, "ROOTS_PER_KIND")
assertFiniteInt(ITERATIONS, "ITERATIONS")
assertFiniteInt(BENCH_SEED, "BENCH_SEED")
if (!BENCH_SEEDS.length) {
  throw new Error("BENCH_SEEDS must include at least one positive integer")
}

if (!Number.isFinite(STRUCTURE_MUTATION_RATE) || STRUCTURE_MUTATION_RATE < 0 || STRUCTURE_MUTATION_RATE > 1) {
  throw new Error("STRUCTURE_MUTATION_RATE must be between 0 and 1")
}

if (PERF_BUDGET_TOTAL_MS !== Number.POSITIVE_INFINITY) {
  assertFiniteNonNegative(PERF_BUDGET_TOTAL_MS, "PERF_BUDGET_TOTAL_MS")
}
if (PERF_BUDGET_MAX_HYDRATE_RATE_PCT !== Number.POSITIVE_INFINITY) {
  assertFiniteNonNegative(PERF_BUDGET_MAX_HYDRATE_RATE_PCT, "PERF_BUDGET_MAX_HYDRATE_RATE_PCT")
}
if (PERF_BUDGET_MAX_BOOTSTRAP_MS !== Number.POSITIVE_INFINITY) {
  assertFiniteNonNegative(PERF_BUDGET_MAX_BOOTSTRAP_MS, "PERF_BUDGET_MAX_BOOTSTRAP_MS")
}
if (PERF_BUDGET_MAX_OPEN_CLOSE_MS !== Number.POSITIVE_INFINITY) {
  assertFiniteNonNegative(PERF_BUDGET_MAX_OPEN_CLOSE_MS, "PERF_BUDGET_MAX_OPEN_CLOSE_MS")
}
if (PERF_BUDGET_MAX_VARIANCE_PCT !== Number.POSITIVE_INFINITY) {
  assertFiniteNonNegative(PERF_BUDGET_MAX_VARIANCE_PCT, "PERF_BUDGET_MAX_VARIANCE_PCT")
}
if (PERF_BUDGET_MAX_HEAP_DELTA_MB !== Number.POSITIVE_INFINITY) {
  assertFiniteNonNegative(PERF_BUDGET_MAX_HEAP_DELTA_MB, "PERF_BUDGET_MAX_HEAP_DELTA_MB")
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

function runBench(seed) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>")
  const { document } = dom.window
  const structureRegistry = new WeakMap()

  const metrics = new Map(
    PACKAGES.map((pkg) => [
      pkg.name,
      { scans: 0, hydrated: 0, skipped: 0, scanMs: 0, hydrateMs: 0, bootstrapMs: 0, openCloseMs: 0 },
    ]),
  )

  function createRoot(pkg, index) {
    const root = document.createElement("div")

    const rootAttr = pkg.root.match(/\[data-([^\]]+)\]/)?.[1]
    const triggerAttr = pkg.trigger.match(/\[data-([^\]]+)\]/)?.[1]
    const contentAttr = pkg.content.match(/\[data-([^\]]+)\]/)?.[1]

    if (!rootAttr || !triggerAttr || !contentAttr) {
      throw new Error(`Invalid selector config for ${pkg.name}`)
    }

    root.setAttribute(`data-${rootAttr}`, `${pkg.name}-${index}`)

    const trigger = document.createElement("button")
    trigger.setAttribute(`data-${triggerAttr}`, "")
    trigger.textContent = `trigger-${index}`

    const content = document.createElement("div")
    content.setAttribute(`data-${contentAttr}`, "")
    content.textContent = `content-${index}`

    root.appendChild(trigger)
    root.appendChild(content)

    return root
  }

  for (const pkg of PACKAGES) {
    const host = document.createElement("section")
    host.setAttribute("data-bench-host", pkg.name)
    for (let i = 0; i < ROOTS_PER_KIND; i += 1) {
      host.appendChild(createRoot(pkg, i))
    }
    document.body.appendChild(host)
  }

  function hydrateLike(pkg, root) {
    const start = performance.now()
    const nextTrigger = root.querySelector(pkg.trigger)
    const nextContent = root.querySelector(pkg.content)
    if (!nextTrigger || !nextContent) {
      return false
    }
    const previous = structureRegistry.get(root)
    if (previous && previous.trigger === nextTrigger && previous.content === nextContent) {
      return false
    }
    structureRegistry.set(root, { trigger: nextTrigger, content: nextContent })
    const end = performance.now()
    const m = metrics.get(pkg.name)
    m.hydrateMs += end - start
    return true
  }

  function resolveStructure(pkg, root) {
    const trigger = root.querySelector(pkg.trigger)
    const content = root.querySelector(pkg.content)
    if (!trigger || !content) {
      return null
    }
    return { trigger, content }
  }

  function scanNode(pkg, node) {
    const start = performance.now()
    let hydrated = 0
    let skipped = 0

    if (node instanceof dom.window.Element && node.matches(pkg.root)) {
      if (hydrateLike(pkg, node)) hydrated += 1
      else skipped += 1
    }

    if (node.querySelectorAll) {
      const roots = node.querySelectorAll(pkg.root)
      for (const root of roots) {
        if (hydrateLike(pkg, root)) hydrated += 1
        else skipped += 1
      }
    }

    const end = performance.now()
    const m = metrics.get(pkg.name)
    m.scans += 1
    m.hydrated += hydrated
    m.skipped += skipped
    m.scanMs += end - start
  }

  function randomInt(max) {
    return Math.floor(nextRandom() * max)
  }

  let rngState = seed % 2147483647
  if (rngState <= 0) {
    rngState += 2147483646
  }

  function nextRandom() {
    rngState = (rngState * 16807) % 2147483647
    return (rngState - 1) / 2147483646
  }

  function runMorphIteration() {
    const pkg = PACKAGES[randomInt(PACKAGES.length)]
    const host = document.querySelector(`[data-bench-host=\"${pkg.name}\"]`)
    if (!host) return

    const roots = host.querySelectorAll(pkg.root)
    if (!roots.length) return

    const target = roots[randomInt(roots.length)]
    if (nextRandom() < STRUCTURE_MUTATION_RATE) {
      const oldTrigger = target.querySelector(pkg.trigger)
      if (oldTrigger) {
        const replacement = document.createElement("button")
        const triggerAttr = pkg.trigger.match(/\[data-([^\]]+)\]/)?.[1]
        replacement.setAttribute(`data-${triggerAttr}`, "")
        replacement.textContent = `trigger-replaced-${nextRandom().toString(36).slice(2, 7)}`
        oldTrigger.replaceWith(replacement)
      }
    } else {
      const textNode = target.querySelector(pkg.content)
      if (textNode) {
        textNode.textContent = `text-${nextRandom().toString(36).slice(2, 9)}`
      }
    }

    scanNode(pkg, target)
  }

  function runBootstrapProxy(pkg) {
    const host = document.querySelector(`[data-bench-host=\"${pkg.name}\"]`)
    if (!host) return
    const nodes = [...host.querySelectorAll(pkg.root)]

    // Warmup pass to reduce "first package" JIT/cold-start bias.
    for (const node of nodes) {
      const structure = resolveStructure(pkg, node)
      if (structure) {
        structureRegistry.set(node, structure)
      }
    }

    for (const node of nodes) {
      structureRegistry.delete(node)
    }

    const start = performance.now()
    for (const node of nodes) {
      const structure = resolveStructure(pkg, node)
      if (structure) {
        structureRegistry.set(node, structure)
      }
    }
    const end = performance.now()
    metrics.get(pkg.name).bootstrapMs = end - start
  }

  function runOpenCloseProxy(pkg) {
    const host = document.querySelector(`[data-bench-host=\"${pkg.name}\"]`)
    if (!host) return
    const contents = host.querySelectorAll(pkg.content)
    const samples = []
    const sampleCount = 5
    const warmupCount = 1

    const runSample = () => {
      const start = performance.now()
      for (const content of contents) {
        content.hidden = false
        content.setAttribute("data-state", "open")
        content.hidden = true
        content.setAttribute("data-state", "closed")
      }
      return performance.now() - start
    }

    for (let i = 0; i < warmupCount; i += 1) {
      runSample()
    }
    for (let i = 0; i < sampleCount; i += 1) {
      samples.push(runSample())
    }

    samples.sort((a, b) => a - b)
    const middle = Math.floor(samples.length / 2)
    metrics.get(pkg.name).openCloseMs = samples[middle]
  }

  const heapStart = process.memoryUsage().heapUsed
  const t0 = performance.now()
  for (const pkg of PACKAGES) {
    runBootstrapProxy(pkg)
  }
  for (let i = 0; i < ITERATIONS; i += 1) {
    runMorphIteration()
  }
  for (const pkg of PACKAGES) {
    runOpenCloseProxy(pkg)
  }
  const t1 = performance.now()
  const heapEnd = process.memoryUsage().heapUsed

  const rows = PACKAGES.map((pkg) => {
    const m = metrics.get(pkg.name)
    const total = m.hydrated + m.skipped || 1
    const hydrateRatePct = (m.hydrated / total) * 100
    return {
      package: pkg.name,
      scans: m.scans,
      hydrated: m.hydrated,
      skipped: m.skipped,
      hydrateRate: `${hydrateRatePct.toFixed(1)}%`,
      hydrateRatePct,
      scanMs: m.scanMs.toFixed(2),
      scanMsValue: m.scanMs,
      hydrateMs: m.hydrateMs.toFixed(2),
      hydrateMsValue: m.hydrateMs,
      bootstrapMs: m.bootstrapMs.toFixed(2),
      bootstrapMsValue: m.bootstrapMs,
      openCloseMs: m.openCloseMs.toFixed(2),
      openCloseMsValue: m.openCloseMs,
    }
  })

  const totalElapsed = t1 - t0
  const heapDeltaMb = (heapEnd - heapStart) / (1024 * 1024)

  return { rows, totalElapsed, heapDeltaMb }
}

const budgetErrors = []
const runResults = []

console.log("\nAffino Laravel Livewire Morph Benchmark (synthetic)")
console.log(
  `roots/kind=${ROOTS_PER_KIND} iterations=${ITERATIONS} structureMutationRate=${STRUCTURE_MUTATION_RATE} seeds=${BENCH_SEEDS.join(",")}`,
)

for (const seed of BENCH_SEEDS) {
  const result = runBench(seed)
  runResults.push({ seed, ...result })

  console.log(`\nSeed ${seed}`)
  console.table(result.rows)
  console.log(`Total elapsed: ${result.totalElapsed.toFixed(2)}ms`)
  console.log(`Heap delta: ${result.heapDeltaMb.toFixed(2)}MB`)

  if (result.totalElapsed > PERF_BUDGET_TOTAL_MS) {
    budgetErrors.push(
      `seed ${seed}: total elapsed ${result.totalElapsed.toFixed(2)}ms exceeded PERF_BUDGET_TOTAL_MS=${PERF_BUDGET_TOTAL_MS}ms`,
    )
  }
  if (result.heapDeltaMb > PERF_BUDGET_MAX_HEAP_DELTA_MB) {
    budgetErrors.push(
      `seed ${seed}: heap delta ${result.heapDeltaMb.toFixed(2)}MB exceeded PERF_BUDGET_MAX_HEAP_DELTA_MB=${PERF_BUDGET_MAX_HEAP_DELTA_MB}MB`,
    )
  }
  result.rows.forEach((row) => {
    if (row.hydrateRatePct > PERF_BUDGET_MAX_HYDRATE_RATE_PCT) {
      budgetErrors.push(
        `seed ${seed} ${row.package}: hydrateRate ${row.hydrateRatePct.toFixed(1)}% exceeded PERF_BUDGET_MAX_HYDRATE_RATE_PCT=${PERF_BUDGET_MAX_HYDRATE_RATE_PCT}%`,
      )
    }
    if (row.bootstrapMsValue > PERF_BUDGET_MAX_BOOTSTRAP_MS) {
      budgetErrors.push(
        `seed ${seed} ${row.package}: bootstrapMs ${row.bootstrapMsValue.toFixed(2)} exceeded PERF_BUDGET_MAX_BOOTSTRAP_MS=${PERF_BUDGET_MAX_BOOTSTRAP_MS}`,
      )
    }
    if (row.openCloseMsValue > PERF_BUDGET_MAX_OPEN_CLOSE_MS) {
      budgetErrors.push(
        `seed ${seed} ${row.package}: openCloseMs ${row.openCloseMsValue.toFixed(2)} exceeded PERF_BUDGET_MAX_OPEN_CLOSE_MS=${PERF_BUDGET_MAX_OPEN_CLOSE_MS}`,
      )
    }
  })
}

const summaryRows = PACKAGES.map((pkg) => {
  const scanMs = runResults.map((run) => run.rows.find((row) => row.package === pkg.name)?.scanMsValue ?? 0)
  const hydrateMs = runResults.map((run) => run.rows.find((row) => row.package === pkg.name)?.hydrateMsValue ?? 0)
  const bootstrapMs = runResults.map((run) => run.rows.find((row) => row.package === pkg.name)?.bootstrapMsValue ?? 0)
  const openCloseMs = runResults.map((run) => run.rows.find((row) => row.package === pkg.name)?.openCloseMsValue ?? 0)
  const hydrateRatePct = runResults.map((run) => run.rows.find((row) => row.package === pkg.name)?.hydrateRatePct ?? 0)

  const scanStats = stats(scanMs)
  const hydrateStats = stats(hydrateMs)
  const bootstrapStats = stats(bootstrapMs)
  const openCloseStats = stats(openCloseMs)
  const hydrateRateStats = stats(hydrateRatePct)

  return {
    package: pkg.name,
    scanP50: scanStats.p50.toFixed(2),
    scanP90: scanStats.p90.toFixed(2),
    scanCvPct: scanStats.cvPct.toFixed(1),
    hydrateP50: hydrateStats.p50.toFixed(2),
    hydrateP90: hydrateStats.p90.toFixed(2),
    hydrateCvPct: hydrateStats.cvPct.toFixed(1),
    bootstrapP50: bootstrapStats.p50.toFixed(2),
    bootstrapP90: bootstrapStats.p90.toFixed(2),
    bootstrapCvPct: bootstrapStats.cvPct.toFixed(1),
    openCloseP50: openCloseStats.p50.toFixed(2),
    openCloseP90: openCloseStats.p90.toFixed(2),
    openCloseCvPct: openCloseStats.cvPct.toFixed(1),
    hydrateRateP50: hydrateRateStats.p50.toFixed(1),
    hydrateRateP90: hydrateRateStats.p90.toFixed(1),
    hydrateRateCvPct: hydrateRateStats.cvPct.toFixed(1),
  }
})

const elapsedStats = stats(runResults.map((run) => run.totalElapsed))
const heapStats = stats(runResults.map((run) => run.heapDeltaMb))

console.log("\nSummary (p50/p90 + CV%)")
console.table(summaryRows)
console.log(`Total elapsed p50=${elapsedStats.p50.toFixed(2)}ms p90=${elapsedStats.p90.toFixed(2)}ms CV=${elapsedStats.cvPct.toFixed(1)}%`)
console.log(`Heap delta p50=${heapStats.p50.toFixed(2)}MB p90=${heapStats.p90.toFixed(2)}MB CV=${heapStats.cvPct.toFixed(1)}%`)
console.log("Note: This is a temporary synthetic benchmark for mutation pressure and rehydrate gating trends.")

if (elapsedStats.cvPct > PERF_BUDGET_MAX_VARIANCE_PCT) {
  budgetErrors.push(
    `total elapsed CV ${elapsedStats.cvPct.toFixed(1)}% exceeded PERF_BUDGET_MAX_VARIANCE_PCT=${PERF_BUDGET_MAX_VARIANCE_PCT}%`,
  )
}

summaryRows.forEach((row) => {
  const cvTargets = [
    { label: "scan", value: Number.parseFloat(row.scanCvPct) },
    { label: "hydrate", value: Number.parseFloat(row.hydrateCvPct) },
    { label: "bootstrap", value: Number.parseFloat(row.bootstrapCvPct) },
    { label: "openClose", value: Number.parseFloat(row.openCloseCvPct) },
    { label: "hydrateRate", value: Number.parseFloat(row.hydrateRateCvPct) },
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
  benchmark: "laravel-livewire-morph",
  generatedAt: new Date().toISOString(),
  config: {
    rootsPerKind: ROOTS_PER_KIND,
    iterations: ITERATIONS,
    structureMutationRate: STRUCTURE_MUTATION_RATE,
    seeds: BENCH_SEEDS,
  },
  budgets: {
    totalMs: PERF_BUDGET_TOTAL_MS,
    maxHydrateRatePct: PERF_BUDGET_MAX_HYDRATE_RATE_PCT,
    maxBootstrapMs: PERF_BUDGET_MAX_BOOTSTRAP_MS,
    maxOpenCloseMs: PERF_BUDGET_MAX_OPEN_CLOSE_MS,
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

if (budgetErrors.length) {
  console.error("\nPerformance budget check failed:")
  budgetErrors.forEach((line) => console.error(`- ${line}`))
  process.exit(1)
}
