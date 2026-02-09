#!/usr/bin/env node

import { performance } from "node:perf_hooks"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

const BENCH_SEED = Number.parseInt(process.env.BENCH_SEED ?? "1337", 10)
const BENCH_SEEDS = (process.env.BENCH_SEEDS ?? `${BENCH_SEED}`)
  .split(",")
  .map((value) => Number.parseInt(value.trim(), 10))
  .filter((value) => Number.isFinite(value) && value > 0)
const BENCH_WARMUP_RUNS = Number.parseInt(process.env.BENCH_WARMUP_RUNS ?? "1", 10)
const BENCH_INTERACTION_MEASUREMENT_BATCH_SIZE = Number.parseInt(
  process.env.BENCH_INTERACTION_MEASUREMENT_BATCH_SIZE ?? "5",
  10,
)
const BENCH_INTERACTION_WARMUP_BATCHES = Number.parseInt(
  process.env.BENCH_INTERACTION_WARMUP_BATCHES ?? "1",
  10,
)

const INTERACTION_ROW_COUNT = Number.parseInt(process.env.BENCH_INTERACTION_ROW_COUNT ?? "6400", 10)
const INTERACTION_COLUMN_COUNT = Number.parseInt(process.env.BENCH_INTERACTION_COLUMN_COUNT ?? "72", 10)
const INTERACTION_ROW_HEIGHT = Number.parseInt(process.env.BENCH_INTERACTION_ROW_HEIGHT ?? "38", 10)
const INTERACTION_SELECTION_ITERATIONS = Number.parseInt(process.env.BENCH_SELECTION_ITERATIONS ?? "900", 10)
const INTERACTION_FILL_ITERATIONS = Number.parseInt(process.env.BENCH_FILL_ITERATIONS ?? "320", 10)
const INTERACTION_DRAG_STEPS = Number.parseInt(process.env.BENCH_SELECTION_DRAG_STEPS ?? "12", 10)
const INTERACTION_VIEWPORT_ROWS = Number.parseInt(process.env.BENCH_INTERACTION_VIEWPORT_ROWS ?? "28", 10)
const INTERACTION_VIEWPORT_WIDTH = Number.parseInt(process.env.BENCH_INTERACTION_VIEWPORT_WIDTH ?? "1240", 10)
const INTERACTION_PINNED_LEFT_COLUMNS = Number.parseInt(process.env.BENCH_INTERACTION_PINNED_LEFT_COLUMNS ?? "2", 10)
const INTERACTION_PINNED_RIGHT_COLUMNS = Number.parseInt(process.env.BENCH_INTERACTION_PINNED_RIGHT_COLUMNS ?? "1", 10)

const PERF_BUDGET_TOTAL_MS = Number.parseFloat(process.env.PERF_BUDGET_TOTAL_MS ?? "Infinity")
const PERF_BUDGET_MAX_SELECTION_DRAG_P95_MS = Number.parseFloat(
  process.env.PERF_BUDGET_MAX_SELECTION_DRAG_P95_MS ?? "Infinity",
)
const PERF_BUDGET_MAX_SELECTION_DRAG_P99_MS = Number.parseFloat(
  process.env.PERF_BUDGET_MAX_SELECTION_DRAG_P99_MS ?? "Infinity",
)
const PERF_BUDGET_MAX_FILL_APPLY_P95_MS = Number.parseFloat(
  process.env.PERF_BUDGET_MAX_FILL_APPLY_P95_MS ?? "Infinity",
)
const PERF_BUDGET_MAX_FILL_APPLY_P99_MS = Number.parseFloat(
  process.env.PERF_BUDGET_MAX_FILL_APPLY_P99_MS ?? "Infinity",
)
const PERF_BUDGET_MAX_VARIANCE_PCT = Number.parseFloat(process.env.PERF_BUDGET_MAX_VARIANCE_PCT ?? "Infinity")
const PERF_BUDGET_VARIANCE_MIN_MEAN_MS = Number.parseFloat(process.env.PERF_BUDGET_VARIANCE_MIN_MEAN_MS ?? "0.5")
const PERF_BUDGET_MAX_HEAP_DELTA_MB = Number.parseFloat(process.env.PERF_BUDGET_MAX_HEAP_DELTA_MB ?? "Infinity")
const PERF_BUDGET_HEAP_EPSILON_MB = Number.parseFloat(process.env.PERF_BUDGET_HEAP_EPSILON_MB ?? "1")

const BENCH_OUTPUT_JSON = process.env.BENCH_OUTPUT_JSON ? resolve(process.env.BENCH_OUTPUT_JSON) : null

assertPositiveInteger(INTERACTION_ROW_COUNT, "BENCH_INTERACTION_ROW_COUNT")
assertPositiveInteger(INTERACTION_COLUMN_COUNT, "BENCH_INTERACTION_COLUMN_COUNT")
assertPositiveInteger(INTERACTION_ROW_HEIGHT, "BENCH_INTERACTION_ROW_HEIGHT")
assertPositiveInteger(INTERACTION_SELECTION_ITERATIONS, "BENCH_SELECTION_ITERATIONS")
assertPositiveInteger(INTERACTION_FILL_ITERATIONS, "BENCH_FILL_ITERATIONS")
assertPositiveInteger(INTERACTION_DRAG_STEPS, "BENCH_SELECTION_DRAG_STEPS")
assertPositiveInteger(INTERACTION_VIEWPORT_ROWS, "BENCH_INTERACTION_VIEWPORT_ROWS")
assertPositiveInteger(INTERACTION_VIEWPORT_WIDTH, "BENCH_INTERACTION_VIEWPORT_WIDTH")
assertPositiveInteger(BENCH_INTERACTION_MEASUREMENT_BATCH_SIZE, "BENCH_INTERACTION_MEASUREMENT_BATCH_SIZE")
assertNonNegativeInteger(BENCH_INTERACTION_WARMUP_BATCHES, "BENCH_INTERACTION_WARMUP_BATCHES")
assertNonNegativeInteger(BENCH_WARMUP_RUNS, "BENCH_WARMUP_RUNS")
if (!BENCH_SEEDS.length) {
  throw new Error("BENCH_SEEDS must include at least one positive integer")
}
if (!Number.isFinite(PERF_BUDGET_VARIANCE_MIN_MEAN_MS) || PERF_BUDGET_VARIANCE_MIN_MEAN_MS < 0) {
  throw new Error("PERF_BUDGET_VARIANCE_MIN_MEAN_MS must be a non-negative finite number")
}
if (!Number.isFinite(PERF_BUDGET_HEAP_EPSILON_MB) || PERF_BUDGET_HEAP_EPSILON_MB < 0) {
  throw new Error("PERF_BUDGET_HEAP_EPSILON_MB must be a non-negative finite number")
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

function buildColumnOffsets(count, rng) {
  const widths = new Array(count)
  const offsets = new Array(count + 1)
  offsets[0] = 0
  for (let index = 0; index < count; index += 1) {
    const width = 88 + randomInt(rng, 0, 140)
    widths[index] = width
    offsets[index + 1] = offsets[index] + width
  }
  return { widths, offsets, totalWidth: offsets[count] }
}

function resolveColumnRangeForScroll(offsets, scrollLeft, viewportWidth, pinnedLeft, pinnedRight) {
  const columnCount = offsets.length - 1
  if (columnCount <= 0) {
    return { start: 0, end: -1 }
  }
  const startOffset = Math.max(0, scrollLeft)
  const endOffset = startOffset + Math.max(1, viewportWidth)
  let start = pinnedLeft
  let end = Math.max(pinnedLeft - 1, columnCount - pinnedRight - 1)

  for (let index = pinnedLeft; index < columnCount - pinnedRight; index += 1) {
    const left = offsets[index]
    const right = offsets[index + 1]
    if (right > startOffset) {
      start = index
      break
    }
  }
  for (let index = start; index < columnCount - pinnedRight; index += 1) {
    const left = offsets[index]
    if (left >= endOffset) {
      end = Math.max(start, index - 1)
      break
    }
    end = index
  }

  return { start, end }
}

function clampRange(start, end, max) {
  const normalizedStart = Math.max(0, Math.min(max, start))
  const normalizedEnd = Math.max(0, Math.min(max, end))
  return normalizedStart <= normalizedEnd
    ? { start: normalizedStart, end: normalizedEnd }
    : { start: normalizedEnd, end: normalizedStart }
}

function overlapRange(left, right) {
  if (left.end < right.start || right.end < left.start) {
    return null
  }
  return {
    start: Math.max(left.start, right.start),
    end: Math.min(left.end, right.end),
  }
}

function runSelectionDragScenario(seed) {
  const rng = createRng(seed)
  const durations = []
  const { offsets, totalWidth } = buildColumnOffsets(INTERACTION_COLUMN_COUNT, rng)
  const maxRowStart = Math.max(0, INTERACTION_ROW_COUNT - INTERACTION_VIEWPORT_ROWS)
  const rowViewportRange = { start: 0, end: Math.max(0, INTERACTION_VIEWPORT_ROWS - 1) }
  const maxHorizontalScroll = Math.max(0, totalWidth - INTERACTION_VIEWPORT_WIDTH)
  let scrollLeft = 0
  let rollingChecksum = 0

  const runOne = () => {
    const rowDrift = randomInt(rng, -12, 12)
    const nextRowStart = Math.max(0, Math.min(maxRowStart, rowViewportRange.start + rowDrift))
    rowViewportRange.start = nextRowStart
    rowViewportRange.end = Math.min(INTERACTION_ROW_COUNT - 1, nextRowStart + INTERACTION_VIEWPORT_ROWS - 1)

    const scrollDrift = randomInt(rng, -180, 180)
    scrollLeft = Math.max(0, Math.min(maxHorizontalScroll, scrollLeft + scrollDrift))
    const viewportColumnRange = resolveColumnRangeForScroll(
      offsets,
      scrollLeft,
      INTERACTION_VIEWPORT_WIDTH,
      INTERACTION_PINNED_LEFT_COLUMNS,
      INTERACTION_PINNED_RIGHT_COLUMNS,
    )

    const anchor = {
      row: randomInt(rng, rowViewportRange.start, rowViewportRange.end),
      col: randomInt(rng, 0, INTERACTION_COLUMN_COUNT - 1),
    }

    for (let step = 0; step < INTERACTION_DRAG_STEPS; step += 1) {
      const focus = {
        row: Math.max(0, Math.min(INTERACTION_ROW_COUNT - 1, anchor.row + randomInt(rng, -48, 48))),
        col: Math.max(0, Math.min(INTERACTION_COLUMN_COUNT - 1, anchor.col + randomInt(rng, -12, 12))),
      }
      const rowRange = clampRange(anchor.row, focus.row, INTERACTION_ROW_COUNT - 1)
      const colRange = clampRange(anchor.col, focus.col, INTERACTION_COLUMN_COUNT - 1)

      const visibleRows = overlapRange(rowRange, rowViewportRange)
      const visibleCols = overlapRange(colRange, viewportColumnRange)
      if (!visibleRows || !visibleCols) {
        continue
      }

      const top = (visibleRows.start - rowViewportRange.start) * INTERACTION_ROW_HEIGHT
      const height = (visibleRows.end - visibleRows.start + 1) * INTERACTION_ROW_HEIGHT
      const left = offsets[visibleCols.start] - scrollLeft
      const width = offsets[visibleCols.end + 1] - offsets[visibleCols.start]

      rollingChecksum += top + height + left + width + visibleRows.start + visibleCols.end
    }
  }

  for (let warmup = 0; warmup < BENCH_INTERACTION_WARMUP_BATCHES; warmup += 1) {
    for (let batch = 0; batch < BENCH_INTERACTION_MEASUREMENT_BATCH_SIZE; batch += 1) {
      runOne()
    }
  }

  for (let iteration = 0; iteration < INTERACTION_SELECTION_ITERATIONS; iteration += 1) {
    const startedAt = performance.now()
    for (let batch = 0; batch < BENCH_INTERACTION_MEASUREMENT_BATCH_SIZE; batch += 1) {
      runOne()
    }
    const elapsed = performance.now() - startedAt
    durations.push(elapsed / BENCH_INTERACTION_MEASUREMENT_BATCH_SIZE)
  }

  if (!Number.isFinite(rollingChecksum)) {
    throw new Error("Selection drag scenario produced invalid checksum")
  }

  return stats(durations)
}

function runFillApplyScenario(seed) {
  const rng = createRng(seed)
  const durations = []
  const matrix = new Int32Array(INTERACTION_ROW_COUNT * INTERACTION_COLUMN_COUNT)
  for (let index = 0; index < matrix.length; index += 1) {
    matrix[index] = (index * 17 + seed) % 100000
  }

  let checksum = 0
  const toOffset = (row, col) => row * INTERACTION_COLUMN_COUNT + col

  const runOne = () => {
    const baseHeight = randomInt(rng, 1, 4)
    const baseWidth = randomInt(rng, 1, 3)
    const baseRowStart = randomInt(rng, 0, Math.max(0, INTERACTION_ROW_COUNT - baseHeight - 2))
    const baseColStart = randomInt(rng, 0, Math.max(0, INTERACTION_COLUMN_COUNT - baseWidth - 2))

    const targetRowStart = Math.min(
      INTERACTION_ROW_COUNT - 1,
      baseRowStart + randomInt(rng, 1, Math.max(2, INTERACTION_VIEWPORT_ROWS - 2)),
    )
    const targetColStart = baseColStart
    const targetHeight = randomInt(rng, 2, 12)
    const targetWidth = randomInt(rng, 1, Math.max(2, Math.min(4, INTERACTION_COLUMN_COUNT - targetColStart)))
    const targetRowEnd = Math.min(INTERACTION_ROW_COUNT - 1, targetRowStart + targetHeight - 1)
    const targetColEnd = Math.min(INTERACTION_COLUMN_COUNT - 1, targetColStart + targetWidth - 1)

    for (let row = targetRowStart; row <= targetRowEnd; row += 1) {
      const sourceRow = baseRowStart + ((row - targetRowStart) % baseHeight)
      for (let col = targetColStart; col <= targetColEnd; col += 1) {
        const sourceCol = baseColStart + ((col - targetColStart) % baseWidth)
        const sourceValue = matrix[toOffset(sourceRow, sourceCol)]
        matrix[toOffset(row, col)] = sourceValue
        checksum += sourceValue + row + col
      }
    }
  }

  for (let warmup = 0; warmup < BENCH_INTERACTION_WARMUP_BATCHES; warmup += 1) {
    for (let batch = 0; batch < BENCH_INTERACTION_MEASUREMENT_BATCH_SIZE; batch += 1) {
      runOne()
    }
  }

  for (let iteration = 0; iteration < INTERACTION_FILL_ITERATIONS; iteration += 1) {
    const startedAt = performance.now()
    for (let batch = 0; batch < BENCH_INTERACTION_MEASUREMENT_BATCH_SIZE; batch += 1) {
      runOne()
    }
    const elapsed = performance.now() - startedAt
    durations.push(elapsed / BENCH_INTERACTION_MEASUREMENT_BATCH_SIZE)
  }

  if (!Number.isFinite(checksum)) {
    throw new Error("Fill apply scenario produced invalid checksum")
  }

  return stats(durations)
}

const budgetErrors = []
const varianceSkippedChecks = []
const runResults = []

console.log("\nAffino DataGrid Interaction Benchmark (synthetic)")
console.log(
  `seeds=${BENCH_SEEDS.join(",")} rows=${INTERACTION_ROW_COUNT} columns=${INTERACTION_COLUMN_COUNT} selectionIterations=${INTERACTION_SELECTION_ITERATIONS} fillIterations=${INTERACTION_FILL_ITERATIONS} warmupRuns=${BENCH_WARMUP_RUNS} batchSize=${BENCH_INTERACTION_MEASUREMENT_BATCH_SIZE}`,
)

for (const seed of BENCH_SEEDS) {
  for (let warmup = 0; warmup < BENCH_WARMUP_RUNS; warmup += 1) {
    const warmupSeed = seed + (warmup + 1) * 9973
    runSelectionDragScenario(warmupSeed)
    runFillApplyScenario(warmupSeed)
  }

  const heapStart = process.memoryUsage().heapUsed
  const startedAt = performance.now()
  const selectionDrag = runSelectionDragScenario(seed)
  const fillApply = runFillApplyScenario(seed)
  const elapsedMs = performance.now() - startedAt
  const heapEnd = process.memoryUsage().heapUsed
  const heapDeltaMb = (heapEnd - heapStart) / (1024 * 1024)

  runResults.push({
    seed,
    elapsedMs,
    heapDeltaMb,
    scenarios: {
      selectionDrag,
      fillApply,
    },
  })

  console.log(`\nSeed ${seed}`)
  console.table([
    {
      scenario: "selection-drag-proxy",
      p50Ms: selectionDrag.p50.toFixed(3),
      p95Ms: selectionDrag.p95.toFixed(3),
      p99Ms: selectionDrag.p99.toFixed(3),
      cvPct: selectionDrag.cvPct.toFixed(2),
      maxMs: selectionDrag.max.toFixed(3),
    },
    {
      scenario: "fill-apply-proxy",
      p50Ms: fillApply.p50.toFixed(3),
      p95Ms: fillApply.p95.toFixed(3),
      p99Ms: fillApply.p99.toFixed(3),
      cvPct: fillApply.cvPct.toFixed(2),
      maxMs: fillApply.max.toFixed(3),
    },
  ])
  console.log(`Total elapsed: ${elapsedMs.toFixed(2)}ms`)
  console.log(`Heap delta: ${heapDeltaMb.toFixed(2)}MB`)

  if (elapsedMs > PERF_BUDGET_TOTAL_MS) {
    budgetErrors.push(
      `seed ${seed}: total elapsed ${elapsedMs.toFixed(2)}ms exceeds PERF_BUDGET_TOTAL_MS=${PERF_BUDGET_TOTAL_MS}ms`,
    )
  }
  if (heapDeltaMb > PERF_BUDGET_MAX_HEAP_DELTA_MB + PERF_BUDGET_HEAP_EPSILON_MB) {
    budgetErrors.push(
      `seed ${seed}: heap delta ${heapDeltaMb.toFixed(2)}MB exceeds PERF_BUDGET_MAX_HEAP_DELTA_MB=${PERF_BUDGET_MAX_HEAP_DELTA_MB}MB (epsilon ${PERF_BUDGET_HEAP_EPSILON_MB.toFixed(2)}MB)`,
    )
  }
  if (selectionDrag.p95 > PERF_BUDGET_MAX_SELECTION_DRAG_P95_MS) {
    budgetErrors.push(
      `seed ${seed}: selection-drag p95 ${selectionDrag.p95.toFixed(3)}ms exceeds PERF_BUDGET_MAX_SELECTION_DRAG_P95_MS=${PERF_BUDGET_MAX_SELECTION_DRAG_P95_MS}ms`,
    )
  }
  if (selectionDrag.p99 > PERF_BUDGET_MAX_SELECTION_DRAG_P99_MS) {
    budgetErrors.push(
      `seed ${seed}: selection-drag p99 ${selectionDrag.p99.toFixed(3)}ms exceeds PERF_BUDGET_MAX_SELECTION_DRAG_P99_MS=${PERF_BUDGET_MAX_SELECTION_DRAG_P99_MS}ms`,
    )
  }
  if (fillApply.p95 > PERF_BUDGET_MAX_FILL_APPLY_P95_MS) {
    budgetErrors.push(
      `seed ${seed}: fill-apply p95 ${fillApply.p95.toFixed(3)}ms exceeds PERF_BUDGET_MAX_FILL_APPLY_P95_MS=${PERF_BUDGET_MAX_FILL_APPLY_P95_MS}ms`,
    )
  }
  if (fillApply.p99 > PERF_BUDGET_MAX_FILL_APPLY_P99_MS) {
    budgetErrors.push(
      `seed ${seed}: fill-apply p99 ${fillApply.p99.toFixed(3)}ms exceeds PERF_BUDGET_MAX_FILL_APPLY_P99_MS=${PERF_BUDGET_MAX_FILL_APPLY_P99_MS}ms`,
    )
  }
}

const aggregateElapsed = stats(runResults.map((run) => run.elapsedMs))
const aggregateHeap = stats(runResults.map((run) => run.heapDeltaMb))
const aggregateSelectionP95 = stats(runResults.map((run) => run.scenarios.selectionDrag.p95))
const aggregateSelectionP99 = stats(runResults.map((run) => run.scenarios.selectionDrag.p99))
const aggregateFillP95 = stats(runResults.map((run) => run.scenarios.fillApply.p95))
const aggregateFillP99 = stats(runResults.map((run) => run.scenarios.fillApply.p99))

if (shouldEnforceVariance(aggregateElapsed)) {
  if (aggregateElapsed.cvPct > PERF_BUDGET_MAX_VARIANCE_PCT) {
    budgetErrors.push(
      `elapsed CV ${aggregateElapsed.cvPct.toFixed(2)}% exceeds PERF_BUDGET_MAX_VARIANCE_PCT=${PERF_BUDGET_MAX_VARIANCE_PCT}%`,
    )
  }
} else if (PERF_BUDGET_MAX_VARIANCE_PCT !== Number.POSITIVE_INFINITY) {
  varianceSkippedChecks.push(
    `elapsed CV gate skipped (mean ${aggregateElapsed.mean.toFixed(3)}ms < PERF_BUDGET_VARIANCE_MIN_MEAN_MS=${PERF_BUDGET_VARIANCE_MIN_MEAN_MS}ms)`,
  )
}

for (const aggregate of [
  { name: "selection-drag p95", stat: aggregateSelectionP95 },
  { name: "selection-drag p99", stat: aggregateSelectionP99 },
  { name: "fill-apply p95", stat: aggregateFillP95 },
  { name: "fill-apply p99", stat: aggregateFillP99 },
]) {
  if (PERF_BUDGET_MAX_VARIANCE_PCT === Number.POSITIVE_INFINITY) {
    continue
  }
  if (aggregate.stat.mean < PERF_BUDGET_VARIANCE_MIN_MEAN_MS) {
    varianceSkippedChecks.push(
      `${aggregate.name} CV gate skipped (mean ${aggregate.stat.mean.toFixed(3)}ms < PERF_BUDGET_VARIANCE_MIN_MEAN_MS=${PERF_BUDGET_VARIANCE_MIN_MEAN_MS}ms)`,
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
  benchmark: "datagrid-interactions",
  generatedAt: new Date().toISOString(),
  config: {
    seeds: BENCH_SEEDS,
    rows: INTERACTION_ROW_COUNT,
    columns: INTERACTION_COLUMN_COUNT,
    rowHeight: INTERACTION_ROW_HEIGHT,
    viewportRows: INTERACTION_VIEWPORT_ROWS,
    viewportWidth: INTERACTION_VIEWPORT_WIDTH,
    pinnedColumns: {
      left: INTERACTION_PINNED_LEFT_COLUMNS,
      right: INTERACTION_PINNED_RIGHT_COLUMNS,
    },
    selection: {
      iterations: INTERACTION_SELECTION_ITERATIONS,
      dragSteps: INTERACTION_DRAG_STEPS,
    },
    fill: {
      iterations: INTERACTION_FILL_ITERATIONS,
    },
  },
  budgets: {
    totalMs: PERF_BUDGET_TOTAL_MS,
    maxSelectionDragP95Ms: PERF_BUDGET_MAX_SELECTION_DRAG_P95_MS,
    maxSelectionDragP99Ms: PERF_BUDGET_MAX_SELECTION_DRAG_P99_MS,
    maxFillApplyP95Ms: PERF_BUDGET_MAX_FILL_APPLY_P95_MS,
    maxFillApplyP99Ms: PERF_BUDGET_MAX_FILL_APPLY_P99_MS,
    maxVariancePct: PERF_BUDGET_MAX_VARIANCE_PCT,
    varianceMinMeanMs: PERF_BUDGET_VARIANCE_MIN_MEAN_MS,
    maxHeapDeltaMb: PERF_BUDGET_MAX_HEAP_DELTA_MB,
    heapEpsilonMb: PERF_BUDGET_HEAP_EPSILON_MB,
  },
  variancePolicy: {
    warmupRuns: BENCH_WARMUP_RUNS,
    warmupBatchesPerScenario: BENCH_INTERACTION_WARMUP_BATCHES,
    measurementBatchSize: BENCH_INTERACTION_MEASUREMENT_BATCH_SIZE,
    minMeanMsForCvGate: PERF_BUDGET_VARIANCE_MIN_MEAN_MS,
  },
  varianceSkippedChecks,
  aggregate: {
    elapsedMs: aggregateElapsed,
    heapDeltaMb: aggregateHeap,
    selectionDragP95Ms: aggregateSelectionP95,
    selectionDragP99Ms: aggregateSelectionP99,
    fillApplyP95Ms: aggregateFillP95,
    fillApplyP99Ms: aggregateFillP99,
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
  console.error("\nInteraction benchmark budget check failed:")
  for (const error of budgetErrors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}
