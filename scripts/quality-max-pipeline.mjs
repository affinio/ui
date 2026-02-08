#!/usr/bin/env node
import { spawnSync } from "node:child_process"

const steps = [
  { label: "lint", command: "pnpm", args: ["run", "lint"] },
  { label: "type-check", command: "pnpm", args: ["run", "type-check"] },
  { label: "datagrid-core-build", command: "pnpm", args: ["--filter", "@affino/datagrid-core", "build"] },
  { label: "datagrid-architecture", command: "pnpm", args: ["run", "quality:architecture:datagrid"] },
  { label: "datagrid-perf-contracts", command: "pnpm", args: ["run", "quality:perf:datagrid"] },
  { label: "datagrid-strict-contracts", command: "pnpm", args: ["run", "test:datagrid:strict-contracts"] },
  { label: "datagrid-unit", command: "pnpm", args: ["run", "test:matrix:unit"] },
  { label: "datagrid-integration", command: "pnpm", args: ["run", "test:matrix:integration"] },
  { label: "vue-matrix", command: "pnpm", args: ["run", "test:vue-matrix"] },
]

const shouldSkipE2E = process.env.QUALITY_MAX_SKIP_E2E === "true"
const shouldSkipBench = process.env.QUALITY_MAX_SKIP_BENCH === "true"

if (!shouldSkipE2E) {
  steps.push({ label: "e2e", command: "pnpm", args: ["run", "test:matrix:interaction"] })
  steps.push({ label: "visual", command: "pnpm", args: ["run", "test:matrix:visual"] })
}

if (!shouldSkipBench) {
  steps.push({ label: "bench-datagrid-harness", command: "pnpm", args: ["run", "bench:datagrid:harness:ci"] })
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
