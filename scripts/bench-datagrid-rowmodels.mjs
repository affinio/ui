#!/usr/bin/env node

import { performance } from "node:perf_hooks"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const CLIENT_ROW_COUNT = Number.parseInt(process.env.BENCH_CLIENT_ROW_COUNT ?? "120000", 10)
const CLIENT_ITERATIONS = Number.parseInt(process.env.BENCH_CLIENT_ITERATIONS ?? "900", 10)
const CLIENT_RANGE_SIZE = Number.parseInt(process.env.BENCH_CLIENT_RANGE_SIZE ?? "120", 10)

const SERVER_ROW_COUNT = Number.parseInt(process.env.BENCH_SERVER_ROW_COUNT ?? "240000", 10)
const SERVER_ITERATIONS = Number.parseInt(process.env.BENCH_SERVER_ITERATIONS ?? "180", 10)
const SERVER_RANGE_SIZE = Number.parseInt(process.env.BENCH_SERVER_RANGE_SIZE ?? "180", 10)
const SERVER_BLOCK_SIZE = Number.parseInt(process.env.BENCH_SERVER_BLOCK_SIZE ?? "256", 10)

const WINDOW_SHIFT_WINDOW_SIZE = Number.parseInt(
  process.env.BENCH_WINDOW_SHIFT_WINDOW_SIZE ?? process.env.BENCH_INFINITE_WINDOW_SIZE ?? "1600",
  10,
)
const WINDOW_SHIFT_ITERATIONS = Number.parseInt(
  process.env.BENCH_WINDOW_SHIFT_ITERATIONS ?? process.env.BENCH_INFINITE_ITERATIONS ?? "320",
  10,
)
const WINDOW_SHIFT_TOTAL_ROWS = Number.parseInt(
  process.env.BENCH_WINDOW_SHIFT_TOTAL_ROWS ?? process.env.BENCH_INFINITE_TOTAL_ROWS ?? "1000000",
  10,
)
const WINDOW_SHIFT_RANGE_SIZE = Number.parseInt(
  process.env.BENCH_WINDOW_SHIFT_RANGE_SIZE ?? process.env.BENCH_INFINITE_RANGE_SIZE ?? "120",
  10,
)

const BENCH_SEED = Number.parseInt(process.env.BENCH_SEED ?? "1337", 10)
const BENCH_SEEDS = (process.env.BENCH_SEEDS ?? `${BENCH_SEED}`)
  .split(",")
  .map((value) => Number.parseInt(value.trim(), 10))
  .filter((value) => Number.isFinite(value) && value > 0)

const PERF_BUDGET_TOTAL_MS = Number.parseFloat(process.env.PERF_BUDGET_TOTAL_MS ?? "Infinity")
const PERF_BUDGET_MAX_CLIENT_RANGE_P95_MS = Number.parseFloat(
  process.env.PERF_BUDGET_MAX_CLIENT_RANGE_P95_MS ?? "Infinity",
)
const PERF_BUDGET_MAX_CLIENT_RANGE_P99_MS = Number.parseFloat(
  process.env.PERF_BUDGET_MAX_CLIENT_RANGE_P99_MS ?? "Infinity",
)
const PERF_BUDGET_MAX_SERVER_RANGE_P95_MS = Number.parseFloat(
  process.env.PERF_BUDGET_MAX_SERVER_RANGE_P95_MS ?? "Infinity",
)
const PERF_BUDGET_MAX_SERVER_RANGE_P99_MS = Number.parseFloat(
  process.env.PERF_BUDGET_MAX_SERVER_RANGE_P99_MS ?? "Infinity",
)
const PERF_BUDGET_MAX_WINDOW_SHIFT_P95_MS = Number.parseFloat(
  process.env.PERF_BUDGET_MAX_WINDOW_SHIFT_P95_MS ??
    process.env.PERF_BUDGET_MAX_INFINITE_SHIFT_P95_MS ??
    "Infinity",
)
const PERF_BUDGET_MAX_WINDOW_SHIFT_P99_MS = Number.parseFloat(
  process.env.PERF_BUDGET_MAX_WINDOW_SHIFT_P99_MS ??
    process.env.PERF_BUDGET_MAX_INFINITE_SHIFT_P99_MS ??
    "Infinity",
)
const PERF_BUDGET_MAX_VARIANCE_PCT = Number.parseFloat(process.env.PERF_BUDGET_MAX_VARIANCE_PCT ?? "Infinity")
const PERF_BUDGET_MAX_HEAP_DELTA_MB = Number.parseFloat(process.env.PERF_BUDGET_MAX_HEAP_DELTA_MB ?? "Infinity")
const BENCH_OUTPUT_JSON = process.env.BENCH_OUTPUT_JSON ? resolve(process.env.BENCH_OUTPUT_JSON) : null

function assertPositiveInteger(value, label) {
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
    throw new Error(`${label} must be a positive integer`)
  }
}

assertPositiveInteger(CLIENT_ROW_COUNT, "BENCH_CLIENT_ROW_COUNT")
assertPositiveInteger(CLIENT_ITERATIONS, "BENCH_CLIENT_ITERATIONS")
assertPositiveInteger(CLIENT_RANGE_SIZE, "BENCH_CLIENT_RANGE_SIZE")
assertPositiveInteger(SERVER_ROW_COUNT, "BENCH_SERVER_ROW_COUNT")
assertPositiveInteger(SERVER_ITERATIONS, "BENCH_SERVER_ITERATIONS")
assertPositiveInteger(SERVER_RANGE_SIZE, "BENCH_SERVER_RANGE_SIZE")
assertPositiveInteger(SERVER_BLOCK_SIZE, "BENCH_SERVER_BLOCK_SIZE")
assertPositiveInteger(WINDOW_SHIFT_WINDOW_SIZE, "BENCH_WINDOW_SHIFT_WINDOW_SIZE")
assertPositiveInteger(WINDOW_SHIFT_ITERATIONS, "BENCH_WINDOW_SHIFT_ITERATIONS")
assertPositiveInteger(WINDOW_SHIFT_TOTAL_ROWS, "BENCH_WINDOW_SHIFT_TOTAL_ROWS")
assertPositiveInteger(WINDOW_SHIFT_RANGE_SIZE, "BENCH_WINDOW_SHIFT_RANGE_SIZE")
if (!BENCH_SEEDS.length) {
  throw new Error("BENCH_SEEDS must include at least one positive integer")
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
  const p50 = quantile(values, 0.5)
  const p95 = quantile(values, 0.95)
  const p99 = quantile(values, 0.99)
  const cvPct = mean === 0 ? 0 : (stdev / mean) * 100
  const min = Math.min(...values)
  const max = Math.max(...values)
  return { mean, stdev, p50, p95, p99, cvPct, min, max }
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

function createVisibleRows(count, offset = 0) {
  const rows = new Array(count)
  for (let index = 0; index < count; index += 1) {
    const id = offset + index
    rows[index] = {
      row: { id, value: `row-${id}` },
      rowId: id,
      originalIndex: index,
      displayIndex: index,
    }
  }
  return rows
}

async function loadModelFactories() {
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
      if (
        typeof module.createClientRowModel === "function" &&
        typeof module.createServerBackedRowModel === "function"
      ) {
        return {
          createClientRowModel: module.createClientRowModel,
          createServerBackedRowModel: module.createServerBackedRowModel,
        }
      }
    } catch (error) {
      lastError = error
    }
  }

  if (lastError) {
    throw new Error(`Failed to load datagrid model factories: ${String(lastError)}`)
  }
  throw new Error(
    "Unable to locate datagrid-core build artifacts for row-model benchmark. Run `pnpm --filter @affino/datagrid-core build`.",
  )
}

function createServerSource(totalRows, blockSize) {
  const rowCache = new Map()
  const blocksValue = new Map()
  const loadedRangesValue = []
  const loading = { value: false }
  const error = { value: null }

  const diagnostics = {
    value: {
      cacheBlocks: 0,
      cachedRows: 0,
      pendingBlocks: 0,
      pendingRequests: 0,
      abortedRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      effectivePreloadThreshold: 0.6,
    },
  }

  function updateDiagnostics() {
    diagnostics.value.cacheBlocks = blocksValue.size
    diagnostics.value.cachedRows = rowCache.size
  }

  async function fetchBlock(start) {
    const normalizedStart = Math.max(0, Math.min(totalRows - 1, Math.trunc(start)))
    loading.value = true
    diagnostics.value.pendingRequests += 1
    try {
      if (blocksValue.has(normalizedStart)) {
        diagnostics.value.cacheHits += 1
        return blocksValue.get(normalizedStart)
      }
      diagnostics.value.cacheMisses += 1
      const rows = []
      for (let offset = 0; offset < blockSize; offset += 1) {
        const index = normalizedStart + offset
        if (index >= totalRows) break
        let row = rowCache.get(index)
        if (!row) {
          row = { id: index, value: `row-${index}` }
          rowCache.set(index, row)
        }
        rows.push(row)
      }
      blocksValue.set(normalizedStart, rows)
      if (rows.length) {
        loadedRangesValue.push({ start: normalizedStart, end: normalizedStart + rows.length - 1 })
      }
      updateDiagnostics()
      return rows
    } finally {
      diagnostics.value.pendingRequests = Math.max(0, diagnostics.value.pendingRequests - 1)
      loading.value = false
    }
  }

  return {
    rows: { value: [] },
    loading,
    error,
    blocks: { value: blocksValue },
    total: { value: totalRows },
    loadedRanges: { value: loadedRangesValue },
    progress: { value: 1 },
    blockErrors: { value: new Map() },
    diagnostics,
    getRowAt(index) {
      return rowCache.get(index)
    },
    getRowCount() {
      return totalRows
    },
    refreshBlock: async (start) => fetchBlock(start),
    fetchBlock,
    reset() {
      rowCache.clear()
      blocksValue.clear()
      loadedRangesValue.length = 0
      updateDiagnostics()
    },
    abortAll() {},
    dispose() {
      rowCache.clear()
      blocksValue.clear()
      loadedRangesValue.length = 0
      updateDiagnostics()
    },
  }
}

async function runClientScenario(factories, seed) {
  const rng = createRng(seed)
  const model = factories.createClientRowModel({
    rows: createVisibleRows(CLIENT_ROW_COUNT),
  })
  const durations = []

  try {
    const maxStart = Math.max(0, CLIENT_ROW_COUNT - CLIENT_RANGE_SIZE - 1)
    for (let iteration = 0; iteration < CLIENT_ITERATIONS; iteration += 1) {
      const start = randomInt(rng, 0, maxStart)
      const end = Math.min(CLIENT_ROW_COUNT - 1, start + CLIENT_RANGE_SIZE)
      const t0 = performance.now()
      model.setViewportRange({ start, end })
      model.getRowsInRange({ start, end })
      durations.push(performance.now() - t0)
    }
  } finally {
    model.dispose()
  }

  return stats(durations)
}

async function runServerScenario(factories, seed) {
  const rng = createRng(seed)
  const source = createServerSource(SERVER_ROW_COUNT, SERVER_BLOCK_SIZE)
  const model = factories.createServerBackedRowModel({ source })
  const durations = []

  try {
    const maxStart = Math.max(0, SERVER_ROW_COUNT - SERVER_RANGE_SIZE - 1)
    for (let iteration = 0; iteration < SERVER_ITERATIONS; iteration += 1) {
      const start = randomInt(rng, 0, maxStart)
      const end = Math.min(SERVER_ROW_COUNT - 1, start + SERVER_RANGE_SIZE)
      const t0 = performance.now()
      model.setViewportRange({ start, end })
      await model.refresh("viewport-change")
      model.getRowsInRange({ start, end })
      durations.push(performance.now() - t0)
    }
  } finally {
    model.dispose()
    source.dispose()
  }

  return stats(durations)
}

async function runWindowShiftProxyScenario(factories, seed) {
  const rng = createRng(seed)
  const model = factories.createClientRowModel({
    rows: createVisibleRows(WINDOW_SHIFT_WINDOW_SIZE, 0),
  })
  const durations = []
  let offset = 0

  try {
    const maxOffset = Math.max(0, WINDOW_SHIFT_TOTAL_ROWS - WINDOW_SHIFT_WINDOW_SIZE - 1)
    const maxLocalStart = Math.max(0, WINDOW_SHIFT_WINDOW_SIZE - WINDOW_SHIFT_RANGE_SIZE - 1)

    for (let iteration = 0; iteration < WINDOW_SHIFT_ITERATIONS; iteration += 1) {
      const delta = randomInt(rng, 1, Math.max(2, Math.floor(WINDOW_SHIFT_WINDOW_SIZE / 4)))
      offset = Math.min(maxOffset, (offset + delta) % Math.max(1, maxOffset + 1))
      const localStart = randomInt(rng, 0, maxLocalStart)
      const localEnd = Math.min(WINDOW_SHIFT_WINDOW_SIZE - 1, localStart + WINDOW_SHIFT_RANGE_SIZE)
      const t0 = performance.now()
      model.setRows(createVisibleRows(WINDOW_SHIFT_WINDOW_SIZE, offset))
      model.setViewportRange({ start: localStart, end: localEnd })
      model.getRowsInRange({ start: localStart, end: localEnd })
      durations.push(performance.now() - t0)
    }
  } finally {
    model.dispose()
  }

  return stats(durations)
}

const factories = await loadModelFactories()
const runResults = []
const budgetErrors = []

console.log("\nAffino DataGrid RowModel Benchmark")
console.log(
  `seeds=${BENCH_SEEDS.join(",")} clientRows=${CLIENT_ROW_COUNT} serverRows=${SERVER_ROW_COUNT} windowShiftWindow=${WINDOW_SHIFT_WINDOW_SIZE}`,
)

for (const seed of BENCH_SEEDS) {
  const heapStart = process.memoryUsage().heapUsed
  const startedAt = performance.now()
  const client = await runClientScenario(factories, seed)
  const server = await runServerScenario(factories, seed)
  const windowShift = await runWindowShiftProxyScenario(factories, seed)
  const elapsed = performance.now() - startedAt
  const heapEnd = process.memoryUsage().heapUsed
  const heapDeltaMb = (heapEnd - heapStart) / (1024 * 1024)

  runResults.push({
    seed,
    elapsedMs: elapsed,
    heapDeltaMb,
    scenarios: { client, server, windowShift },
  })

  console.log(`\nSeed ${seed}`)
  console.table([
    {
      scenario: "client",
      p50Ms: client.p50.toFixed(3),
      p95Ms: client.p95.toFixed(3),
      p99Ms: client.p99.toFixed(3),
      cvPct: client.cvPct.toFixed(2),
      maxMs: client.max.toFixed(3),
    },
    {
      scenario: "server",
      p50Ms: server.p50.toFixed(3),
      p95Ms: server.p95.toFixed(3),
      p99Ms: server.p99.toFixed(3),
      cvPct: server.cvPct.toFixed(2),
      maxMs: server.max.toFixed(3),
    },
    {
      scenario: "window-shift-proxy",
      p50Ms: windowShift.p50.toFixed(3),
      p95Ms: windowShift.p95.toFixed(3),
      p99Ms: windowShift.p99.toFixed(3),
      cvPct: windowShift.cvPct.toFixed(2),
      maxMs: windowShift.max.toFixed(3),
    },
  ])
  console.log(`Total elapsed: ${elapsed.toFixed(2)}ms`)
  console.log(`Heap delta: ${heapDeltaMb.toFixed(2)}MB`)

  if (elapsed > PERF_BUDGET_TOTAL_MS) {
    budgetErrors.push(
      `seed ${seed}: total elapsed ${elapsed.toFixed(2)}ms exceeds PERF_BUDGET_TOTAL_MS=${PERF_BUDGET_TOTAL_MS}ms`,
    )
  }
  if (heapDeltaMb > PERF_BUDGET_MAX_HEAP_DELTA_MB) {
    budgetErrors.push(
      `seed ${seed}: heap delta ${heapDeltaMb.toFixed(2)}MB exceeds PERF_BUDGET_MAX_HEAP_DELTA_MB=${PERF_BUDGET_MAX_HEAP_DELTA_MB}MB`,
    )
  }
  if (client.p95 > PERF_BUDGET_MAX_CLIENT_RANGE_P95_MS) {
    budgetErrors.push(
      `seed ${seed}: client p95 ${client.p95.toFixed(3)}ms exceeds PERF_BUDGET_MAX_CLIENT_RANGE_P95_MS=${PERF_BUDGET_MAX_CLIENT_RANGE_P95_MS}ms`,
    )
  }
  if (client.p99 > PERF_BUDGET_MAX_CLIENT_RANGE_P99_MS) {
    budgetErrors.push(
      `seed ${seed}: client p99 ${client.p99.toFixed(3)}ms exceeds PERF_BUDGET_MAX_CLIENT_RANGE_P99_MS=${PERF_BUDGET_MAX_CLIENT_RANGE_P99_MS}ms`,
    )
  }
  if (server.p95 > PERF_BUDGET_MAX_SERVER_RANGE_P95_MS) {
    budgetErrors.push(
      `seed ${seed}: server p95 ${server.p95.toFixed(3)}ms exceeds PERF_BUDGET_MAX_SERVER_RANGE_P95_MS=${PERF_BUDGET_MAX_SERVER_RANGE_P95_MS}ms`,
    )
  }
  if (server.p99 > PERF_BUDGET_MAX_SERVER_RANGE_P99_MS) {
    budgetErrors.push(
      `seed ${seed}: server p99 ${server.p99.toFixed(3)}ms exceeds PERF_BUDGET_MAX_SERVER_RANGE_P99_MS=${PERF_BUDGET_MAX_SERVER_RANGE_P99_MS}ms`,
    )
  }
  if (windowShift.p95 > PERF_BUDGET_MAX_WINDOW_SHIFT_P95_MS) {
    budgetErrors.push(
      `seed ${seed}: window-shift-proxy p95 ${windowShift.p95.toFixed(3)}ms exceeds PERF_BUDGET_MAX_WINDOW_SHIFT_P95_MS=${PERF_BUDGET_MAX_WINDOW_SHIFT_P95_MS}ms`,
    )
  }
  if (windowShift.p99 > PERF_BUDGET_MAX_WINDOW_SHIFT_P99_MS) {
    budgetErrors.push(
      `seed ${seed}: window-shift-proxy p99 ${windowShift.p99.toFixed(3)}ms exceeds PERF_BUDGET_MAX_WINDOW_SHIFT_P99_MS=${PERF_BUDGET_MAX_WINDOW_SHIFT_P99_MS}ms`,
    )
  }
}

const aggregateElapsed = stats(runResults.map((run) => run.elapsedMs))
const aggregateHeap = stats(runResults.map((run) => run.heapDeltaMb))
const aggregateClient = stats(runResults.map((run) => run.scenarios.client.p95))
const aggregateClientP99 = stats(runResults.map((run) => run.scenarios.client.p99))
const aggregateServer = stats(runResults.map((run) => run.scenarios.server.p95))
const aggregateServerP99 = stats(runResults.map((run) => run.scenarios.server.p99))
const aggregateWindowShift = stats(runResults.map((run) => run.scenarios.windowShift.p95))
const aggregateWindowShiftP99 = stats(runResults.map((run) => run.scenarios.windowShift.p99))

if (aggregateElapsed.cvPct > PERF_BUDGET_MAX_VARIANCE_PCT) {
  budgetErrors.push(
    `elapsed CV ${aggregateElapsed.cvPct.toFixed(2)}% exceeds PERF_BUDGET_MAX_VARIANCE_PCT=${PERF_BUDGET_MAX_VARIANCE_PCT}%`,
  )
}
for (const aggregate of [
  { name: "client p95", value: aggregateClient.cvPct },
  { name: "client p99", value: aggregateClientP99.cvPct },
  { name: "server p95", value: aggregateServer.cvPct },
  { name: "server p99", value: aggregateServerP99.cvPct },
  { name: "window-shift-proxy p95", value: aggregateWindowShift.cvPct },
  { name: "window-shift-proxy p99", value: aggregateWindowShiftP99.cvPct },
]) {
  if (aggregate.value > PERF_BUDGET_MAX_VARIANCE_PCT) {
    budgetErrors.push(
      `${aggregate.name} CV ${aggregate.value.toFixed(2)}% exceeds PERF_BUDGET_MAX_VARIANCE_PCT=${PERF_BUDGET_MAX_VARIANCE_PCT}%`,
    )
  }
}

const summary = {
  benchmark: "datagrid-row-models",
  generatedAt: new Date().toISOString(),
  config: {
    seeds: BENCH_SEEDS,
    client: {
      rowCount: CLIENT_ROW_COUNT,
      iterations: CLIENT_ITERATIONS,
      rangeSize: CLIENT_RANGE_SIZE,
    },
    server: {
      rowCount: SERVER_ROW_COUNT,
      iterations: SERVER_ITERATIONS,
      rangeSize: SERVER_RANGE_SIZE,
      blockSize: SERVER_BLOCK_SIZE,
    },
    windowShiftProxy: {
      totalRows: WINDOW_SHIFT_TOTAL_ROWS,
      windowSize: WINDOW_SHIFT_WINDOW_SIZE,
      iterations: WINDOW_SHIFT_ITERATIONS,
      rangeSize: WINDOW_SHIFT_RANGE_SIZE,
    },
  },
  budgets: {
    totalMs: PERF_BUDGET_TOTAL_MS,
    maxClientRangeP95Ms: PERF_BUDGET_MAX_CLIENT_RANGE_P95_MS,
    maxClientRangeP99Ms: PERF_BUDGET_MAX_CLIENT_RANGE_P99_MS,
    maxServerRangeP95Ms: PERF_BUDGET_MAX_SERVER_RANGE_P95_MS,
    maxServerRangeP99Ms: PERF_BUDGET_MAX_SERVER_RANGE_P99_MS,
    maxWindowShiftP95Ms: PERF_BUDGET_MAX_WINDOW_SHIFT_P95_MS,
    maxWindowShiftP99Ms: PERF_BUDGET_MAX_WINDOW_SHIFT_P99_MS,
    maxVariancePct: PERF_BUDGET_MAX_VARIANCE_PCT,
    maxHeapDeltaMb: PERF_BUDGET_MAX_HEAP_DELTA_MB,
  },
  aggregate: {
    elapsedMs: aggregateElapsed,
    heapDeltaMb: aggregateHeap,
    clientP95Ms: aggregateClient,
    clientP99Ms: aggregateClientP99,
    serverP95Ms: aggregateServer,
    serverP99Ms: aggregateServerP99,
    windowShiftP95Ms: aggregateWindowShift,
    windowShiftP99Ms: aggregateWindowShiftP99,
  },
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
  console.error("\nRowModel benchmark budget check failed:")
  for (const error of budgetErrors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}
