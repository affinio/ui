#!/usr/bin/env node

import { performance } from "node:perf_hooks"
import { JSDOM } from "jsdom"

const ROOTS_PER_KIND = Number.parseInt(process.env.ROOTS_PER_KIND ?? "120", 10)
const CONTROLLER_ITERATIONS = Number.parseInt(process.env.CONTROLLER_ITERATIONS ?? "2000", 10)
const RELAYOUT_ITERATIONS = Number.parseInt(process.env.RELAYOUT_ITERATIONS ?? "1600", 10)
const BENCH_SEED = Number.parseInt(process.env.BENCH_SEED ?? "1337", 10)
const PERF_BUDGET_TOTAL_MS = Number.parseFloat(process.env.PERF_BUDGET_TOTAL_MS ?? "Infinity")
const PERF_BUDGET_MAX_BOOTSTRAP_MS = Number.parseFloat(process.env.PERF_BUDGET_MAX_BOOTSTRAP_MS ?? "Infinity")
const PERF_BUDGET_MAX_CONTROLLER_MS = Number.parseFloat(process.env.PERF_BUDGET_MAX_CONTROLLER_MS ?? "Infinity")
const PERF_BUDGET_MAX_RELAYOUT_MS = Number.parseFloat(process.env.PERF_BUDGET_MAX_RELAYOUT_MS ?? "Infinity")

const PACKAGES = [
  { name: "dialog-vue", rootAttr: "data-affino-dialog-root", kind: "surface" },
  { name: "menu-vue", rootAttr: "data-affino-menu-root", kind: "surface" },
  { name: "popover-vue", rootAttr: "data-affino-popover-root", kind: "surface" },
  { name: "tooltip-vue", rootAttr: "data-affino-tooltip-root", kind: "surface" },
  { name: "selection-vue", rootAttr: "data-affino-selection-root", kind: "selection" },
  { name: "grid-selection-vue", rootAttr: "data-affino-grid-selection-root", kind: "selection" },
]

assertPositive(ROOTS_PER_KIND, "ROOTS_PER_KIND")
assertPositive(CONTROLLER_ITERATIONS, "CONTROLLER_ITERATIONS")
assertPositive(RELAYOUT_ITERATIONS, "RELAYOUT_ITERATIONS")
assertPositive(BENCH_SEED, "BENCH_SEED")

const dom = new JSDOM("<!doctype html><html><body></body></html>")
const { document } = dom.window

let rngState = BENCH_SEED % 2147483647
if (rngState <= 0) {
  rngState += 2147483646
}

function nextRandom() {
  rngState = (rngState * 16807) % 2147483647
  return (rngState - 1) / 2147483646
}

function assertPositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be > 0`)
  }
}

function createRoots() {
  for (const pkg of PACKAGES) {
    const host = document.createElement("section")
    host.setAttribute("data-vue-bench-host", pkg.name)
    for (let index = 0; index < ROOTS_PER_KIND; index += 1) {
      const root = document.createElement("div")
      root.setAttribute(pkg.rootAttr, `${pkg.name}-${index}`)
      const trigger = document.createElement("button")
      trigger.textContent = `trigger-${index}`
      const content = document.createElement("div")
      content.textContent = `content-${index}`
      root.appendChild(trigger)
      root.appendChild(content)
      host.appendChild(root)
    }
    document.body.appendChild(host)
  }
}

function runBootstrapProxy(pkg) {
  const host = document.querySelector(`[data-vue-bench-host=\"${pkg.name}\"]`)
  if (!host) {
    return 0
  }
  const start = performance.now()
  const nodes = host.querySelectorAll(`[${pkg.rootAttr}]`)
  for (const node of nodes) {
    if (!node.isConnected) {
      throw new Error("Disconnected root during bootstrap proxy")
    }
  }
  return performance.now() - start
}

function runControllerChurnProxy(pkg) {
  const start = performance.now()
  const subscriptions = []
  for (let index = 0; index < CONTROLLER_ITERATIONS; index += 1) {
    let state = {
      open: false,
      highlighted: null,
      seq: index,
    }
    const listeners = []
    const subscribe = (listener) => {
      listeners.push(listener)
      return () => {
        const listenerIndex = listeners.indexOf(listener)
        if (listenerIndex >= 0) {
          listeners.splice(listenerIndex, 1)
        }
      }
    }
    const unsubscribe = subscribe((next) => {
      state = next
    })

    if (pkg.kind === "surface") {
      state = { ...state, open: index % 2 === 0 }
    } else {
      state = { ...state, highlighted: index % 5 === 0 ? `item-${index}` : null }
    }

    for (const listener of listeners) {
      listener(state)
    }

    subscriptions.push(unsubscribe)
  }

  for (const unsubscribe of subscriptions) {
    unsubscribe()
  }

  return performance.now() - start
}

function computeFloatingPosition(anchorRect, surfaceRect, viewport) {
  const gutter = 8
  const left = Math.max(8, Math.min(anchorRect.x, viewport.width - surfaceRect.width - 8))
  const top = Math.max(8, Math.min(anchorRect.y + anchorRect.height + gutter, viewport.height - surfaceRect.height - 8))
  return { left, top }
}

function runRelayoutProxy(pkg) {
  if (pkg.kind !== "surface") {
    return 0
  }
  const start = performance.now()
  const viewport = { width: 1440, height: 900 }
  let checksum = 0

  for (let index = 0; index < RELAYOUT_ITERATIONS; index += 1) {
    const anchorRect = {
      x: Math.round(nextRandom() * 1200),
      y: Math.round(nextRandom() * 700),
      width: 40 + Math.round(nextRandom() * 120),
      height: 24 + Math.round(nextRandom() * 40),
    }
    const surfaceRect = {
      width: 120 + Math.round(nextRandom() * 260),
      height: 80 + Math.round(nextRandom() * 220),
    }
    const pos = computeFloatingPosition(anchorRect, surfaceRect, viewport)
    checksum += pos.left + pos.top
  }

  if (!Number.isFinite(checksum)) {
    throw new Error(`Invalid relayout checksum for ${pkg.name}`)
  }

  return performance.now() - start
}

createRoots()

const t0 = performance.now()
const rows = PACKAGES.map((pkg) => {
  const bootstrapMs = runBootstrapProxy(pkg)
  const controllerChurnMs = runControllerChurnProxy(pkg)
  const relayoutMs = runRelayoutProxy(pkg)
  return {
    package: pkg.name,
    roots: ROOTS_PER_KIND,
    bootstrapMs: bootstrapMs.toFixed(2),
    bootstrapMsValue: bootstrapMs,
    controllerChurnMs: controllerChurnMs.toFixed(2),
    controllerChurnMsValue: controllerChurnMs,
    relayoutMs: relayoutMs.toFixed(2),
    relayoutMsValue: relayoutMs,
  }
})
const totalElapsed = performance.now() - t0

console.log("\nAffino Vue Adapters Benchmark (synthetic)")
console.log(
  `roots/kind=${ROOTS_PER_KIND} controllerIterations=${CONTROLLER_ITERATIONS} relayoutIterations=${RELAYOUT_ITERATIONS} seed=${BENCH_SEED}`,
)
console.table(
  rows.map((row) => ({
    package: row.package,
    roots: row.roots,
    bootstrapMs: row.bootstrapMs,
    controllerChurnMs: row.controllerChurnMs,
    relayoutMs: row.relayoutMs,
  })),
)
console.log(`Total elapsed: ${totalElapsed.toFixed(2)}ms\n`)
console.log("Note: Synthetic proxy benchmark for Vue adapter hot paths.")

const budgetErrors = []
if (totalElapsed > PERF_BUDGET_TOTAL_MS) {
  budgetErrors.push(
    `Total elapsed ${totalElapsed.toFixed(2)}ms exceeds budget ${PERF_BUDGET_TOTAL_MS.toFixed(2)}ms`,
  )
}

for (const row of rows) {
  if (row.bootstrapMsValue > PERF_BUDGET_MAX_BOOTSTRAP_MS) {
    budgetErrors.push(
      `${row.package}: bootstrap ${row.bootstrapMsValue.toFixed(2)}ms exceeds budget ${PERF_BUDGET_MAX_BOOTSTRAP_MS.toFixed(2)}ms`,
    )
  }
  if (row.controllerChurnMsValue > PERF_BUDGET_MAX_CONTROLLER_MS) {
    budgetErrors.push(
      `${row.package}: controller churn ${row.controllerChurnMsValue.toFixed(2)}ms exceeds budget ${PERF_BUDGET_MAX_CONTROLLER_MS.toFixed(2)}ms`,
    )
  }
  if (row.relayoutMsValue > PERF_BUDGET_MAX_RELAYOUT_MS) {
    budgetErrors.push(
      `${row.package}: relayout ${row.relayoutMsValue.toFixed(2)}ms exceeds budget ${PERF_BUDGET_MAX_RELAYOUT_MS.toFixed(2)}ms`,
    )
  }
}

if (budgetErrors.length > 0) {
  console.error("Performance budget failures:")
  for (const error of budgetErrors) {
    console.error(`- ${error}`)
  }
  process.exitCode = 1
}
