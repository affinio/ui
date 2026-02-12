#!/usr/bin/env node

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { extname, join, resolve } from "node:path"

const ADVANCED_SYMBOLS = new Set([
  "createDataGridViewportController",
  "createDataGridA11yStateMachine",
  "createDataGridAdapterRuntime",
  "createDataGridTransactionService",
  "createDataGridRuntime",
  "createDataSourceBackedRowModel",
  "resolveDataGridAdapterEventName",
  "DataGridRuntime",
  "DataGridRuntimeOptions",
  "DataGridHostEventName",
  "DataGridHostEventArgs",
  "DataGridHostEventMap",
  "DataGridEventArgs",
  "DataGridRuntimeBasePluginEventMap",
  "DataGridRuntimePluginEventMap",
  "DataGridRuntimeInternalEventMap",
  "DataGridRuntimeInternalEventName",
  "DataGridAdapterKind",
  "DataGridKebabHostEventName",
  "DataGridAdapterEventNameByKind",
  "DataGridAdapterRuntimePluginContext",
  "DataGridAdapterDispatchPayload",
  "CreateDataGridAdapterRuntimeOptions",
  "DataGridAdapterRuntime",
  "DataGridTransactionCommand",
  "DataGridTransactionInput",
  "DataGridTransactionSnapshot",
  "DataGridTransactionPendingBatchSnapshot",
  "DataGridTransactionExecutionContext",
  "DataGridTransactionDirection",
  "DataGridTransactionExecutor",
  "DataGridTransactionService",
  "DataGridTransactionServiceHooks",
  "DataGridTransactionAppliedEvent",
  "DataGridTransactionRolledBackEvent",
  "DataGridTransactionHistoryEvent",
  "DataGridTransactionListener",
  "CreateDataGridTransactionServiceOptions",
  "CreateDataGridA11yStateMachineOptions",
  "DataGridA11yCellAriaState",
  "DataGridA11yFocusCell",
  "DataGridA11yGridAriaState",
  "DataGridA11yKeyboardCommand",
  "DataGridA11yKeyCommandKey",
  "DataGridA11ySnapshot",
  "DataGridA11yStateListener",
  "DataGridA11yStateMachine",
  "DataGridViewportController",
  "DataGridViewportControllerOptions",
  "DataGridViewportImperativeCallbacks",
  "DataGridViewportRuntimeOverrides",
  "DataGridViewportMetricsSnapshot",
  "DataGridViewportIntegrationSnapshot",
  "DataGridViewportSyncTargets",
  "DataGridViewportSyncState",
  "DataGridViewportState",
  "DataGridRowPoolItem",
  "DataGridImperativeColumnUpdatePayload",
  "DataGridImperativeRowUpdatePayload",
  "DataGridImperativeScrollSyncPayload",
  "CreateDataSourceBackedRowModelOptions",
  "DataSourceBackedRowModel",
  "DataGridDataSource",
  "DataGridDataSourceBackpressureDiagnostics",
  "DataGridDataSourceInvalidation",
  "DataGridDataSourcePullPriority",
  "DataGridDataSourcePullReason",
  "DataGridDataSourcePullRequest",
  "DataGridDataSourcePullResult",
  "DataGridDataSourceTreePullContext",
  "DataGridDataSourceTreePullOperation",
  "DataGridDataSourceTreePullScope",
  "DataGridDataSourcePushEvent",
  "DataGridDataSourcePushInvalidateEvent",
  "DataGridDataSourcePushListener",
  "DataGridDataSourcePushRemoveEvent",
  "DataGridDataSourcePushUpsertEvent",
  "DataGridDataSourceRowEntry",
])

function applyReplace(code, pattern, replacement, tag, appliedTransforms) {
  const next = code.replace(pattern, replacement)
  if (next !== code) {
    appliedTransforms.push(tag)
  }
  return next
}

function normalizeSpecifiers(raw) {
  return raw
    .split(",")
    .map(part => part.trim())
    .filter(Boolean)
}

function extractImportedName(specifier) {
  const withoutType = specifier.replace(/^type\s+/, "").trim()
  const parts = withoutType.split(/\s+as\s+/)
  const imported = (parts[0] ?? "").trim()
  return imported.length > 0 ? imported : null
}

function buildImportLine(specifiers, source) {
  if (specifiers.length === 0) {
    return null
  }
  return `import { ${specifiers.join(", ")} } from "${source}"`
}

function rewriteRootImportsToTieredEntrypoints(source, appliedTransforms) {
  return source.replace(
    /import\s*{([^}]+)}\s*from\s*["']@affino\/datagrid-core["'];?/g,
    (statement, rawSpecifiers) => {
      const specifiers = normalizeSpecifiers(rawSpecifiers)
      const stableSpecifiers = []
      const advancedSpecifiers = []

      for (const specifier of specifiers) {
        const importedName = extractImportedName(specifier)
        if (importedName && ADVANCED_SYMBOLS.has(importedName)) {
          advancedSpecifiers.push(specifier)
        } else {
          stableSpecifiers.push(specifier)
        }
      }

      if (advancedSpecifiers.length === 0) {
        return statement
      }

      appliedTransforms.push("root-import-tier-split")
      const lines = [
        buildImportLine(stableSpecifiers, "@affino/datagrid-core"),
        buildImportLine(advancedSpecifiers, "@affino/datagrid-core/advanced"),
      ].filter(Boolean)

      return lines.join("\n")
    },
  )
}

function transform(source) {
  const appliedTransforms = []
  let code = source

  code = applyReplace(
    code,
    /from\s+["']@affino\/datagrid-core\/src\/public["']/g,
    'from "@affino/datagrid-core"',
    "core-root-entrypoint",
    appliedTransforms,
  )
  code = applyReplace(
    code,
    /from\s+["']@affino\/datagrid-vue\/src\/public["']/g,
    'from "@affino/datagrid-vue"',
    "vue-root-entrypoint",
    appliedTransforms,
  )
  code = applyReplace(
    code,
    /from\s+["']@affino\/datagrid-core\/viewport\/tableViewportController["']/g,
    'from "@affino/datagrid-core/advanced"',
    "viewport-deep-import",
    appliedTransforms,
  )
  code = applyReplace(
    code,
    /\bcreateTableViewportController\b/g,
    "createDataGridViewportController",
    "viewport-factory-rename",
    appliedTransforms,
  )
  code = applyReplace(
    code,
    /\bserverIntegration\s*:/g,
    "/* TODO(datagrid-codemod): migrate to rowModel boundary */ serverIntegration:",
    "server-integration-todo",
    appliedTransforms,
  )
  code = rewriteRootImportsToTieredEntrypoints(code, appliedTransforms)

  return {
    code,
    changed: appliedTransforms.length > 0,
    appliedTransforms,
  }
}

function collectFiles(targetPath, files) {
  const stats = statSync(targetPath)
  if (stats.isDirectory()) {
    for (const entry of readdirSync(targetPath)) {
      collectFiles(join(targetPath, entry), files)
    }
    return
  }
  const extension = extname(targetPath)
  if ([".ts", ".tsx", ".js", ".jsx", ".vue", ".mjs", ".cjs"].includes(extension)) {
    files.push(targetPath)
  }
}

function parseArgs(argv) {
  const args = {
    write: false,
    targets: [],
  }
  for (const token of argv) {
    if (token === "--write") {
      args.write = true
      continue
    }
    args.targets.push(token)
  }
  return args
}

const args = parseArgs(process.argv.slice(2))

if (args.targets.length === 0) {
  console.error("Usage: node scripts/codemods/datagrid-public-protocol-codemod.mjs [--write] <file-or-directory> [...]")
  process.exit(1)
}

const files = []
for (const target of args.targets) {
  collectFiles(resolve(target), files)
}

let changedFiles = 0
for (const file of files) {
  const source = readFileSync(file, "utf8")
  const result = transform(source)
  if (!result.changed) {
    continue
  }

  changedFiles += 1
  if (args.write) {
    writeFileSync(file, result.code)
    console.log(`[write] ${file} :: ${result.appliedTransforms.join(", ")}`)
  } else {
    console.log(`[dry-run] ${file} :: ${result.appliedTransforms.join(", ")}`)
  }
}

console.log(`datagrid-public-protocol-codemod: ${changedFiles} file(s) changed`)
