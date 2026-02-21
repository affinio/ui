#!/usr/bin/env node

import { performance } from "node:perf_hooks"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const BENCH_SEED = Number.parseInt(process.env.BENCH_SEED ?? "1337", 10)
const BENCH_SEEDS = (process.env.BENCH_SEEDS ?? `${BENCH_SEED}`)
  .split(",")
  .map(value => Number.parseInt(value.trim(), 10))
  .filter(value => Number.isFinite(value) && value > 0)
const BENCH_WARMUP_RUNS = Number.parseInt(process.env.BENCH_WARMUP_RUNS ?? "1", 10)
const BENCH_BATCH_SIZE = Number.parseInt(process.env.BENCH_DEP_BATCH_SIZE ?? "4", 10)
const BENCH_WARMUP_BATCHES = Number.parseInt(process.env.BENCH_DEP_WARMUP_BATCHES ?? "1", 10)
const BENCH_EXPAND_ITERATIONS = Number.parseInt(process.env.BENCH_DEP_EXPAND_ITERATIONS ?? "220", 10)

const STRUCTURAL_SOURCE_COUNT = Number.parseInt(process.env.BENCH_DEP_STRUCTURAL_SOURCE_COUNT ?? "18000", 10)
const STRUCTURAL_BRANCH_FACTOR = Number.parseInt(process.env.BENCH_DEP_STRUCTURAL_BRANCH_FACTOR ?? "96", 10)
const COMPUTED_NODE_COUNT = Number.parseInt(process.env.BENCH_DEP_COMPUTED_NODE_COUNT ?? "8000", 10)
const COMPUTED_OUT_DEGREE = Number.parseInt(process.env.BENCH_DEP_COMPUTED_OUT_DEGREE ?? "6", 10)

const PERF_BUDGET_TOTAL_MS = Number.parseFloat(process.env.PERF_BUDGET_TOTAL_MS ?? "Infinity")
const PERF_BUDGET_MAX_REGISTER_MS = Number.parseFloat(process.env.PERF_BUDGET_MAX_REGISTER_MS ?? "Infinity")
const PERF_BUDGET_MAX_STRUCTURAL_EXPAND_P95_MS = Number.parseFloat(
  process.env.PERF_BUDGET_MAX_STRUCTURAL_EXPAND_P95_MS ?? "Infinity",
)
const PERF_BUDGET_MAX_COMPUTED_EXPAND_P95_MS = Number.parseFloat(
  process.env.PERF_BUDGET_MAX_COMPUTED_EXPAND_P95_MS ?? "Infinity",
)
const PERF_BUDGET_MIN_STRUCTURAL_AFFECTED_MEAN = Number.parseFloat(
  process.env.PERF_BUDGET_MIN_STRUCTURAL_AFFECTED_MEAN ?? "0",
)
const PERF_BUDGET_MIN_COMPUTED_AFFECTED_MEAN = Number.parseFloat(
  process.env.PERF_BUDGET_MIN_COMPUTED_AFFECTED_MEAN ?? "0",
)
const PERF_BUDGET_MAX_VARIANCE_PCT = Number.parseFloat(process.env.PERF_BUDGET_MAX_VARIANCE_PCT ?? "Infinity")
const PERF_BUDGET_VARIANCE_MIN_MEAN_MS = Number.parseFloat(process.env.PERF_BUDGET_VARIANCE_MIN_MEAN_MS ?? "0.5")
const PERF_BUDGET_MAX_HEAP_DELTA_MB = Number.parseFloat(process.env.PERF_BUDGET_MAX_HEAP_DELTA_MB ?? "Infinity")
const PERF_BUDGET_HEAP_EPSILON_MB = Number.parseFloat(process.env.PERF_BUDGET_HEAP_EPSILON_MB ?? "1")
const BENCH_OUTPUT_JSON = resolve(
  process.env.BENCH_OUTPUT_JSON ?? "artifacts/performance/bench-datagrid-dependency-graph.json",
)

assertPositiveInteger(STRUCTURAL_SOURCE_COUNT, "BENCH_DEP_STRUCTURAL_SOURCE_COUNT")
assertPositiveInteger(STRUCTURAL_BRANCH_FACTOR, "BENCH_DEP_STRUCTURAL_BRANCH_FACTOR")
assertPositiveInteger(COMPUTED_NODE_COUNT, "BENCH_DEP_COMPUTED_NODE_COUNT")
assertPositiveInteger(COMPUTED_OUT_DEGREE, "BENCH_DEP_COMPUTED_OUT_DEGREE")
assertPositiveInteger(BENCH_EXPAND_ITERATIONS, "BENCH_DEP_EXPAND_ITERATIONS")
assertPositiveInteger(BENCH_BATCH_SIZE, "BENCH_DEP_BATCH_SIZE")
assertNonNegativeInteger(BENCH_WARMUP_BATCHES, "BENCH_DEP_WARMUP_BATCHES")
assertNonNegativeInteger(BENCH_WARMUP_RUNS, "BENCH_WARMUP_RUNS")
if (!BENCH_SEEDS.length) {
  throw new Error("BENCH_SEEDS must include at least one positive integer")
}

function assertPositiveInteger(value, label) {
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
    throw new Error(`${label} must be a positive integer`)
  }
}

function assertNonNegativeInteger(value, label) {
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new Error(`${label} must be a non-negative integer`)
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

function shouldEnforceVariance(stat) {
  return (
    PERF_BUDGET_MAX_VARIANCE_PCT !== Number.POSITIVE_INFINITY &&
    stat.mean >= PERF_BUDGET_VARIANCE_MIN_MEAN_MS
  )
}

function createRng(seed) {
  let state = seed % 2147483647
  if (state <= 0) state += 2147483646
  return () => {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
}

function randomInt(rng, min, max) {
  const span = Math.max(1, max - min + 1)
  return min + Math.floor(rng() * span)
}

function sleepTick() {
  return new Promise(resolveTick => {
    setTimeout(resolveTick, 0)
  })
}

async function sampleHeapUsed() {
  const maybeGc = globalThis.gc
  let minHeap = Number.POSITIVE_INFINITY
  for (let iteration = 0; iteration < 3; iteration += 1) {
    if (typeof maybeGc === "function") {
      maybeGc()
    }
    await sleepTick()
    const used = process.memoryUsage().heapUsed
    if (used < minHeap) {
      minHeap = used
    }
  }
  return Number.isFinite(minHeap) ? minHeap : process.memoryUsage().heapUsed
}

async function loadFactory() {
  const candidates = [
    resolve("packages/datagrid-core/dist/src/models/index.js"),
    resolve("packages/datagrid-core/dist/src/public.js"),
  ]
  let lastError = null
  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue
    }
    try {
      const module = await import(pathToFileURL(candidate).href)
      if (typeof module.createDataGridDependencyGraph === "function") {
        return module.createDataGridDependencyGraph
      }
    } catch (error) {
      lastError = error
    }
  }
  if (lastError) {
    throw new Error(`Failed to load createDataGridDependencyGraph: ${String(lastError)}`)
  }
  throw new Error(
    "Unable to locate datagrid-core build artifacts. Run `pnpm --filter @affino/datagrid-core build`.",
  )
}

function buildDenseGraph(createDataGridDependencyGraph) {
  const graph = createDataGridDependencyGraph()
  let registeredEdges = 0

  for (let index = 0; index < STRUCTURAL_SOURCE_COUNT; index += 1) {
    const branch = index % STRUCTURAL_BRANCH_FACTOR
    const sourceField = `scope.${branch}.leaf.${index}`
    const dependentField = `field:leaf:${index}`
    graph.registerDependency(sourceField, dependentField, { kind: "structural" })
    registeredEdges += 1
    const computedRoot = `computed:${index % COMPUTED_NODE_COUNT}`
    graph.registerDependency(dependentField, computedRoot, { kind: "computed" })
    registeredEdges += 1
  }

  for (let nodeIndex = 0; nodeIndex < COMPUTED_NODE_COUNT; nodeIndex += 1) {
    const sourceField = `computed:${nodeIndex}`
    for (let offset = 1; offset <= COMPUTED_OUT_DEGREE; offset += 1) {
      const dependentIndex = nodeIndex + offset
      if (dependentIndex >= COMPUTED_NODE_COUNT) {
        break
      }
      graph.registerDependency(sourceField, `computed:${dependentIndex}`, { kind: "computed" })
      registeredEdges += 1
    }
  }

  return { graph, registeredEdges }
}

function measureScenario(iterations, batchSize, runOne) {
  const durations = []
  const affectedSizes = []
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const startedAt = performance.now()
    let affectedTotal = 0
    for (let batch = 0; batch < batchSize; batch += 1) {
      affectedTotal += runOne()
    }
    durations.push((performance.now() - startedAt) / batchSize)
    affectedSizes.push(affectedTotal / batchSize)
  }
  return {
    stat: stats(durations),
    affectedStat: stats(affectedSizes),
  }
}

function runSeed(createDataGridDependencyGraph, seed) {
  const rng = createRng(seed)
  const startBuildAt = performance.now()
  const { graph, registeredEdges } = buildDenseGraph(createDataGridDependencyGraph)
  const registerMs = performance.now() - startBuildAt

  const runStructuralExpand = () => {
    const branch = randomInt(rng, 0, Math.max(0, STRUCTURAL_BRANCH_FACTOR - 1))
    if (rng() < 0.5) {
      return graph.getAffectedFields(new Set([`scope.${branch}`])).size
    }
    const branchSpan = Math.max(1, Math.floor((STRUCTURAL_SOURCE_COUNT - 1) / STRUCTURAL_BRANCH_FACTOR) + 1)
    const branchOffset = randomInt(rng, 0, Math.max(0, branchSpan - 1))
    const leafId = branch + branchOffset * STRUCTURAL_BRANCH_FACTOR
    const safeLeafId = Math.min(STRUCTURAL_SOURCE_COUNT - 1, leafId)
    return graph.getAffectedFields(new Set([`scope.${branch}.leaf.${safeLeafId}.value`])).size
  }

  const runComputedExpand = () => {
    const nodeIndex = randomInt(rng, 0, Math.max(0, COMPUTED_NODE_COUNT - 1))
    return graph.getAffectedFields(new Set([`computed:${nodeIndex}`])).size
  }

  for (let warmup = 0; warmup < BENCH_WARMUP_BATCHES; warmup += 1) {
    for (let batch = 0; batch < BENCH_BATCH_SIZE; batch += 1) {
      runStructuralExpand()
      runComputedExpand()
    }
  }

  const structuralExpand = measureScenario(BENCH_EXPAND_ITERATIONS, BENCH_BATCH_SIZE, runStructuralExpand)
  const computedExpand = measureScenario(BENCH_EXPAND_ITERATIONS, BENCH_BATCH_SIZE, runComputedExpand)

  return {
    seed,
    registerMs,
    structuralExpand,
    computedExpand,
    graph: {
      registeredEdges,
      structuralSources: STRUCTURAL_SOURCE_COUNT,
      computedNodes: COMPUTED_NODE_COUNT,
      computedOutDegree: COMPUTED_OUT_DEGREE,
    },
  }
}

const createDataGridDependencyGraph = await loadFactory()
const runResults = []
const budgetErrors = []
const varianceSkippedChecks = []

console.log("\nAffino DataGrid DependencyGraph Dense Benchmark")
console.log(
  `seeds=${BENCH_SEEDS.join(",")} structuralSources=${STRUCTURAL_SOURCE_COUNT} structuralBranches=${STRUCTURAL_BRANCH_FACTOR} computedNodes=${COMPUTED_NODE_COUNT} computedOutDegree=${COMPUTED_OUT_DEGREE} expandIterations=${BENCH_EXPAND_ITERATIONS} batchSize=${BENCH_BATCH_SIZE} warmupRuns=${BENCH_WARMUP_RUNS}`,
)

for (const seed of BENCH_SEEDS) {
  for (let warmup = 0; warmup < BENCH_WARMUP_RUNS; warmup += 1) {
    runSeed(createDataGridDependencyGraph, seed + (warmup + 1) * 997)
  }

  const heapStart = await sampleHeapUsed()
  const startedAt = performance.now()
  const run = runSeed(createDataGridDependencyGraph, seed)
  const elapsedMs = performance.now() - startedAt
  const heapEnd = await sampleHeapUsed()
  const heapDeltaMb = (heapEnd - heapStart) / (1024 * 1024)

  runResults.push({
    ...run,
    elapsedMs,
    heapDeltaMb,
  })

  console.log(`\nSeed ${seed}`)
  console.table([
    {
      scenario: "register",
      p50Ms: run.registerMs.toFixed(3),
      p95Ms: run.registerMs.toFixed(3),
      p99Ms: run.registerMs.toFixed(3),
      cvPct: "0.00",
      meanAffected: "-",
    },
    {
      scenario: "expand-structural",
      p50Ms: run.structuralExpand.stat.p50.toFixed(3),
      p95Ms: run.structuralExpand.stat.p95.toFixed(3),
      p99Ms: run.structuralExpand.stat.p99.toFixed(3),
      cvPct: run.structuralExpand.stat.cvPct.toFixed(2),
      meanAffected: run.structuralExpand.affectedStat.mean.toFixed(2),
    },
    {
      scenario: "expand-computed",
      p50Ms: run.computedExpand.stat.p50.toFixed(3),
      p95Ms: run.computedExpand.stat.p95.toFixed(3),
      p99Ms: run.computedExpand.stat.p99.toFixed(3),
      cvPct: run.computedExpand.stat.cvPct.toFixed(2),
      meanAffected: run.computedExpand.affectedStat.mean.toFixed(2),
    },
  ])
  console.log(`Total elapsed: ${elapsedMs.toFixed(2)}ms`)
  console.log(`Heap delta: ${heapDeltaMb.toFixed(2)}MB`)

  if (run.registerMs > PERF_BUDGET_MAX_REGISTER_MS) {
    budgetErrors.push(
      `seed ${seed}: register ${run.registerMs.toFixed(3)}ms exceeds PERF_BUDGET_MAX_REGISTER_MS=${PERF_BUDGET_MAX_REGISTER_MS}ms`,
    )
  }
  if (run.structuralExpand.stat.p95 > PERF_BUDGET_MAX_STRUCTURAL_EXPAND_P95_MS) {
    budgetErrors.push(
      `seed ${seed}: structural expand p95 ${run.structuralExpand.stat.p95.toFixed(3)}ms exceeds PERF_BUDGET_MAX_STRUCTURAL_EXPAND_P95_MS=${PERF_BUDGET_MAX_STRUCTURAL_EXPAND_P95_MS}ms`,
    )
  }
  if (run.computedExpand.stat.p95 > PERF_BUDGET_MAX_COMPUTED_EXPAND_P95_MS) {
    budgetErrors.push(
      `seed ${seed}: computed expand p95 ${run.computedExpand.stat.p95.toFixed(3)}ms exceeds PERF_BUDGET_MAX_COMPUTED_EXPAND_P95_MS=${PERF_BUDGET_MAX_COMPUTED_EXPAND_P95_MS}ms`,
    )
  }
  if (run.structuralExpand.affectedStat.mean < PERF_BUDGET_MIN_STRUCTURAL_AFFECTED_MEAN) {
    budgetErrors.push(
      `seed ${seed}: structural mean affected ${run.structuralExpand.affectedStat.mean.toFixed(2)} below PERF_BUDGET_MIN_STRUCTURAL_AFFECTED_MEAN=${PERF_BUDGET_MIN_STRUCTURAL_AFFECTED_MEAN}`,
    )
  }
  if (run.computedExpand.affectedStat.mean < PERF_BUDGET_MIN_COMPUTED_AFFECTED_MEAN) {
    budgetErrors.push(
      `seed ${seed}: computed mean affected ${run.computedExpand.affectedStat.mean.toFixed(2)} below PERF_BUDGET_MIN_COMPUTED_AFFECTED_MEAN=${PERF_BUDGET_MIN_COMPUTED_AFFECTED_MEAN}`,
    )
  }
  if (heapDeltaMb > PERF_BUDGET_MAX_HEAP_DELTA_MB + PERF_BUDGET_HEAP_EPSILON_MB) {
    budgetErrors.push(
      `seed ${seed}: heap delta ${heapDeltaMb.toFixed(2)}MB exceeds PERF_BUDGET_MAX_HEAP_DELTA_MB=${PERF_BUDGET_MAX_HEAP_DELTA_MB}MB (epsilon ${PERF_BUDGET_HEAP_EPSILON_MB.toFixed(2)}MB)`,
    )
  }
}

const aggregateElapsed = stats(runResults.map(run => run.elapsedMs))
const aggregateRegister = stats(runResults.map(run => run.registerMs))
const aggregateStructuralP95 = stats(runResults.map(run => run.structuralExpand.stat.p95))
const aggregateComputedP95 = stats(runResults.map(run => run.computedExpand.stat.p95))
const aggregateStructuralAffected = stats(runResults.map(run => run.structuralExpand.affectedStat.mean))
const aggregateComputedAffected = stats(runResults.map(run => run.computedExpand.affectedStat.mean))
const aggregateHeapDelta = stats(runResults.map(run => run.heapDeltaMb))

if (aggregateElapsed.p95 > PERF_BUDGET_TOTAL_MS) {
  budgetErrors.push(
    `aggregate elapsed p95 ${aggregateElapsed.p95.toFixed(2)}ms exceeds PERF_BUDGET_TOTAL_MS=${PERF_BUDGET_TOTAL_MS}ms`,
  )
}

for (const aggregate of [
  { name: "elapsed", stat: aggregateElapsed },
  { name: "register", stat: aggregateRegister },
  { name: "structural-expand p95", stat: aggregateStructuralP95 },
  { name: "computed-expand p95", stat: aggregateComputedP95 },
]) {
  if (shouldEnforceVariance(aggregate.stat)) {
    if (aggregate.stat.cvPct > PERF_BUDGET_MAX_VARIANCE_PCT) {
      budgetErrors.push(
        `${aggregate.name} CV ${aggregate.stat.cvPct.toFixed(2)}% exceeds PERF_BUDGET_MAX_VARIANCE_PCT=${PERF_BUDGET_MAX_VARIANCE_PCT}%`,
      )
    }
  } else if (PERF_BUDGET_MAX_VARIANCE_PCT !== Number.POSITIVE_INFINITY) {
    varianceSkippedChecks.push(
      `${aggregate.name} CV gate skipped (mean ${aggregate.stat.mean.toFixed(3)}ms < PERF_BUDGET_VARIANCE_MIN_MEAN_MS=${PERF_BUDGET_VARIANCE_MIN_MEAN_MS}ms)`,
    )
  }
}

const summary = {
  benchmark: "datagrid-dependency-graph",
  generatedAt: new Date().toISOString(),
  config: {
    seeds: BENCH_SEEDS,
    structuralSourceCount: STRUCTURAL_SOURCE_COUNT,
    structuralBranchFactor: STRUCTURAL_BRANCH_FACTOR,
    computedNodeCount: COMPUTED_NODE_COUNT,
    computedOutDegree: COMPUTED_OUT_DEGREE,
    expandIterations: BENCH_EXPAND_ITERATIONS,
    batchSize: BENCH_BATCH_SIZE,
    warmupRuns: BENCH_WARMUP_RUNS,
    warmupBatchesPerScenario: BENCH_WARMUP_BATCHES,
  },
  budgets: {
    totalMs: PERF_BUDGET_TOTAL_MS,
    maxRegisterMs: PERF_BUDGET_MAX_REGISTER_MS,
    maxStructuralExpandP95Ms: PERF_BUDGET_MAX_STRUCTURAL_EXPAND_P95_MS,
    maxComputedExpandP95Ms: PERF_BUDGET_MAX_COMPUTED_EXPAND_P95_MS,
    minStructuralAffectedMean: PERF_BUDGET_MIN_STRUCTURAL_AFFECTED_MEAN,
    minComputedAffectedMean: PERF_BUDGET_MIN_COMPUTED_AFFECTED_MEAN,
    maxVariancePct: PERF_BUDGET_MAX_VARIANCE_PCT,
    varianceMinMeanMs: PERF_BUDGET_VARIANCE_MIN_MEAN_MS,
    maxHeapDeltaMb: PERF_BUDGET_MAX_HEAP_DELTA_MB,
    heapEpsilonMb: PERF_BUDGET_HEAP_EPSILON_MB,
  },
  varianceSkippedChecks,
  aggregate: {
    elapsedMs: aggregateElapsed,
    registerMs: aggregateRegister,
    structuralExpandP95Ms: aggregateStructuralP95,
    computedExpandP95Ms: aggregateComputedP95,
    structuralAffectedMean: aggregateStructuralAffected,
    computedAffectedMean: aggregateComputedAffected,
    heapDeltaMb: aggregateHeapDelta,
  },
  runs: runResults,
  budgetErrors,
  ok: budgetErrors.length === 0,
}

mkdirSync(dirname(BENCH_OUTPUT_JSON), { recursive: true })
writeFileSync(BENCH_OUTPUT_JSON, JSON.stringify(summary, null, 2))
console.log(`Benchmark summary written: ${BENCH_OUTPUT_JSON}`)

if (budgetErrors.length > 0) {
  console.error("\nDependency graph benchmark budget check failed:")
  for (const error of budgetErrors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}
