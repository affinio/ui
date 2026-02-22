import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workspaceRoot = path.resolve(__dirname, "..")

const REPORT_PATH = path.join(
  workspaceRoot,
  "artifacts",
  "quality",
  "datagrid-facade-coverage-report.json",
)

const checkMode = process.argv.includes("--check")

const FACADES = [
  {
    id: "vue-public",
    label: "@affino/datagrid-vue",
    sourceFile: path.join(workspaceRoot, "packages", "datagrid-vue", "src", "public.ts"),
    importSpecifiers: ["@affino/datagrid-vue"],
    requiredSymbols: [
      "useDataGridRuntime",
      "useAffinoDataGrid",
      "useAffinoDataGridMinimal",
      "useAffinoDataGridUi",
      "createDataGridVueRuntime",
      "DataGrid",
      "AffinoDataGridSimple",
      "createClientRowModel",
      "createDataGridColumnModel",
      "createDataGridSelectionSummary",
      "createInMemoryDataGridSettingsAdapter",
      "evaluateDataGridAdvancedFilterExpression",
    ],
  },
  {
    id: "vue-advanced",
    label: "@affino/datagrid-vue/advanced",
    sourceFile: path.join(workspaceRoot, "packages", "datagrid-vue", "src", "advanced.ts"),
    importSpecifiers: ["@affino/datagrid-vue/advanced"],
    requiredSymbols: [
      "useDataGridManagedWheelScroll",
      "useDataGridColumnLayoutOrchestration",
      "resolveDataGridHeaderLayerViewportGeometry",
      "resolveDataGridHeaderScrollSyncLeft",
      "createDataGridViewportController",
    ],
  },
  {
    id: "vue-components",
    label: "@affino/datagrid-vue/components",
    sourceFile: path.join(workspaceRoot, "packages", "datagrid-vue", "src", "components", "index.ts"),
    importSpecifiers: ["@affino/datagrid-vue/components"],
    requiredSymbols: ["DataGrid", "AffinoDataGridSimple"],
  },
  {
    id: "laravel-facade",
    label: "@affino/datagrid-laravel",
    sourceFile: path.join(workspaceRoot, "packages", "datagrid-laravel", "resources", "js", "index.ts"),
    importSpecifiers: ["@affino/datagrid-laravel"],
    requiredSymbols: [
      "createDataGridRuntime",
      "buildDataGridColumnLayers",
      "resolveDataGridLayerTrackTemplate",
      "useDataGridColumnLayoutOrchestration",
      "useDataGridManagedWheelScroll",
      "resolveDataGridHeaderLayerViewportGeometry",
      "resolveDataGridHeaderScrollSyncLeft",
      "evaluateDataGridAdvancedFilterExpression",
    ],
  },
]

const DEMO_SCOPES = [
  {
    id: "demo-vue",
    root: path.join(workspaceRoot, "demo-vue", "src"),
  },
  {
    id: "demo-laravel",
    root: path.join(workspaceRoot, "demo-laravel", "resources", "js"),
  },
]

const FORBIDDEN_IMPORT_SPECIFIERS = [
  "@affino/datagrid-core",
  "@affino/datagrid-core/advanced",
  "@affino/datagrid-orchestration",
]

function uniqueSorted(values) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b))
}

async function walkFiles(rootDir) {
  const results = []
  const entries = await readdir(rootDir, { withFileTypes: true })
  for (const entry of entries) {
    const abs = path.join(rootDir, entry.name)
    if (entry.isDirectory()) {
      results.push(...await walkFiles(abs))
      continue
    }
    if (!/\.(vue|ts|js|mts|cts)$/.test(entry.name)) {
      continue
    }
    results.push(abs)
  }
  return results
}

function parseNamedSpecifiers(listText) {
  return listText
    .split(",")
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => part.replace(/^type\s+/, "").trim())
    .map(part => {
      const aliasMatch = part.match(/^(.+?)\s+as\s+(.+)$/)
      return aliasMatch ? aliasMatch[2].trim() : part
    })
    .filter(Boolean)
}

function collectExportsFromSource(text) {
  const names = []
  const exportBlockRegex = /export\s+(?:type\s+)?\{([\s\S]*?)\}\s+from\s+["'][^"']+["']/g
  for (const match of text.matchAll(exportBlockRegex)) {
    names.push(...parseNamedSpecifiers(match[1]))
  }
  return uniqueSorted(names)
}

function collectImportsBySpecifier(text) {
  const imports = []
  const importRegex = /import\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/g
  for (const match of text.matchAll(importRegex)) {
    imports.push({
      clause: match[1],
      specifier: match[2],
    })
  }
  return imports
}

function collectNamedImportsForSpecifier(text, specifier) {
  const names = []
  for (const entry of collectImportsBySpecifier(text)) {
    if (entry.specifier !== specifier) {
      continue
    }
    const namedMatch = entry.clause.match(/\{([\s\S]*?)\}/)
    if (!namedMatch) {
      continue
    }
    names.push(...parseNamedSpecifiers(namedMatch[1]))
  }
  return uniqueSorted(names)
}

function collectForbiddenImports(text) {
  const hits = []
  for (const entry of collectImportsBySpecifier(text)) {
    if (FORBIDDEN_IMPORT_SPECIFIERS.includes(entry.specifier)) {
      hits.push(entry.specifier)
    }
  }
  return uniqueSorted(hits)
}

async function buildDemoImportIndex() {
  const index = new Map()
  const forbidden = []
  for (const scope of DEMO_SCOPES) {
    const files = await walkFiles(scope.root)
    for (const file of files) {
      const text = await readFile(file, "utf8")
      const fileRel = path.relative(workspaceRoot, file)

      for (const facade of FACADES) {
        for (const specifier of facade.importSpecifiers) {
          const names = collectNamedImportsForSpecifier(text, specifier)
          if (!names.length) {
            continue
          }
          const key = `${facade.id}:${specifier}`
          const current = index.get(key) ?? []
          for (const name of names) {
            current.push({ name, file: fileRel })
          }
          index.set(key, current)
        }
      }

      const forbiddenHits = collectForbiddenImports(text)
      if (forbiddenHits.length > 0) {
        forbidden.push({
          file: fileRel,
          specifiers: forbiddenHits,
        })
      }
    }
  }
  return { index, forbidden }
}

async function buildFacadeSection(facade, demoImportIndex) {
  const sourceText = await readFile(facade.sourceFile, "utf8")
  const exportedSymbols = collectExportsFromSource(sourceText)

  const usageRows = []
  for (const specifier of facade.importSpecifiers) {
    const key = `${facade.id}:${specifier}`
    for (const item of demoImportIndex.get(key) ?? []) {
      usageRows.push(item)
    }
  }

  const usedSymbols = uniqueSorted(usageRows.map(item => item.name))
  const unusedSymbols = exportedSymbols.filter(name => !usedSymbols.includes(name))
  const missingRequired = facade.requiredSymbols.filter(name => !exportedSymbols.includes(name))
  const requiredUnused = facade.requiredSymbols.filter(
    name => exportedSymbols.includes(name) && !usedSymbols.includes(name),
  )

  const usageBySymbol = Object.fromEntries(
    usedSymbols.map(symbol => [
      symbol,
      uniqueSorted(
        usageRows
          .filter(item => item.name === symbol)
          .map(item => item.file),
      ),
    ]),
  )

  return {
    id: facade.id,
    label: facade.label,
    sourceFile: path.relative(workspaceRoot, facade.sourceFile),
    exportedCount: exportedSymbols.length,
    usedCount: usedSymbols.length,
    requiredCount: facade.requiredSymbols.length,
    exportedSymbols,
    usedSymbols,
    unusedSymbols,
    requiredSymbols: facade.requiredSymbols,
    requiredUnused,
    missingRequired,
    usageBySymbol,
  }
}

function printSummary(report) {
  console.log("DataGrid Facade Coverage")
  console.log(`report: ${REPORT_PATH}`)
  console.log("")

  for (const facade of report.facades) {
    console.log(`${facade.label}`)
    console.log(`- exported: ${facade.exportedCount}`)
    console.log(`- used in demos: ${facade.usedCount}`)
    console.log(`- required: ${facade.requiredCount}`)
    console.log(`- missing required: ${facade.missingRequired.length}`)
    if (facade.missingRequired.length > 0) {
      console.log(`  missing -> ${facade.missingRequired.join(", ")}`)
    }
    console.log(`- required but unused: ${facade.requiredUnused.length}`)
    if (facade.requiredUnused.length > 0) {
      console.log(`  unused-required -> ${facade.requiredUnused.join(", ")}`)
    }
    console.log(`- unused exports: ${facade.unusedSymbols.length}`)
    console.log("")
  }

  console.log(`Forbidden demo imports: ${report.forbiddenDemoImports.length}`)
  for (const hit of report.forbiddenDemoImports) {
    console.log(`- ${hit.file}: ${hit.specifiers.join(", ")}`)
  }
  console.log("")
}

async function main() {
  const demoIndex = await buildDemoImportIndex()
  const facades = []
  for (const facade of FACADES) {
    facades.push(await buildFacadeSection(facade, demoIndex.index))
  }

  const failedFacades = facades
    .filter(facade => facade.missingRequired.length > 0)
    .map(facade => ({
      id: facade.id,
      label: facade.label,
      missingRequired: facade.missingRequired,
    }))

  const report = {
    generatedAt: new Date().toISOString(),
    workspaceRoot,
    facades,
    forbiddenDemoImports: demoIndex.forbidden,
    checks: {
      passed: failedFacades.length === 0 && demoIndex.forbidden.length === 0,
      failedFacades,
      forbiddenDemoImportCount: demoIndex.forbidden.length,
    },
  }

  await mkdir(path.dirname(REPORT_PATH), { recursive: true })
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8")

  printSummary(report)

  if (!checkMode) {
    return
  }

  const errors = []
  for (const facade of failedFacades) {
    errors.push(`[${facade.id}] missing required exports: ${facade.missingRequired.join(", ")}`)
  }
  for (const hit of demoIndex.forbidden) {
    errors.push(`[forbidden-demo-import] ${hit.file}: ${hit.specifiers.join(", ")}`)
  }

  if (errors.length > 0) {
    console.error("Facade coverage check failed:")
    for (const error of errors) {
      console.error(`- ${error}`)
    }
    process.exitCode = 1
  }
}

await main()
