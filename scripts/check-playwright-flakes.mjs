#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

const reportPath = resolve(process.env.PLAYWRIGHT_JSON_OUTPUT ?? "playwright-report/results.json")
const maxFlakes = Number.parseInt(process.env.PLAYWRIGHT_MAX_FLAKES ?? "0", 10)
const summaryPath = process.env.PLAYWRIGHT_FLAKE_SUMMARY
  ? resolve(process.env.PLAYWRIGHT_FLAKE_SUMMARY)
  : null

if (!Number.isFinite(maxFlakes) || maxFlakes < 0) {
  throw new Error("PLAYWRIGHT_MAX_FLAKES must be a non-negative integer")
}

if (!existsSync(reportPath)) {
  throw new Error(`Playwright JSON report not found: ${reportPath}`)
}

const report = JSON.parse(readFileSync(reportPath, "utf8"))

let totalTests = 0
let flakyTests = 0
let passedTests = 0
let failedTests = 0
const flakyTitles = []

function walkSuite(suite) {
  if (!suite || typeof suite !== "object") return
  const specs = Array.isArray(suite.specs) ? suite.specs : []
  const childSuites = Array.isArray(suite.suites) ? suite.suites : []

  for (const spec of specs) {
    const tests = Array.isArray(spec.tests) ? spec.tests : []
    for (const test of tests) {
      totalTests += 1
      const outcome = test.outcome ?? "unknown"
      const title = [spec.file, ...(Array.isArray(test.titlePath) ? test.titlePath : [test.title].filter(Boolean))]
        .join(" :: ")
        .replace(/\s+/g, " ")
        .trim()

      if (outcome === "flaky") {
        flakyTests += 1
        flakyTitles.push(title)
      } else if (outcome === "expected") {
        passedTests += 1
      } else {
        failedTests += 1
      }
    }
  }

  for (const child of childSuites) {
    walkSuite(child)
  }
}

const suites = Array.isArray(report.suites) ? report.suites : []
for (const suite of suites) {
  walkSuite(suite)
}

const summary = {
  reportPath,
  totalTests,
  passedTests,
  failedTests,
  flakyTests,
  maxFlakes,
  flakyTitles,
}

if (summaryPath) {
  mkdirSync(dirname(summaryPath), { recursive: true })
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2))
}

console.log("\nPlaywright Flake Summary")
console.log(`report: ${reportPath}`)
console.log(`total: ${totalTests}`)
console.log(`passed: ${passedTests}`)
console.log(`failed: ${failedTests}`)
console.log(`flaky: ${flakyTests}`)
console.log(`max allowed flaky: ${maxFlakes}`)

if (flakyTitles.length) {
  console.log("\nFlaky tests:")
  for (const title of flakyTitles) {
    console.log(`- ${title}`)
  }
}

if (flakyTests > maxFlakes) {
  process.exit(1)
}
