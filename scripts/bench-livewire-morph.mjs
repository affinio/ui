#!/usr/bin/env node

import { performance } from "node:perf_hooks"
import { JSDOM } from "jsdom"

const ROOTS_PER_KIND = Number.parseInt(process.env.ROOTS_PER_KIND ?? "150", 10)
const ITERATIONS = Number.parseInt(process.env.ITERATIONS ?? "800", 10)
const STRUCTURE_MUTATION_RATE = Number.parseFloat(process.env.STRUCTURE_MUTATION_RATE ?? "0.15")

const PACKAGES = [
  { name: "dialog", root: "[data-affino-dialog-root]", trigger: "[data-affino-dialog-trigger]", content: "[data-affino-dialog-overlay]" },
  { name: "menu", root: "[data-affino-menu-root]", trigger: "[data-affino-menu-trigger]", content: "[data-affino-menu-panel]" },
  { name: "popover", root: "[data-affino-popover-root]", trigger: "[data-affino-popover-trigger]", content: "[data-affino-popover-content]" },
  { name: "combobox", root: "[data-affino-combobox-root]", trigger: "[data-affino-combobox-input]", content: "[data-affino-combobox-surface]" },
  { name: "listbox", root: "[data-affino-listbox-root]", trigger: "[data-affino-listbox-trigger]", content: "[data-affino-listbox-surface]" },
  { name: "tooltip", root: "[data-affino-tooltip-root]", trigger: "[data-affino-tooltip-trigger]", content: "[data-affino-tooltip-surface]" },
]

function assertFiniteInt(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number`)
  }
}

assertFiniteInt(ROOTS_PER_KIND, "ROOTS_PER_KIND")
assertFiniteInt(ITERATIONS, "ITERATIONS")

if (!Number.isFinite(STRUCTURE_MUTATION_RATE) || STRUCTURE_MUTATION_RATE < 0 || STRUCTURE_MUTATION_RATE > 1) {
  throw new Error("STRUCTURE_MUTATION_RATE must be between 0 and 1")
}

const dom = new JSDOM("<!doctype html><html><body></body></html>")
const { document } = dom.window
const structureRegistry = new WeakMap()

const metrics = new Map(
  PACKAGES.map((pkg) => [
    pkg.name,
    { scans: 0, hydrated: 0, skipped: 0, scanMs: 0, hydrateMs: 0, bootstrapMs: 0, openCloseMs: 0 },
  ]),
)

function createRoot(pkg, index) {
  const root = document.createElement("div")

  const rootAttr = pkg.root.match(/\[data-([^\]]+)\]/)?.[1]
  const triggerAttr = pkg.trigger.match(/\[data-([^\]]+)\]/)?.[1]
  const contentAttr = pkg.content.match(/\[data-([^\]]+)\]/)?.[1]

  if (!rootAttr || !triggerAttr || !contentAttr) {
    throw new Error(`Invalid selector config for ${pkg.name}`)
  }

  root.setAttribute(`data-${rootAttr}`, `${pkg.name}-${index}`)

  const trigger = document.createElement("button")
  trigger.setAttribute(`data-${triggerAttr}`, "")
  trigger.textContent = `trigger-${index}`

  const content = document.createElement("div")
  content.setAttribute(`data-${contentAttr}`, "")
  content.textContent = `content-${index}`

  root.appendChild(trigger)
  root.appendChild(content)

  return root
}

for (const pkg of PACKAGES) {
  const host = document.createElement("section")
  host.setAttribute("data-bench-host", pkg.name)
  for (let i = 0; i < ROOTS_PER_KIND; i += 1) {
    host.appendChild(createRoot(pkg, i))
  }
  document.body.appendChild(host)
}

function hydrateLike(pkg, root) {
  const start = performance.now()
  const nextTrigger = root.querySelector(pkg.trigger)
  const nextContent = root.querySelector(pkg.content)
  if (!nextTrigger || !nextContent) {
    return false
  }
  const previous = structureRegistry.get(root)
  if (previous && previous.trigger === nextTrigger && previous.content === nextContent) {
    return false
  }
  structureRegistry.set(root, { trigger: nextTrigger, content: nextContent })
  const end = performance.now()
  const m = metrics.get(pkg.name)
  m.hydrateMs += end - start
  return true
}

function scanNode(pkg, node) {
  const start = performance.now()
  let hydrated = 0
  let skipped = 0

  if (node instanceof dom.window.Element && node.matches(pkg.root)) {
    if (hydrateLike(pkg, node)) hydrated += 1
    else skipped += 1
  }

  if (node.querySelectorAll) {
    const roots = node.querySelectorAll(pkg.root)
    for (const root of roots) {
      if (hydrateLike(pkg, root)) hydrated += 1
      else skipped += 1
    }
  }

  const end = performance.now()
  const m = metrics.get(pkg.name)
  m.scans += 1
  m.hydrated += hydrated
  m.skipped += skipped
  m.scanMs += end - start
}

function randomInt(max) {
  return Math.floor(Math.random() * max)
}

function runMorphIteration() {
  const pkg = PACKAGES[randomInt(PACKAGES.length)]
  const host = document.querySelector(`[data-bench-host=\"${pkg.name}\"]`)
  if (!host) return

  const roots = host.querySelectorAll(pkg.root)
  if (!roots.length) return

  const target = roots[randomInt(roots.length)]
  if (Math.random() < STRUCTURE_MUTATION_RATE) {
    const oldTrigger = target.querySelector(pkg.trigger)
    if (oldTrigger) {
      const replacement = document.createElement("button")
      const triggerAttr = pkg.trigger.match(/\[data-([^\]]+)\]/)?.[1]
      replacement.setAttribute(`data-${triggerAttr}`, "")
      replacement.textContent = `trigger-replaced-${Math.random().toString(36).slice(2, 7)}`
      oldTrigger.replaceWith(replacement)
    }
  } else {
    const textNode = target.querySelector(pkg.content)
    if (textNode) {
      textNode.textContent = `text-${Math.random().toString(36).slice(2, 9)}`
    }
  }

  scanNode(pkg, target)
}

function runBootstrapProxy(pkg) {
  const host = document.querySelector(`[data-bench-host=\"${pkg.name}\"]`)
  if (!host) return
  const start = performance.now()
  const nodes = host.querySelectorAll(pkg.root)
  for (const node of nodes) {
    hydrateLike(pkg, node)
  }
  const end = performance.now()
  metrics.get(pkg.name).bootstrapMs = end - start
}

function runOpenCloseProxy(pkg) {
  const host = document.querySelector(`[data-bench-host=\"${pkg.name}\"]`)
  if (!host) return
  const contents = host.querySelectorAll(pkg.content)
  const start = performance.now()
  for (const content of contents) {
    content.hidden = false
    content.setAttribute("data-state", "open")
    content.hidden = true
    content.setAttribute("data-state", "closed")
  }
  const end = performance.now()
  metrics.get(pkg.name).openCloseMs = end - start
}

const t0 = performance.now()
for (const pkg of PACKAGES) {
  runBootstrapProxy(pkg)
}
for (let i = 0; i < ITERATIONS; i += 1) {
  runMorphIteration()
}
for (const pkg of PACKAGES) {
  runOpenCloseProxy(pkg)
}
const t1 = performance.now()

const rows = PACKAGES.map((pkg) => {
  const m = metrics.get(pkg.name)
  const total = m.hydrated + m.skipped || 1
  return {
    package: pkg.name,
    scans: m.scans,
    hydrated: m.hydrated,
    skipped: m.skipped,
    hydrateRate: `${((m.hydrated / total) * 100).toFixed(1)}%`,
    scanMs: m.scanMs.toFixed(2),
    hydrateMs: m.hydrateMs.toFixed(2),
    bootstrapMs: m.bootstrapMs.toFixed(2),
    openCloseMs: m.openCloseMs.toFixed(2),
  }
})

console.log("\\nAffino Laravel Livewire Morph Benchmark (synthetic)")
console.log(`roots/kind=${ROOTS_PER_KIND} iterations=${ITERATIONS} structureMutationRate=${STRUCTURE_MUTATION_RATE}`)
console.table(rows)
console.log(`Total elapsed: ${(t1 - t0).toFixed(2)}ms\\n`)
console.log("Note: This is a temporary synthetic benchmark for mutation pressure and rehydrate gating trends.")
