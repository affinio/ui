#!/usr/bin/env node

import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { performance } from "node:perf_hooks"

const ROOT = resolve(new URL("..", import.meta.url).pathname)
const DIST_ENTRY = resolve(ROOT, "packages/dialog-core/dist/index.js")
const OUTPUT_JSON = resolve(ROOT, process.env.BENCH_OUTPUT_JSON || "artifacts/performance/bench-dialog-core.json")

if (!existsSync(DIST_ENTRY)) {
  throw new Error("packages/dialog-core/dist/index.js is missing; build the package first")
}

const { DialogController } = await import(DIST_ENTRY)
const SAMPLE_COUNT = Number.parseInt(process.env.BENCH_DIALOG_SAMPLE_COUNT || "5", 10)
const ITERATIONS = Number.parseInt(process.env.BENCH_DIALOG_ITERATIONS || "100", 10)
const counts = [1, 10, 100]
const report = {
  generatedAt: new Date().toISOString(),
  sampleCount: SAMPLE_COUNT,
  iterations: ITERATIONS,
  results: counts.map((count) => runControllerBurst(count)),
  pendingCloseBurst: await runPendingCloseBurst(),
}

mkdirSync(dirname(OUTPUT_JSON), { recursive: true })
writeFileSync(OUTPUT_JSON, JSON.stringify(report, null, 2) + "\n")
console.log(JSON.stringify(report, null, 2))

function runControllerBurst(count) {
  const samples = []
  for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
    const controllers = Array.from({ length: count }, (_, index) => new DialogController({ id: "bench-" + count + "-" + sample + "-" + index }))
    const startedAt = performance.now()
    for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
      for (const controller of controllers) {
        controller.open()
        void controller.close()
      }
    }
    for (const controller of controllers) controller.destroy()
    samples.push(performance.now() - startedAt)
  }
  return { controllers: count, ...stats(samples) }
}

async function runPendingCloseBurst() {
  const gate = deferred()
  const controller = new DialogController({ defaultOpen: true })
  controller.setCloseGuard(() => gate.promise)
  const requests = Array.from({ length: 1000 }, () => controller.requestClose("programmatic"))
  const startedAt = performance.now()
  gate.resolve({ outcome: "allow" })
  await Promise.all(requests)
  controller.destroy()
  return { requests: requests.length, elapsedMs: performance.now() - startedAt }
}

function deferred() {
  let resolve
  const promise = new Promise((next) => { resolve = next })
  return { promise, resolve }
}

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return {
    p50: sorted[Math.floor(sorted.length * 0.5)] || 0,
    p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
    max: sorted[sorted.length - 1] || 0,
  }
}
