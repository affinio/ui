#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { performance } from "node:perf_hooks"

const ROOT = resolve(new URL("..", import.meta.url).pathname)
const DIST_ENTRY = resolve(ROOT, "packages/treeview-core/dist/TreeviewCore.js")

if (!existsSync(DIST_ENTRY)) {
  throw new Error("packages/treeview-core/dist/TreeviewCore.js is missing. Run `pnpm --filter @affino/treeview-core build` first.")
}

const { TreeviewCore } = await import(DIST_ENTRY)

const NODE_COUNT = readPositiveInt("BENCH_TREEVIEW_NODE_COUNT", 20000)
const SAMPLE_COUNT = readPositiveInt("BENCH_TREEVIEW_SAMPLE_COUNT", 9)
const WARMUP_COUNT = readNonNegativeInt("BENCH_TREEVIEW_WARMUP_COUNT", 2)
const PATCH_PERCENT = readPositiveFloat("BENCH_TREEVIEW_PATCH_PERCENT", 1)
const BURST_ITERATIONS = readPositiveInt("BENCH_TREEVIEW_BURST_ITERATIONS", 1000)
const WINDOW_SIZE = readPositiveInt("BENCH_TREEVIEW_WINDOW_SIZE", 100)
const TOPOLOGY_PATCH_ITERATIONS = readPositiveInt(
  "BENCH_TREEVIEW_TOPOLOGY_PATCH_ITERATIONS",
  Math.min(BURST_ITERATIONS, 50),
)
const SEARCH_ITERATIONS = readPositiveInt(
  "BENCH_TREEVIEW_SEARCH_ITERATIONS",
  Math.min(BURST_ITERATIONS, 25),
)
const OUTPUT_JSON = resolve(process.env.BENCH_OUTPUT_JSON ?? "artifacts/performance/bench-treeview-core.json")

const budgets = {
  totalMs: readBudget("PERF_BUDGET_TOTAL_MS"),
  registerReplaceP95Ms: readBudget("PERF_BUDGET_MAX_REGISTER_REPLACE_P95_MS"),
  registerPatchP95Ms: readBudget("PERF_BUDGET_MAX_REGISTER_PATCH_P95_MS"),
  expandCollapseP95Ms: readBudget("PERF_BUDGET_MAX_EXPAND_COLLAPSE_P95_MS"),
  focusBurstP95Ms: readBudget("PERF_BUDGET_MAX_FOCUS_BURST_P95_MS"),
  selectBurstP95Ms: readBudget("PERF_BUDGET_MAX_SELECT_BURST_P95_MS"),
  visibleReadP95Ms: readBudget("PERF_BUDGET_MAX_VISIBLE_READ_P95_MS"),
  heapDeltaMb: readBudget("PERF_BUDGET_MAX_HEAP_DELTA_MB"),
}

const startedAt = performance.now()
const heapBefore = sampleHeapUsed()
const balancedNodes = createBalancedNodes(NODE_COUNT, 4)
const wideNodes = createWideNodes(NODE_COUNT)
const deepNodes = createDeepNodes(Math.min(NODE_COUNT, 10000))
const patchNodes = createPatchNodes(balancedNodes, PATCH_PERCENT)
const expandedBalanced = balancedNodes.filter((node, index) => index < Math.min(NODE_COUNT, 4096) && hasLikelyChildren(index, NODE_COUNT, 4)).map((node) => node.value)
const expandedWide = ["node-0"]
const expandedDeep = deepNodes.slice(0, Math.min(deepNodes.length - 1, 1024)).map((node) => node.value)

const results = {
  registerReplaceBalanced: measure(() => {
    new TreeviewCore({ nodes: balancedNodes, defaultExpanded: ["node-0"], defaultActive: "node-0" })
  }),
  registerReplaceWide: measure(() => {
    new TreeviewCore({ nodes: wideNodes, defaultExpanded: expandedWide, defaultActive: "node-0" })
  }),
  registerReplaceDeep: measureSafe(() => {
    new TreeviewCore({ nodes: deepNodes, defaultExpanded: expandedDeep, defaultActive: "node-0" })
  }),
  registerPatchOnePercent: measure(() => {
    const core = new TreeviewCore({ nodes: balancedNodes, defaultExpanded: ["node-0"], defaultActive: "node-0" })
    core.registerNodes(patchNodes, { mode: "patch" })
  }),
  registerPatchNoop: measureInstrumented(() => {
    const core = createInstrumentedCore({ nodes: balancedNodes, defaultExpanded: ["node-0"], defaultActive: "node-0" })
    const noopPatchNodes = balancedNodes.slice(Math.max(1, balancedNodes.length - patchNodes.length))
    return { core, run: () => {
      for (let index = 0; index < BURST_ITERATIONS; index += 1) {
        core.registerNodes(noopPatchNodes, { mode: "patch" })
      }
    } }
  }),
  registerPatchField: measureInstrumented(() => {
    const core = createInstrumentedCore({ nodes: balancedNodes, defaultExpanded: ["node-0"], defaultActive: "node-0" })
    const target = balancedNodes[Math.min(100, balancedNodes.length - 1)]
    let disabled = Boolean(target.disabled)
    return { core, run: () => {
      for (let index = 0; index < TOPOLOGY_PATCH_ITERATIONS; index += 1) {
        disabled = !disabled
        core.registerNodes([{ value: target.value, disabled }], { mode: "patch" })
      }
    } }
  }),
  registerPatchSingleAdd: measureInstrumented(() => {
    const core = createInstrumentedCore({ nodes: balancedNodes, defaultExpanded: ["node-0"], defaultActive: "node-0" })
    return { core, run: () => {
      for (let index = 0; index < TOPOLOGY_PATCH_ITERATIONS; index += 1) {
        core.registerNodes([{ value: `added-${index}`, parent: "node-0" }], { mode: "patch" })
      }
    } }
  }),
  registerPatchDependentAdd: measureInstrumented(() => {
    const core = createInstrumentedCore({ nodes: balancedNodes, defaultExpanded: ["node-0"], defaultActive: "node-0" })
    return { core, run: () => {
      for (let index = 0; index < TOPOLOGY_PATCH_ITERATIONS; index += 1) {
        core.registerNodes([
          { value: `added-parent-${index}`, parent: "node-0" },
          { value: `added-child-${index}`, parent: `added-parent-${index}` },
        ], { mode: "patch" })
      }
    } }
  }),
  registerPatchSingleReparent: measureInstrumented(() => {
    const core = createInstrumentedCore({ nodes: balancedNodes, defaultExpanded: ["node-0"], defaultActive: "node-0" })
    const moved = balancedNodes[balancedNodes.length - 1]
    const originalParent = moved.parent
    return { core, run: () => {
      for (let index = 0; index < TOPOLOGY_PATCH_ITERATIONS; index += 1) {
        core.registerNodes([{ value: moved.value, parent: index % 2 === 0 ? "node-0" : originalParent }], { mode: "patch" })
      }
    } }
  }),
  registerPatchBatchReparent: measureInstrumented(() => {
    const core = createInstrumentedCore({ nodes: balancedNodes, defaultExpanded: ["node-0"], defaultActive: "node-0" })
    const first = balancedNodes[balancedNodes.length - 1]
    const second = balancedNodes[balancedNodes.length - 2]
    const firstParent = first.parent
    const secondParent = second.parent
    return { core, run: () => {
      for (let index = 0; index < TOPOLOGY_PATCH_ITERATIONS; index += 1) {
        core.registerNodes([
          { value: first.value, parent: index % 2 === 0 ? "node-0" : firstParent },
          { value: second.value, parent: index % 2 === 0 ? "node-0" : secondParent },
        ], { mode: "patch" })
      }
    } }
  }),
  expandCollapseBurst: measureInstrumented(() => {
    const core = createInstrumentedCore({ nodes: balancedNodes, defaultExpanded: ["node-0"], defaultActive: "node-0" })
    const branchIds = balancedNodes.filter((node, index) => index > 0 && hasLikelyChildren(index, NODE_COUNT, 4)).slice(0, BURST_ITERATIONS).map((node) => node.value)
    return { core, run: () => {
      for (const value of branchIds) core.requestExpand(value)
      for (let index = branchIds.length - 1; index >= 0; index -= 1) core.requestCollapse(branchIds[index])
    } }
  }),
  focusNextPreviousBurst: measureInstrumented(() => {
    const core = createInstrumentedCore({ nodes: balancedNodes, defaultExpanded: expandedBalanced, defaultActive: "node-0", loop: true })
    return { core, run: () => {
      for (let index = 0; index < BURST_ITERATIONS; index += 1) core.requestFocusNext()
      for (let index = 0; index < BURST_ITERATIONS; index += 1) core.requestFocusPrevious()
    } }
  }),
  focusActiveOnlyBurst: measureInstrumented(() => {
    const core = createInstrumentedCore({ nodes: balancedNodes, defaultExpanded: expandedBalanced, defaultActive: "node-0" })
    const values = core.getVisibleValues().slice(0, BURST_ITERATIONS + 1)
    return { core, run: () => {
      for (const value of values) core.requestFocus(value)
    } }
  }),
  selectActiveOnlyBurst: measureInstrumented(() => {
    const core = createInstrumentedCore({ nodes: balancedNodes, defaultExpanded: expandedBalanced, defaultActive: "node-0" })
    const values = core.getVisibleValues().slice(0, BURST_ITERATIONS + 1)
    return { core, run: () => {
      for (const value of values) core.requestSelect(value)
    } }
  }),
  searchApplyClear: measureInstrumented(() => {
    const core = createInstrumentedCore({ nodes: balancedNodes, defaultExpanded: expandedBalanced, defaultActive: "node-0" })
    return { core, run: () => {
      for (let index = 0; index < SEARCH_ITERATIONS; index += 1) {
        core.setSearchQuery(`node-${index}`)
        core.getVisibleWindow(0, WINDOW_SIZE)
        core.clearSearchQuery()
      }
    } }
  }),
  visibleReadFullArray: measureInstrumented(() => {
    const core = createInstrumentedCore({ nodes: balancedNodes, defaultExpanded: expandedBalanced, defaultActive: "node-0" })
    return { core, run: () => {
      for (let index = 0; index < BURST_ITERATIONS; index += 1) {
        core.getVisibleValues()
      }
    } }
  }),
  visibleReadWindow: measureInstrumented(() => {
    const core = createInstrumentedCore({ nodes: balancedNodes, defaultExpanded: expandedBalanced, defaultActive: "node-0" })
    return { core, run: () => {
      for (let index = 0; index < BURST_ITERATIONS; index += 1) {
        const start = index % WINDOW_SIZE
        core.getVisibleWindow(start, start + WINDOW_SIZE)
      }
    } }
  }),
}

const heapAfter = sampleHeapUsed()
const totalMs = performance.now() - startedAt
const report = {
  name: "treeview-core",
  generatedAt: new Date().toISOString(),
  config: {
    nodeCount: NODE_COUNT,
    sampleCount: SAMPLE_COUNT,
    warmupCount: WARMUP_COUNT,
    patchPercent: PATCH_PERCENT,
    burstIterations: BURST_ITERATIONS,
    windowSize: WINDOW_SIZE,
    topologyPatchIterations: TOPOLOGY_PATCH_ITERATIONS,
    searchIterations: SEARCH_ITERATIONS,
  },
  totalMs,
  heapDeltaMb: (heapAfter - heapBefore) / 1024 / 1024,
  results,
}

mkdirSync(dirname(OUTPUT_JSON), { recursive: true })
writeFileSync(OUTPUT_JSON, `${JSON.stringify(report, null, 2)}\n`)
printReport(report, OUTPUT_JSON)
assertBudgets(report)

function readPositiveInt(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? String(fallback), 10)
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive integer`)
  return value
}

function readNonNegativeInt(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? String(fallback), 10)
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative integer`)
  return value
}

function readPositiveFloat(name, fallback) {
  const value = Number.parseFloat(process.env[name] ?? String(fallback))
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number`)
  return value
}

function readBudget(name) {
  const raw = process.env[name]
  if (raw === undefined || raw === "") return Number.POSITIVE_INFINITY
  const value = Number.parseFloat(raw)
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative finite number`)
  return value
}

function createBalancedNodes(count, branchFactor) {
  return Array.from({ length: count }, (_, index) => ({
    value: `node-${index}`,
    parent: index === 0 ? null : `node-${Math.floor((index - 1) / branchFactor)}`,
    disabled: index % 17 === 0 && index !== 0,
  }))
}

function createWideNodes(count) {
  return Array.from({ length: count }, (_, index) => ({
    value: `node-${index}`,
    parent: index === 0 ? null : "node-0",
    disabled: index % 19 === 0 && index !== 0,
  }))
}

function createDeepNodes(count) {
  return Array.from({ length: count }, (_, index) => ({
    value: `node-${index}`,
    parent: index === 0 ? null : `node-${index - 1}`,
    disabled: false,
  }))
}

function createPatchNodes(nodes, percent) {
  const count = Math.max(1, Math.floor(nodes.length * (percent / 100)))
  const start = Math.max(1, nodes.length - count)
  return nodes.slice(start).map((node, index) => ({
    ...node,
    disabled: index % 3 === 0,
  }))
}

function hasLikelyChildren(index, total, branchFactor) {
  return index * branchFactor + 1 < total
}

function createInstrumentedCore(options) {
  const core = new TreeviewCore(options)
  const counters = {
    emittedSnapshotCount: -1,
    visibleRecomputeCount: 0,
    traversalRebuildCount: 0,
    sourceFinalizeCount: 0,
  }
  core.subscribe(() => {
    counters.emittedSnapshotCount += 1
  })

  const originalFinalizeNodeMap = core.finalizeNodeMap.bind(core)
  core.finalizeNodeMap = (...args) => {
    counters.sourceFinalizeCount += 1
    return originalFinalizeNodeMap(...args)
  }

  const originalCommitVisibleProjection = core.commitVisibleProjection.bind(core)
  core.commitVisibleProjection = (...args) => {
    counters.visibleRecomputeCount += 1
    return originalCommitVisibleProjection(...args)
  }

  const originalTraversal = core.getNodeTraversalOrder.bind(core)
  core.getNodeTraversalOrder = (...args) => {
    counters.traversalRebuildCount += 1
    return originalTraversal(...args)
  }

  core.__benchCounters = counters
  return core
}

function measure(operation) {
  const samples = []
  for (let index = 0; index < WARMUP_COUNT; index += 1) operation()
  const heapBefore = sampleHeapUsed()
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const startedAt = performance.now()
    operation()
    samples.push(performance.now() - startedAt)
  }
  const heapAfter = sampleHeapUsed()
  return { ...stats(samples), heapDeltaMb: (heapAfter - heapBefore) / 1024 / 1024 }
}

function measureSafe(operation) {
  try {
    return measure(operation)
  } catch (error) {
    return {
      ...stats([]),
      heapDeltaMb: 0,
      failed: true,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    }
  }
}

function measureInstrumented(factory) {
  const samples = []
  const counters = []
  for (let index = 0; index < WARMUP_COUNT; index += 1) {
    const warmup = factory()
    warmup.run()
  }
  const heapBefore = sampleHeapUsed()
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const measured = factory()
    const startedAt = performance.now()
    measured.run()
    samples.push(performance.now() - startedAt)
    counters.push({
      ...measured.core.__benchCounters,
      visibleProjectionVersion: measured.core.visibleProjectionVersion,
      visibleNavigationLookupCount: measured.core.visibleNavigationLookupCount,
    })
  }
  const heapAfter = sampleHeapUsed()
  return {
    ...stats(samples),
    heapDeltaMb: (heapAfter - heapBefore) / 1024 / 1024,
    emittedSnapshotCount: maxCounter(counters, "emittedSnapshotCount"),
    visibleRecomputeCount: maxCounter(counters, "visibleRecomputeCount"),
    traversalRebuildCount: maxCounter(counters, "traversalRebuildCount"),
    visibleProjectionVersion: maxCounter(counters, "visibleProjectionVersion"),
    visibleNavigationLookupCount: maxCounter(counters, "visibleNavigationLookupCount"),
    sourceFinalizeCount: maxCounter(counters, "sourceFinalizeCount"),
  }
}

function maxCounter(counters, key) {
  return counters.reduce((max, counter) => Math.max(max, counter?.[key] ?? 0), 0)
}

function sampleHeapUsed() {
  if (typeof globalThis.gc === "function") {
    globalThis.gc()
    globalThis.gc()
  }
  return process.memoryUsage().heapUsed
}

function quantile(values, q) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const pos = (sorted.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  if (sorted[base + 1] === undefined) return sorted[base]
  return sorted[base] + rest * (sorted[base + 1] - sorted[base])
}

function stats(samples) {
  return {
    p50: quantile(samples, 0.5),
    p95: quantile(samples, 0.95),
    p99: quantile(samples, 0.99),
    max: samples.length ? Math.max(...samples) : 0,
  }
}

function printReport(report, outputJson) {
  console.log(`[treeview-core] ${report.config.nodeCount} nodes, ${report.config.sampleCount} samples`)
  for (const [name, result] of Object.entries(report.results)) {
    const counters = "traversalRebuildCount" in result
      ? ` emitted=${result.emittedSnapshotCount} visible=${result.visibleRecomputeCount} traversal=${result.traversalRebuildCount} sourceFinalize=${result.sourceFinalizeCount} projectionVersion=${result.visibleProjectionVersion} navLookups=${result.visibleNavigationLookupCount}`
      : ""
    if (result.failed) {
      console.log(`${name}: failed ${result.error}`)
      continue
    }
    console.log(`${name}: p50=${formatMs(result.p50)} p95=${formatMs(result.p95)} p99=${formatMs(result.p99)} max=${formatMs(result.max)} heap=${result.heapDeltaMb.toFixed(2)}MB${counters}`)
  }
  console.log(`total=${formatMs(report.totalMs)} heapDelta=${report.heapDeltaMb.toFixed(2)}MB artifact=${outputJson}`)
}

function formatMs(value) {
  return `${value.toFixed(3)}ms`
}

function assertBudgets(report) {
  const failures = []
  checkBudget(failures, "totalMs", report.totalMs, budgets.totalMs)
  checkBudget(failures, "registerReplaceBalanced.p95", report.results.registerReplaceBalanced.p95, budgets.registerReplaceP95Ms)
  checkBudget(failures, "registerPatchOnePercent.p95", report.results.registerPatchOnePercent.p95, budgets.registerPatchP95Ms)
  checkBudget(failures, "expandCollapseBurst.p95", report.results.expandCollapseBurst.p95, budgets.expandCollapseP95Ms)
  checkBudget(failures, "focusNextPreviousBurst.p95", report.results.focusNextPreviousBurst.p95, budgets.focusBurstP95Ms)
  checkBudget(failures, "selectActiveOnlyBurst.p95", report.results.selectActiveOnlyBurst.p95, budgets.selectBurstP95Ms)
  checkBudget(failures, "visibleReadFullArray.p95", report.results.visibleReadFullArray.p95, budgets.visibleReadP95Ms)
  checkBudget(failures, "heapDeltaMb", report.heapDeltaMb, budgets.heapDeltaMb)
  checkCounter(failures, "registerPatchNoop.sourceFinalizeCount", report.results.registerPatchNoop.sourceFinalizeCount, 0)
  checkCounter(failures, "registerPatchNoop.visibleRecomputeCount", report.results.registerPatchNoop.visibleRecomputeCount, 0)
  checkCounter(failures, "registerPatchNoop.emittedSnapshotCount", report.results.registerPatchNoop.emittedSnapshotCount, 0)
  checkCounter(failures, "registerPatchField.sourceFinalizeCount", report.results.registerPatchField.sourceFinalizeCount, 0)
  checkCounter(failures, "registerPatchField.traversalRebuildCount", report.results.registerPatchField.traversalRebuildCount, 0)
  if (failures.length) {
    throw new Error(`TreeView core benchmark budgets failed:\n${failures.join("\n")}`)
  }
}

function checkCounter(failures, label, actual, expected) {
  if (actual !== expected) {
    failures.push("- " + label + ": " + actual + " !== " + expected)
  }
}

function checkBudget(failures, label, actual, budget) {
  if (budget !== Number.POSITIVE_INFINITY && actual > budget) {
    failures.push(`- ${label}: ${actual.toFixed(3)} > ${budget.toFixed(3)}`)
  }
}
