#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, extname, resolve } from "node:path"

const rootDir = resolve(process.cwd())
const reportPath = resolve(rootDir, "artifacts/quality/datagrid-flat-api-usage-report.json")
const baselinePath = resolve(rootDir, "docs/quality/datagrid-flat-api-baseline.json")
const writeBaseline = process.argv.includes("--write-baseline")

const flatMethods = [
  "getRowModelSnapshot",
  "getRowCount",
  "getRow",
  "getRowsInRange",
  "setViewportRange",
  "getPaginationSnapshot",
  "setPagination",
  "setPageSize",
  "setCurrentPage",
  "setSortModel",
  "setFilterModel",
  "setSortAndFilterModel",
  "setGroupBy",
  "setPivotModel",
  "getPivotModel",
  "getPivotCellDrilldown",
  "exportPivotLayout",
  "exportPivotInterop",
  "importPivotLayout",
  "setAggregationModel",
  "getAggregationModel",
  "getColumnHistogram",
  "setGroupExpansion",
  "toggleGroup",
  "expandGroup",
  "collapseGroup",
  "expandAllGroups",
  "collapseAllGroups",
  "refresh",
  "reapplyView",
  "hasPatchSupport",
  "patchRows",
  "applyEdits",
  "setAutoReapply",
  "getAutoReapply",
  "refreshCellsByRowKeys",
  "refreshCellsByRanges",
  "onCellsRefresh",
  "getColumnModelSnapshot",
  "getColumn",
  "setColumns",
  "setColumnOrder",
  "setColumnVisibility",
  "setColumnWidth",
  "setColumnPin",
  "hasTransactionSupport",
  "getTransactionSnapshot",
  "beginTransactionBatch",
  "commitTransactionBatch",
  "rollbackTransactionBatch",
  "applyTransaction",
  "canUndoTransaction",
  "canRedoTransaction",
  "undoTransaction",
  "redoTransaction",
  "hasSelectionSupport",
  "getSelectionSnapshot",
  "setSelectionSnapshot",
  "clearSelection",
  "summarizeSelection",
]

const scopes = {
  adapters: [
    "packages/datagrid-vue/src",
    "packages/datagrid-laravel/resources/js",
  ],
  demos: [
    "demo-vue/src",
    "demo-laravel/resources/js",
  ],
}

const extensions = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".vue"])
const apiPrefixPattern = "(?:runtime\\.api|options\\.runtime\\.api|grid\\.api|api)"
const methodPattern = flatMethods.join("|")
const usageRegex = new RegExp(`\\b${apiPrefixPattern}\\.(${methodPattern})\\s*\\(`, "g")

function listFilesRecursively(dirPath) {
  const files = []
  if (!existsSync(dirPath)) {
    return files
  }
  const entries = readdirSync(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    const entryPath = resolve(dirPath, entry.name)
    if (entry.isDirectory()) {
      files.push(...listFilesRecursively(entryPath))
      continue
    }
    if (!entry.isFile()) {
      continue
    }
    if (!extensions.has(extname(entry.name))) {
      continue
    }
    files.push(entryPath)
  }
  return files
}

function countScopeUsage(scopeRoots) {
  const byMethod = Object.fromEntries(flatMethods.map(method => [method, 0]))
  const byFile = {}
  let total = 0
  for (const relativeRoot of scopeRoots) {
    const absoluteRoot = resolve(rootDir, relativeRoot)
    const files = listFilesRecursively(absoluteRoot)
    for (const filePath of files) {
      const raw = readFileSync(filePath, "utf8")
      let fileCount = 0
      usageRegex.lastIndex = 0
      let match = usageRegex.exec(raw)
      while (match) {
        const method = match[1]
        byMethod[method] += 1
        fileCount += 1
        total += 1
        match = usageRegex.exec(raw)
      }
      if (fileCount > 0) {
        const relativeFilePath = filePath.replace(`${rootDir}/`, "")
        byFile[relativeFilePath] = fileCount
      }
    }
  }
  return {
    total,
    byMethod,
    byFile,
  }
}

function compareToBaseline(current, baseline) {
  const failures = []
  for (const [scope, currentStats] of Object.entries(current.scopes)) {
    const baselineStats = baseline.scopes?.[scope] ?? { total: 0, byMethod: {} }
    if (currentStats.total > (baselineStats.total ?? 0)) {
      failures.push(
        `scope "${scope}" total increased: ${currentStats.total} > ${baselineStats.total ?? 0}`,
      )
    }
    const baselineByMethod = baselineStats.byMethod ?? {}
    for (const method of flatMethods) {
      const currentCount = currentStats.byMethod?.[method] ?? 0
      const baselineCount = baselineByMethod[method] ?? 0
      if (currentCount > baselineCount) {
        failures.push(
          `scope "${scope}" method "${method}" increased: ${currentCount} > ${baselineCount}`,
        )
      }
    }
  }
  return failures
}

const current = {
  generatedAt: new Date().toISOString(),
  baselinePath: baselinePath.replace(`${rootDir}/`, ""),
  scopes: Object.fromEntries(
    Object.entries(scopes).map(([scope, scopeRoots]) => [scope, countScopeUsage(scopeRoots)]),
  ),
}

mkdirSync(dirname(reportPath), { recursive: true })
writeFileSync(reportPath, JSON.stringify(current, null, 2))

if (writeBaseline) {
  mkdirSync(dirname(baselinePath), { recursive: true })
  writeFileSync(baselinePath, JSON.stringify(current, null, 2))
  console.log("Datagrid flat API usage baseline written:")
  console.log(`- baseline: ${baselinePath}`)
  console.log(`- report:   ${reportPath}`)
  process.exit(0)
}

if (!existsSync(baselinePath)) {
  console.error("Datagrid flat API usage baseline is missing.")
  console.error(`Create it with: node ${resolve(rootDir, "scripts/check-datagrid-flat-api-usage.mjs")} --write-baseline`)
  process.exit(1)
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"))
const failures = compareToBaseline(current, baseline)

console.log("\nDatagrid Flat API Usage Gate")
console.log(`baseline: ${baselinePath}`)
console.log(`report:   ${reportPath}`)
for (const [scope, scopeStats] of Object.entries(current.scopes)) {
  console.log(`- ${scope}: ${scopeStats.total}`)
}

if (failures.length > 0) {
  console.error("\nFlat API usage regression detected:")
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log("Result: OK (no flat API usage increase vs baseline)")
