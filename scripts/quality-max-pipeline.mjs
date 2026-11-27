#!/usr/bin/env node
import { spawnSync } from "node:child_process"

const steps = [
  { label: "workspace-script-references", command: "pnpm", args: ["run", "quality:workspace:references"] },
  { label: "workspace-internal-dependencies", command: "pnpm", args: ["run", "quality:deps:workspace-internal"] },
  { label: "package-metadata", command: "pnpm", args: ["run", "quality:metadata:packages"] },
  { label: "lint", command: "pnpm", args: ["run", "lint"] },
  { label: "type-check", command: "pnpm", args: ["run", "type-check"] },
  { label: "build", command: "pnpm", args: ["run", "build"] },
  { label: "unit", command: "pnpm", args: ["run", "test:unit"] },
  { label: "public-esm-artifacts", command: "pnpm", args: ["run", "quality:components:esm"] },
  { label: "visual-browser", command: "pnpm", args: ["run", "test:matrix:visual"] },
  { label: "interaction-browser", command: "pnpm", args: ["run", "test:matrix:interaction"] },
  { label: "benchmark-evidence", command: "pnpm", args: ["run", "bench:components:ci"] },
]

const results = []
let failed = false

for (const step of steps) {
  const start = Date.now()
  const proc = spawnSync(step.command, step.args, { stdio: "inherit" })
  const duration = Date.now() - start
  const ok = proc.status === 0
  results.push({ label: step.label, ok, duration })
  if (!ok) failed = true
}

const summary = results
  .map((result) => `${result.ok ? "✅" : "❌"} ${result.label} (${result.duration}ms)`)
  .join("\n")

// eslint-disable-next-line no-console
console.log(`\nQuality Max Pipeline Summary\n${summary}\n`)

if (failed) {
  process.exit(1)
}
