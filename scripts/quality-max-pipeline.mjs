#!/usr/bin/env node
import { spawnSync } from "node:child_process"

const steps = [
  { label: "lint", command: "pnpm", args: ["run", "lint"] },
  { label: "type-check", command: "pnpm", args: ["run", "type-check"] },
  { label: "unit-tests", command: "pnpm", args: ["run", "test:unit"] },
  { label: "vue-matrix", command: "pnpm", args: ["run", "test:vue-matrix"] },
]

const shouldSkipE2E = process.env.QUALITY_MAX_SKIP_E2E === "true"
const shouldSkipBench = process.env.QUALITY_MAX_SKIP_BENCH === "true"

if (!shouldSkipE2E) {
  steps.push({ label: "e2e", command: "pnpm", args: ["run", "test:e2e"] })
}

if (!shouldSkipBench) {
  steps.push({ label: "bench-vue", command: "pnpm", args: ["run", "bench:vue-adapters:assert"] })
  steps.push({ label: "bench-laravel", command: "pnpm", args: ["run", "bench:laravel-morph:assert"] })
}

const results = []
let failed = false

for (const step of steps) {
  const start = Date.now()
  const proc = spawnSync(step.command, step.args, { stdio: "inherit" })
  const duration = Date.now() - start
  const ok = proc.status === 0
  results.push({ label: step.label, ok, duration })
  if (!ok) {
    failed = true
    break
  }
}

const summary = results
  .map((result) => `${result.ok ? "✅" : "❌"} ${result.label} (${result.duration}ms)`)
  .join("\n")

// eslint-disable-next-line no-console
console.log(`\nQuality Max Pipeline Summary\n${summary}\n`)

if (failed) {
  process.exit(1)
}
