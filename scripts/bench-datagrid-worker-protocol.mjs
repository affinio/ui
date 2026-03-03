#!/usr/bin/env node

import { performance } from "node:perf_hooks"
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const BENCH_SEED = Number.parseInt(process.env.BENCH_SEED ?? "1337", 10)
const BENCH_SEEDS = (process.env.BENCH_SEEDS ?? `${BENCH_SEED}`)
  .split(",")
  .map(value => Number.parseInt(value.trim(), 10))
  .filter(value => Number.isFinite(value) && value > 0)

const BENCH_ROW_COUNT = Number.parseInt(process.env.BENCH_WORKER_ROW_COUNT ?? "5000", 10)
const BENCH_VIEWPORT_SIZE = Number.parseInt(process.env.BENCH_WORKER_VIEWPORT_SIZE ?? "140", 10)
const BENCH_CORRECTNESS_ITERATIONS = Number.parseInt(process.env.BENCH_WORKER_CORRECTNESS_ITERATIONS ?? "1000", 10)
const BENCH_CORRECTNESS_DELAY_MAX_MS = Number.parseInt(process.env.BENCH_WORKER_CORRECTNESS_DELAY_MAX_MS ?? "50", 10)
const BENCH_CORRECTNESS_DROP_UPDATE_PCT = Number.parseFloat(process.env.BENCH_WORKER_CORRECTNESS_DROP_UPDATE_PCT ?? "0.2")
const BENCH_CORRECTNESS_STALE_INJECT_EVERY = Number.parseInt(process.env.BENCH_WORKER_CORRECTNESS_STALE_INJECT_EVERY ?? "20", 10)
const BENCH_THROUGHPUT_ITERATIONS = Number.parseInt(process.env.BENCH_WORKER_THROUGHPUT_ITERATIONS ?? "800", 10)
const BENCH_THROUGHPUT_DELAY_MAX_MS = Number.parseInt(process.env.BENCH_WORKER_THROUGHPUT_DELAY_MAX_MS ?? "10", 10)
const BENCH_OUTPUT_JSON = process.env.BENCH_OUTPUT_JSON
  ? resolve(process.env.BENCH_OUTPUT_JSON)
  : resolve("artifacts/performance/bench-datagrid-worker-protocol.json")

const PERF_BUDGET_TOTAL_MS = Number.parseFloat(process.env.PERF_BUDGET_TOTAL_MS ?? "Infinity")
const PERF_BUDGET_MAX_LOADING_TRUE_P95_PCT = Number.parseFloat(process.env.PERF_BUDGET_MAX_LOADING_TRUE_P95_PCT ?? "Infinity")
const PERF_BUDGET_MAX_LOADING_CYCLE_P95_MS = Number.parseFloat(process.env.PERF_BUDGET_MAX_LOADING_CYCLE_P95_MS ?? "Infinity")
const PERF_BUDGET_MAX_STUCK_LOADING = Number.parseInt(process.env.PERF_BUDGET_MAX_STUCK_LOADING ?? "0", 10)
const PERF_BUDGET_MAX_STALE_APPLIED = Number.parseInt(process.env.PERF_BUDGET_MAX_STALE_APPLIED ?? "0", 10)
const PERF_BUDGET_MAX_ROUNDTRIP_P95_MS = Number.parseFloat(process.env.PERF_BUDGET_MAX_ROUNDTRIP_P95_MS ?? "Infinity")
const PERF_BUDGET_MAX_SPLIT_ELAPSED_DRIFT_PCT = Number.parseFloat(process.env.PERF_BUDGET_MAX_SPLIT_ELAPSED_DRIFT_PCT ?? "Infinity")
const PERF_BUDGET_MAX_VARIANCE_PCT = Number.parseFloat(process.env.PERF_BUDGET_MAX_VARIANCE_PCT ?? "Infinity")
const PERF_BUDGET_VARIANCE_MIN_MEAN_MS = Number.parseFloat(process.env.PERF_BUDGET_VARIANCE_MIN_MEAN_MS ?? "0.5")
const PERF_BUDGET_MAX_HEAP_DELTA_MB = Number.parseFloat(process.env.PERF_BUDGET_MAX_HEAP_DELTA_MB ?? "Infinity")
const PERF_BUDGET_HEAP_EPSILON_MB = Number.parseFloat(process.env.PERF_BUDGET_HEAP_EPSILON_MB ?? "1")

assertPositiveInteger(BENCH_ROW_COUNT, "BENCH_WORKER_ROW_COUNT")
assertPositiveInteger(BENCH_VIEWPORT_SIZE, "BENCH_WORKER_VIEWPORT_SIZE")
assertPositiveInteger(BENCH_CORRECTNESS_ITERATIONS, "BENCH_WORKER_CORRECTNESS_ITERATIONS")
assertNonNegativeInteger(BENCH_CORRECTNESS_DELAY_MAX_MS, "BENCH_WORKER_CORRECTNESS_DELAY_MAX_MS")
assertRange(BENCH_CORRECTNESS_DROP_UPDATE_PCT, 0, 1, "BENCH_WORKER_CORRECTNESS_DROP_UPDATE_PCT")
assertNonNegativeInteger(BENCH_CORRECTNESS_STALE_INJECT_EVERY, "BENCH_WORKER_CORRECTNESS_STALE_INJECT_EVERY")
assertPositiveInteger(BENCH_THROUGHPUT_ITERATIONS, "BENCH_WORKER_THROUGHPUT_ITERATIONS")
assertNonNegativeInteger(BENCH_THROUGHPUT_DELAY_MAX_MS, "BENCH_WORKER_THROUGHPUT_DELAY_MAX_MS")
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

function assertRange(value, min, max, label) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} must be within [${min}, ${max}]`)
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

function randomInt(rng, maxExclusive) {
  if (maxExclusive <= 1) {
    return 0
  }
  return Math.floor(rng() * maxExclusive)
}

function sleep(ms) {
  return new Promise(resolveSleep => setTimeout(resolveSleep, ms))
}

async function flushMicrotasks(rounds = 3) {
  for (let index = 0; index < rounds; index += 1) {
    await Promise.resolve()
  }
}

function toMb(bytes) {
  return bytes / (1024 * 1024)
}

async function sampleHeapUsed() {
  const maybeGc = globalThis.gc
  let minHeap = Number.POSITIVE_INFINITY
  for (let iteration = 0; iteration < 3; iteration += 1) {
    if (typeof maybeGc === "function") {
      maybeGc()
    }
    await sleep(0)
    const used = process.memoryUsage().heapUsed
    if (used < minHeap) {
      minHeap = used
    }
  }
  return Number.isFinite(minHeap) ? minHeap : process.memoryUsage().heapUsed
}

function safeClone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value)
  }
  return JSON.parse(JSON.stringify(value))
}

function safePayloadBytes(message) {
  try {
    return Buffer.byteLength(JSON.stringify(message), "utf8")
  } catch {
    return 0
  }
}

function createRows(count, seed) {
  const rng = createRng(seed)
  const regions = ["AMER", "EMEA", "APAC"]
  const rows = new Array(count)
  for (let index = 0; index < count; index += 1) {
    rows[index] = {
      rowId: index + 1,
      row: {
        id: index + 1,
        region: regions[index % regions.length],
        revenue: 100 + Math.floor(rng() * 5_000),
      },
      originalIndex: index,
      displayIndex: index,
    }
  }
  return rows
}

function createInstrumentedChannel(options) {
  const {
    isUpdateMessage,
    isCommandMessage,
    rng,
    delayMaxMs,
    dropUpdatePct = 0,
  } = options

  const listenersBySide = {
    main: new Set(),
    worker: new Set(),
  }

  const telemetry = {
    commandCount: 0,
    updateSentCount: 0,
    updateDeliveredCount: 0,
    updateDroppedCount: 0,
    staleInjectedCount: 0,
    commandPayloadBytes: [],
    updatePayloadBytes: [],
    roundtripMs: [],
  }

  const pendingSentAtByRequestId = new Map()
  let dropUpdatesEnabled = true
  let lastDeliveredUpdate = null

  const emit = (side, message) => {
    for (const listener of listenersBySide[side]) {
      listener({ data: message })
    }
  }

  const schedule = (fn) => {
    const delay = delayMaxMs <= 0 ? 0 : Math.floor(rng() * (delayMaxMs + 1))
    setTimeout(fn, delay)
  }

  const handleMainToWorker = (message) => {
    if (isCommandMessage(message)) {
      telemetry.commandCount += 1
      telemetry.commandPayloadBytes.push(safePayloadBytes(message))
      pendingSentAtByRequestId.set(message.requestId, performance.now())
    }
    schedule(() => emit("worker", message))
  }

  const handleWorkerToMain = (message) => {
    if (isUpdateMessage(message)) {
      telemetry.updateSentCount += 1
      telemetry.updatePayloadBytes.push(safePayloadBytes(message))
      if (dropUpdatesEnabled && dropUpdatePct > 0 && rng() < dropUpdatePct) {
        telemetry.updateDroppedCount += 1
        return
      }
    }
    schedule(() => {
      if (isUpdateMessage(message)) {
        telemetry.updateDeliveredCount += 1
        const sentAt = pendingSentAtByRequestId.get(message.requestId)
        if (typeof sentAt === "number") {
          telemetry.roundtripMs.push(performance.now() - sentAt)
          pendingSentAtByRequestId.delete(message.requestId)
        }
        lastDeliveredUpdate = safeClone(message)
      }
      emit("main", message)
    })
  }

  const main = {
    postMessage(message) {
      handleMainToWorker(message)
    },
    addEventListener(type, listener) {
      if (type !== "message") return
      listenersBySide.main.add(listener)
    },
    removeEventListener(type, listener) {
      if (type !== "message") return
      listenersBySide.main.delete(listener)
    },
  }

  const worker = {
    postMessage(message) {
      handleWorkerToMain(message)
    },
    addEventListener(type, listener) {
      if (type !== "message") return
      listenersBySide.worker.add(listener)
    },
    removeEventListener(type, listener) {
      if (type !== "message") return
      listenersBySide.worker.delete(listener)
    },
  }

  return {
    main,
    worker,
    setDropUpdatesEnabled(value) {
      dropUpdatesEnabled = Boolean(value)
    },
    injectStaleUpdate() {
      if (!lastDeliveredUpdate || !isUpdateMessage(lastDeliveredUpdate)) {
        return false
      }
      if (!Number.isFinite(lastDeliveredUpdate.requestId) || lastDeliveredUpdate.requestId <= 1) {
        return false
      }
      const stale = safeClone(lastDeliveredUpdate)
      stale.requestId = stale.requestId - 1
      stale.timestamp = Date.now()
      if (stale.payload?.snapshot) {
        stale.payload.snapshot.error = "__stale__"
      }
      telemetry.staleInjectedCount += 1
      schedule(() => emit("main", stale))
      return true
    },
    getRoundtripStats() {
      return telemetry.roundtripMs.length ? stats(telemetry.roundtripMs) : stats([])
    },
    getPayloadStats() {
      return {
        command: telemetry.commandPayloadBytes.length ? stats(telemetry.commandPayloadBytes) : stats([]),
        update: telemetry.updatePayloadBytes.length ? stats(telemetry.updatePayloadBytes) : stats([]),
      }
    },
    stats: telemetry,
  }
}

async function waitFor(predicate, timeoutMs = 10_000, pollMs = 8) {
  const startedAt = performance.now()
  while (performance.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return true
    }
    await sleep(pollMs)
  }
  return false
}

async function loadFactories() {
  const candidate = resolve("packages/datagrid-worker/dist/index.js")
  const sourceCandidates = [
    resolve("packages/datagrid-worker/src/workerOwnedRowModel.ts"),
    resolve("packages/datagrid-worker/src/workerOwnedRowModelHost.ts"),
  ]
  const allowStaleDist = process.env.BENCH_ALLOW_STALE_DIST === "1"
  const enforceFreshDist = process.env.BENCH_ENFORCE_FRESH_DIST === "1"
  if (!existsSync(candidate)) {
    throw new Error("Unable to locate datagrid-worker build artifacts. Run `pnpm --filter @affino/datagrid-worker build`.")
  }
  if (!allowStaleDist) {
    const distTimestamp = statSync(candidate).mtimeMs
    const newestSourceTimestamp = Math.max(
      ...sourceCandidates
        .filter(path => existsSync(path))
        .map(path => statSync(path).mtimeMs),
      0,
    )
    if (newestSourceTimestamp > distTimestamp) {
      const message = `Datagrid worker dist artifact appears stale (${candidate}). Run \`pnpm --filter @affino/datagrid-worker build\` before benchmarks.`
      if (enforceFreshDist) {
        throw new Error(message)
      }
      console.warn(`[bench] ${message} Continuing because BENCH_ENFORCE_FRESH_DIST is not set.`)
    }
  }

  const module = await import(pathToFileURL(candidate).href)
  if (
    typeof module.createDataGridWorkerOwnedRowModel !== "function"
    || typeof module.createDataGridWorkerOwnedRowModelHost !== "function"
    || typeof module.isDataGridWorkerRowModelUpdateMessage !== "function"
    || typeof module.isDataGridWorkerRowModelCommandMessage !== "function"
    || typeof module.createDataGridWorkerRowModelUpdateMessage !== "function"
  ) {
    throw new Error("datagrid-worker dist exports are incomplete")
  }
  return {
    createDataGridWorkerOwnedRowModel: module.createDataGridWorkerOwnedRowModel,
    createDataGridWorkerOwnedRowModelHost: module.createDataGridWorkerOwnedRowModelHost,
    isDataGridWorkerRowModelUpdateMessage: module.isDataGridWorkerRowModelUpdateMessage,
    isDataGridWorkerRowModelCommandMessage: module.isDataGridWorkerRowModelCommandMessage,
    createDataGridWorkerRowModelUpdateMessage: module.createDataGridWorkerRowModelUpdateMessage,
  }
}

async function runCorrectnessScenario(factories, seed) {
  const rng = createRng(seed * 101 + 7)
  const rows = createRows(BENCH_ROW_COUNT, seed)
  const channel = createInstrumentedChannel({
    isUpdateMessage: factories.isDataGridWorkerRowModelUpdateMessage,
    isCommandMessage: factories.isDataGridWorkerRowModelCommandMessage,
    rng,
    delayMaxMs: BENCH_CORRECTNESS_DELAY_MAX_MS,
    dropUpdatePct: BENCH_CORRECTNESS_DROP_UPDATE_PCT,
  })
  const host = factories.createDataGridWorkerOwnedRowModelHost({
    source: channel.worker,
    target: channel.worker,
    rows,
    rowIdKey: "id",
    columns: [
      { key: "id", label: "Id" },
      { key: "region", label: "Region" },
      { key: "revenue", label: "Revenue" },
    ],
  })
  const mirror = factories.createDataGridWorkerOwnedRowModel({
    source: channel.main,
    target: channel.main,
    requestInitialSync: true,
    viewportCoalescingStrategy: "split",
  })

  let staleAppliedCount = 0
  let loadingTrueSince = null
  let loadingTrueMs = 0
  const loadingCycleMs = []
  const startedAt = performance.now()

  const unsubscribe = mirror.subscribe(snapshot => {
    if (snapshot.error === "__stale__") {
      staleAppliedCount += 1
    }
    if (snapshot.loading) {
      if (loadingTrueSince == null) {
        loadingTrueSince = performance.now()
      }
      return
    }
    if (loadingTrueSince != null) {
      const cycle = performance.now() - loadingTrueSince
      loadingTrueMs += cycle
      loadingCycleMs.push(cycle)
      loadingTrueSince = null
    }
  })

  await sleep(BENCH_CORRECTNESS_DELAY_MAX_MS + 10)
  await flushMicrotasks(5)

  for (let iteration = 0; iteration < BENCH_CORRECTNESS_ITERATIONS; iteration += 1) {
    const maxStart = Math.max(1, BENCH_ROW_COUNT - BENCH_VIEWPORT_SIZE)
    const start = randomInt(rng, maxStart)
    mirror.setViewportRange({ start, end: Math.min(BENCH_ROW_COUNT - 1, start + BENCH_VIEWPORT_SIZE - 1) })
    if (BENCH_CORRECTNESS_STALE_INJECT_EVERY > 0 && iteration % BENCH_CORRECTNESS_STALE_INJECT_EVERY === 0) {
      channel.injectStaleUpdate()
    }
    if (iteration % 25 === 0) {
      await sleep(0)
    }
  }

  channel.setDropUpdatesEnabled(false)
  const finalStart = Math.max(0, BENCH_ROW_COUNT - BENCH_VIEWPORT_SIZE)
  const finalRange = {
    start: finalStart,
    end: Math.min(BENCH_ROW_COUNT - 1, finalStart + BENCH_VIEWPORT_SIZE - 1),
  }
  mirror.setViewportRange(finalRange)
  const settled = await waitFor(() => {
    const snapshot = mirror.getSnapshot()
    return (
      snapshot.viewportRange.start === finalRange.start
      && snapshot.viewportRange.end === finalRange.end
      && snapshot.loading === false
    )
  }, 15_000, 10)

  const elapsedMs = performance.now() - startedAt
  if (loadingTrueSince != null) {
    loadingTrueMs += (performance.now() - loadingTrueSince)
  }
  const loadingTruePct = elapsedMs > 0 ? (loadingTrueMs / elapsedMs) * 100 : 0

  const protocolDiagnostics = mirror.getWorkerProtocolDiagnostics()
  const computeDiagnostics = mirror.getComputeDiagnostics()
  const roundtrip = channel.getRoundtripStats()
  const payload = channel.getPayloadStats()
  const stuckLoading = !settled || mirror.getSnapshot().loading === true

  unsubscribe()
  mirror.dispose()
  host.dispose()

  return {
    elapsedMs,
    loadingTruePct,
    loadingCycleMs: stats(loadingCycleMs),
    staleAppliedCount,
    stuckLoading,
    protocolDiagnostics,
    computeDiagnostics,
    transport: {
      commandCount: channel.stats.commandCount,
      updateSentCount: channel.stats.updateSentCount,
      updateDeliveredCount: channel.stats.updateDeliveredCount,
      updateDroppedCount: channel.stats.updateDroppedCount,
      staleInjectedCount: channel.stats.staleInjectedCount,
      roundtripMs: roundtrip,
      payloadBytes: payload,
    },
  }
}

async function runThroughputScenario(factories, seed, strategy) {
  const rng = createRng(seed * 149 + (strategy === "split" ? 17 : 31))
  const rows = createRows(BENCH_ROW_COUNT, seed + 10)
  const channel = createInstrumentedChannel({
    isUpdateMessage: factories.isDataGridWorkerRowModelUpdateMessage,
    isCommandMessage: factories.isDataGridWorkerRowModelCommandMessage,
    rng,
    delayMaxMs: BENCH_THROUGHPUT_DELAY_MAX_MS,
    dropUpdatePct: 0,
  })
  const host = factories.createDataGridWorkerOwnedRowModelHost({
    source: channel.worker,
    target: channel.worker,
    rows,
    rowIdKey: "id",
    columns: [
      { key: "id", label: "Id" },
      { key: "region", label: "Region" },
      { key: "revenue", label: "Revenue" },
    ],
  })
  const mirror = factories.createDataGridWorkerOwnedRowModel({
    source: channel.main,
    target: channel.main,
    requestInitialSync: true,
    viewportCoalescingStrategy: strategy,
  })

  await sleep(BENCH_THROUGHPUT_DELAY_MAX_MS + 10)
  await flushMicrotasks(5)

  const startedAt = performance.now()
  for (let iteration = 0; iteration < BENCH_THROUGHPUT_ITERATIONS; iteration += 1) {
    const maxStart = Math.max(1, BENCH_ROW_COUNT - BENCH_VIEWPORT_SIZE)
    const start = randomInt(rng, maxStart)
    const range = {
      start,
      end: Math.min(BENCH_ROW_COUNT - 1, start + BENCH_VIEWPORT_SIZE - 1),
    }
    if (iteration % 3 === 0) {
      mirror.getRowsInRange(range)
    } else {
      mirror.setViewportRange(range)
    }
    if (iteration % 40 === 0) {
      await sleep(0)
    }
  }

  const finalRange = {
    start: Math.max(0, BENCH_ROW_COUNT - BENCH_VIEWPORT_SIZE),
    end: BENCH_ROW_COUNT - 1,
  }
  mirror.setViewportRange(finalRange)
  const settled = await waitFor(() => {
    const snapshot = mirror.getSnapshot()
    return (
      snapshot.viewportRange.start === finalRange.start
      && snapshot.viewportRange.end === finalRange.end
      && snapshot.loading === false
    )
  }, 15_000, 10)

  const elapsedMs = performance.now() - startedAt
  const computeDiagnostics = mirror.getComputeDiagnostics()
  const protocolDiagnostics = mirror.getWorkerProtocolDiagnostics()
  const roundtrip = channel.getRoundtripStats()
  const payload = channel.getPayloadStats()

  mirror.dispose()
  host.dispose()

  return {
    strategy,
    elapsedMs,
    settled,
    computeDiagnostics,
    protocolDiagnostics,
    transport: {
      commandCount: channel.stats.commandCount,
      updateSentCount: channel.stats.updateSentCount,
      updateDeliveredCount: channel.stats.updateDeliveredCount,
      updateDroppedCount: channel.stats.updateDroppedCount,
      staleInjectedCount: channel.stats.staleInjectedCount,
      roundtripMs: roundtrip,
      payloadBytes: payload,
    },
  }
}

const factories = await loadFactories()
const runs = []
const budgetErrors = []
const varianceSkippedChecks = []

console.log("\nAffino DataGrid Worker Protocol Benchmark")
console.log(
  `seeds=${BENCH_SEEDS.join(",")} rows=${BENCH_ROW_COUNT} viewportSize=${BENCH_VIEWPORT_SIZE} correctnessIterations=${BENCH_CORRECTNESS_ITERATIONS} throughputIterations=${BENCH_THROUGHPUT_ITERATIONS}`,
)

const benchHeapBefore = await sampleHeapUsed()
const benchStartedAt = performance.now()

for (const seed of BENCH_SEEDS) {
  console.log(`\n[worker-protocol] seed ${seed}: correctness...`)
  const correctness = await runCorrectnessScenario(factories, seed)

  console.log(`[worker-protocol] seed ${seed}: throughput(simple)...`)
  const throughputSimple = await runThroughputScenario(factories, seed, "simple")

  console.log(`[worker-protocol] seed ${seed}: throughput(split)...`)
  const throughputSplit = await runThroughputScenario(factories, seed, "split")

  runs.push({
    seed,
    correctness,
    throughput: {
      simple: throughputSimple,
      split: throughputSplit,
    },
  })

  if (correctness.stuckLoading) {
    budgetErrors.push(`seed ${seed}: correctness scenario ended with loading stuck=true`)
  }
  if (correctness.staleAppliedCount > PERF_BUDGET_MAX_STALE_APPLIED) {
    budgetErrors.push(
      `seed ${seed}: staleAppliedCount ${correctness.staleAppliedCount} exceeds PERF_BUDGET_MAX_STALE_APPLIED=${PERF_BUDGET_MAX_STALE_APPLIED}`,
    )
  }
  if (correctness.loadingTruePct > PERF_BUDGET_MAX_LOADING_TRUE_P95_PCT) {
    budgetErrors.push(
      `seed ${seed}: loading true pct ${correctness.loadingTruePct.toFixed(2)}% exceeds PERF_BUDGET_MAX_LOADING_TRUE_P95_PCT=${PERF_BUDGET_MAX_LOADING_TRUE_P95_PCT}%`,
    )
  }
  if (correctness.loadingCycleMs.p95 > PERF_BUDGET_MAX_LOADING_CYCLE_P95_MS) {
    budgetErrors.push(
      `seed ${seed}: loading cycle p95 ${correctness.loadingCycleMs.p95.toFixed(3)}ms exceeds PERF_BUDGET_MAX_LOADING_CYCLE_P95_MS=${PERF_BUDGET_MAX_LOADING_CYCLE_P95_MS}ms`,
    )
  }
  if (correctness.transport.roundtripMs.p95 > PERF_BUDGET_MAX_ROUNDTRIP_P95_MS) {
    budgetErrors.push(
      `seed ${seed}: correctness roundtrip p95 ${correctness.transport.roundtripMs.p95.toFixed(3)}ms exceeds PERF_BUDGET_MAX_ROUNDTRIP_P95_MS=${PERF_BUDGET_MAX_ROUNDTRIP_P95_MS}ms`,
    )
  }

  if (!throughputSimple.settled) {
    budgetErrors.push(`seed ${seed}: throughput(simple) did not settle final viewport`)
  }
  if (!throughputSplit.settled) {
    budgetErrors.push(`seed ${seed}: throughput(split) did not settle final viewport`)
  }
  if (throughputSplit.transport.roundtripMs.p95 > PERF_BUDGET_MAX_ROUNDTRIP_P95_MS) {
    budgetErrors.push(
      `seed ${seed}: throughput(split) roundtrip p95 ${throughputSplit.transport.roundtripMs.p95.toFixed(3)}ms exceeds PERF_BUDGET_MAX_ROUNDTRIP_P95_MS=${PERF_BUDGET_MAX_ROUNDTRIP_P95_MS}ms`,
    )
  }

  if (PERF_BUDGET_MAX_SPLIT_ELAPSED_DRIFT_PCT !== Number.POSITIVE_INFINITY && throughputSimple.elapsedMs > 0) {
    const driftPct = ((throughputSplit.elapsedMs - throughputSimple.elapsedMs) / throughputSimple.elapsedMs) * 100
    if (driftPct > PERF_BUDGET_MAX_SPLIT_ELAPSED_DRIFT_PCT) {
      budgetErrors.push(
        `seed ${seed}: throughput split elapsed drift ${driftPct.toFixed(2)}% exceeds PERF_BUDGET_MAX_SPLIT_ELAPSED_DRIFT_PCT=${PERF_BUDGET_MAX_SPLIT_ELAPSED_DRIFT_PCT}%`,
      )
    }
  }
}

const elapsedMs = performance.now() - benchStartedAt
const benchHeapAfter = await sampleHeapUsed()
const heapDeltaMb = toMb(benchHeapAfter - benchHeapBefore)

if (elapsedMs > PERF_BUDGET_TOTAL_MS) {
  budgetErrors.push(`elapsed ${elapsedMs.toFixed(3)}ms exceeds PERF_BUDGET_TOTAL_MS=${PERF_BUDGET_TOTAL_MS}ms`)
}
if (heapDeltaMb > PERF_BUDGET_HEAP_EPSILON_MB && heapDeltaMb > PERF_BUDGET_MAX_HEAP_DELTA_MB) {
  budgetErrors.push(
    `heap delta ${heapDeltaMb.toFixed(2)}MB exceeds PERF_BUDGET_MAX_HEAP_DELTA_MB=${PERF_BUDGET_MAX_HEAP_DELTA_MB}MB`,
  )
}

const correctnessLoadingPct = stats(runs.map(run => run.correctness.loadingTruePct))
const correctnessLoadingCycleP95 = stats(runs.map(run => run.correctness.loadingCycleMs.p95))
const correctnessRoundtripP95 = stats(runs.map(run => run.correctness.transport.roundtripMs.p95))
const stuckLoadingCount = runs.filter(run => run.correctness.stuckLoading).length
const staleAppliedCount = runs.reduce((sum, run) => sum + run.correctness.staleAppliedCount, 0)

const throughputSimpleElapsed = stats(runs.map(run => run.throughput.simple.elapsedMs))
const throughputSplitElapsed = stats(runs.map(run => run.throughput.split.elapsedMs))
const throughputSimpleDispatch = stats(runs.map(run => run.throughput.simple.computeDiagnostics.dispatchCount))
const throughputSplitDispatch = stats(runs.map(run => run.throughput.split.computeDiagnostics.dispatchCount))
const throughputSimpleRoundtrip = stats(runs.map(run => run.throughput.simple.transport.roundtripMs.p95))
const throughputSplitRoundtrip = stats(runs.map(run => run.throughput.split.transport.roundtripMs.p95))
const throughputSplitDriftPctValues = runs.map(run => {
  const simpleElapsed = run.throughput.simple.elapsedMs
  if (simpleElapsed <= 0) {
    return 0
  }
  return ((run.throughput.split.elapsedMs - simpleElapsed) / simpleElapsed) * 100
})
const throughputSplitDriftPct = stats(throughputSplitDriftPctValues)

for (const aggregate of [
  { name: "correctness loading pct", stat: correctnessLoadingPct },
  { name: "correctness loading-cycle p95", stat: correctnessLoadingCycleP95 },
  { name: "throughput simple elapsed", stat: throughputSimpleElapsed },
  { name: "throughput split elapsed", stat: throughputSplitElapsed },
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

if (stuckLoadingCount > PERF_BUDGET_MAX_STUCK_LOADING) {
  budgetErrors.push(
    `stuck loading count ${stuckLoadingCount} exceeds PERF_BUDGET_MAX_STUCK_LOADING=${PERF_BUDGET_MAX_STUCK_LOADING}`,
  )
}

const summary = {
  benchmark: "datagrid-worker-protocol",
  generatedAt: new Date().toISOString(),
  config: {
    seeds: BENCH_SEEDS,
    rowCount: BENCH_ROW_COUNT,
    viewportSize: BENCH_VIEWPORT_SIZE,
    correctnessIterations: BENCH_CORRECTNESS_ITERATIONS,
    correctnessDelayMaxMs: BENCH_CORRECTNESS_DELAY_MAX_MS,
    correctnessDropUpdatePct: BENCH_CORRECTNESS_DROP_UPDATE_PCT,
    correctnessStaleInjectEvery: BENCH_CORRECTNESS_STALE_INJECT_EVERY,
    throughputIterations: BENCH_THROUGHPUT_ITERATIONS,
    throughputDelayMaxMs: BENCH_THROUGHPUT_DELAY_MAX_MS,
  },
  budgets: {
    totalMs: PERF_BUDGET_TOTAL_MS,
    maxLoadingTrueP95Pct: PERF_BUDGET_MAX_LOADING_TRUE_P95_PCT,
    maxLoadingCycleP95Ms: PERF_BUDGET_MAX_LOADING_CYCLE_P95_MS,
    maxStuckLoading: PERF_BUDGET_MAX_STUCK_LOADING,
    maxStaleApplied: PERF_BUDGET_MAX_STALE_APPLIED,
    maxRoundtripP95Ms: PERF_BUDGET_MAX_ROUNDTRIP_P95_MS,
    maxSplitElapsedDriftPct: PERF_BUDGET_MAX_SPLIT_ELAPSED_DRIFT_PCT,
    maxVariancePct: PERF_BUDGET_MAX_VARIANCE_PCT,
    maxHeapDeltaMb: PERF_BUDGET_MAX_HEAP_DELTA_MB,
    varianceMinMeanMs: PERF_BUDGET_VARIANCE_MIN_MEAN_MS,
    heapEpsilonMb: PERF_BUDGET_HEAP_EPSILON_MB,
  },
  aggregate: {
    elapsedMs,
    heapDeltaMb,
    correctness: {
      loadingTruePct: correctnessLoadingPct,
      loadingCycleP95Ms: correctnessLoadingCycleP95,
      roundtripP95Ms: correctnessRoundtripP95,
      stuckLoadingCount,
      staleAppliedCount,
    },
    throughput: {
      simple: {
        elapsedMs: throughputSimpleElapsed,
        dispatchCount: throughputSimpleDispatch,
        roundtripP95Ms: throughputSimpleRoundtrip,
      },
      split: {
        elapsedMs: throughputSplitElapsed,
        dispatchCount: throughputSplitDispatch,
        roundtripP95Ms: throughputSplitRoundtrip,
      },
      splitVsSimpleElapsedDriftPct: throughputSplitDriftPct,
    },
  },
  varianceSkippedChecks,
  runs,
  budgetErrors,
  ok: budgetErrors.length === 0,
}

mkdirSync(dirname(BENCH_OUTPUT_JSON), { recursive: true })
writeFileSync(BENCH_OUTPUT_JSON, JSON.stringify(summary, null, 2))

console.log(`\nBenchmark summary written: ${BENCH_OUTPUT_JSON}`)
console.log(
  `correctness loading p95=${correctnessLoadingPct.p95.toFixed(2)}% split dispatch mean=${throughputSplitDispatch.mean.toFixed(1)} simple dispatch mean=${throughputSimpleDispatch.mean.toFixed(1)}`,
)

if (budgetErrors.length > 0) {
  console.error("\nWorker protocol benchmark budget check failed:")
  for (const error of budgetErrors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}
