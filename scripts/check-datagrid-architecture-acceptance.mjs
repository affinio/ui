#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

const reportPath = resolve(
  process.env.DATAGRID_ARCH_ACCEPTANCE_REPORT ?? "artifacts/quality/datagrid-architecture-acceptance-report.json",
)
const targetScore = Number.parseFloat(process.env.DATAGRID_ARCH_ACCEPTANCE_TARGET_SCORE ?? "9.5")

const checks = []

function registerFileCheck(id, file, description) {
  const absolutePath = resolve(file)
  const ok = existsSync(absolutePath)
  checks.push({
    id,
    description,
    type: "file",
    file,
    ok,
    message: ok ? "present" : "missing",
  })
}

function registerOptionalFileCheck(id, file, description) {
  const absolutePath = resolve(file)
  const ok = existsSync(absolutePath)
  checks.push({
    id,
    description,
    type: "file",
    file,
    ok: true,
    message: ok ? "present" : "optional-missing",
  })
}

function registerTokenCheck(id, file, tokens, description) {
  const absolutePath = resolve(file)
  if (!existsSync(absolutePath)) {
    checks.push({
      id,
      description,
      type: "token",
      file,
      tokens,
      ok: false,
      message: "file-missing",
    })
    return
  }

  const source = readFileSync(absolutePath, "utf8")
  const missing = tokens.filter((token) => !source.includes(token))
  checks.push({
    id,
    description,
    type: "token",
    file,
    tokens,
    ok: missing.length === 0,
    message: missing.length === 0 ? "all-tokens-present" : `missing: ${missing.join(", ")}`,
  })
}

function registerForbiddenTokenCheck(id, file, forbidden, description) {
  const absolutePath = resolve(file)
  if (!existsSync(absolutePath)) {
    checks.push({
      id,
      description,
      type: "forbidden-token",
      file,
      forbidden,
      ok: false,
      message: "file-missing",
    })
    return
  }

  const source = readFileSync(absolutePath, "utf8")
  const found = forbidden.filter((token) => source.includes(token))
  checks.push({
    id,
    description,
    type: "forbidden-token",
    file,
    forbidden,
    ok: found.length === 0,
    message: found.length === 0 ? "none-found" : `found-forbidden: ${found.join(", ")}`,
  })
}

// 1) Required core artifacts.
registerFileCheck("row-model-contract", "packages/datagrid-core/src/models/rowModel.ts", "Canonical row model contract")
registerFileCheck(
  "client-row-model",
  "packages/datagrid-core/src/models/clientRowModel.ts",
  "Client row model implementation",
)
registerFileCheck(
  "server-row-model",
  "packages/datagrid-core/src/models/serverBackedRowModel.ts",
  "Server-backed row model adapter",
)
registerFileCheck(
  "column-model-contract",
  "packages/datagrid-core/src/models/columnModel.ts",
  "Canonical column model contract",
)
registerFileCheck("grid-core-service-registry", "packages/datagrid-core/src/core/gridCore.ts", "GridCore service registry")
registerFileCheck("grid-api-facade", "packages/datagrid-core/src/core/gridApi.ts", "Unified Grid API facade")
registerFileCheck(
  "typed-runtime-events",
  "packages/datagrid-core/src/runtime/dataGridRuntime.ts",
  "Typed runtime event bus implementation",
)
registerFileCheck(
  "versioned-public-protocol",
  "packages/datagrid-core/src/protocol/versionedPublicProtocol.ts",
  "Versioned public protocol metadata",
)
registerFileCheck(
  "headless-a11y-machine",
  "packages/datagrid-core/src/a11y/headlessA11yStateMachine.ts",
  "Headless accessibility state machine",
)
registerFileCheck(
  "advanced-entrypoint",
  "packages/datagrid-core/src/advanced.ts",
  "Advanced public entrypoint",
)
registerFileCheck(
  "internal-entrypoint",
  "packages/datagrid-core/src/internal.ts",
  "Internal public entrypoint",
)

// 2) Viewport decomposition artifacts.
registerFileCheck(
  "viewport-controller",
  "packages/datagrid-core/src/viewport/dataGridViewportController.ts",
  "Viewport orchestration controller",
)
registerFileCheck(
  "viewport-model-bridge-service",
  "packages/datagrid-core/src/viewport/dataGridViewportModelBridgeService.ts",
  "Viewport model bridge service",
)
registerFileCheck(
  "viewport-render-sync-service",
  "packages/datagrid-core/src/viewport/dataGridViewportRenderSyncService.ts",
  "Viewport render sync service",
)

// 3) Public API and typed runtime contracts.
registerTokenCheck(
  "public-api-model-core-exports",
  "packages/datagrid-core/src/public.ts",
  [
    "createDataGridCore",
    "createDataGridApi",
    "createClientRowModel",
    "createServerBackedRowModel",
    "createDataGridColumnModel",
    "getDataGridVersionedPublicProtocol",
    "DATAGRID_PUBLIC_PROTOCOL_VERSION",
    "DATAGRID_ADVANCED_ENTRYPOINTS",
    "DATAGRID_INTERNAL_ENTRYPOINTS",
  ],
  "Stable public API exports tier-1 core/model contracts",
)
registerTokenCheck(
  "typed-event-map-exports",
  "packages/datagrid-core/src/advanced.ts",
  ["DataGridHostEventMap", "DataGridRuntimePluginEventMap", "DataGridRuntimeInternalEventMap"],
  "Advanced API exports typed runtime event maps",
)
registerTokenCheck(
  "advanced-surface-exports",
  "packages/datagrid-core/src/advanced.ts",
  ["createDataGridViewportController", "createDataGridA11yStateMachine", "createDataGridTransactionService"],
  "Advanced API exports power-user services",
)
registerTokenCheck(
  "internal-surface-exports",
  "packages/datagrid-core/src/internal.ts",
  ["normalizeRowNode", "normalizeViewportRange", "withResolvedRowIdentity"],
  "Internal API exports unsafe low-level helpers",
)
registerForbiddenTokenCheck(
  "stable-surface-no-advanced-leaks",
  "packages/datagrid-core/src/public.ts",
  [
    "createDataGridViewportController",
    "createDataGridA11yStateMachine",
    "createDataGridTransactionService",
    "createDataGridAdapterRuntime",
    "normalizeRowNode",
    "normalizeViewportRange",
    "withResolvedRowIdentity",
  ],
  "Stable root entrypoint does not leak advanced/internal APIs",
)
registerTokenCheck(
  "package-exports-tiered-entrypoints",
  "packages/datagrid-core/package.json",
  ["\"./advanced\"", "\"./internal\""],
  "Package exports include advanced/internal entrypoints",
)
registerForbiddenTokenCheck(
  "legacy-viewport-paths-removed",
  "packages/datagrid-core/src/viewport/dataGridViewportController.ts",
  ["serverIntegration", "setProcessedRows(", "setColumns("],
  "Legacy viewport APIs were removed from new architecture path",
)

// 4) Contract tests that lock API/lifecycle behavior.
registerFileCheck(
  "contract-test-grid-core-lifecycle",
  "packages/datagrid-core/src/core/__tests__/gridCore.lifecycle.contract.spec.ts",
  "Lifecycle contract tests",
)
registerFileCheck(
  "contract-test-grid-api",
  "packages/datagrid-core/src/core/__tests__/gridApi.contract.spec.ts",
  "Grid API contract tests",
)
registerFileCheck(
  "contract-test-runtime-events",
  "packages/datagrid-core/src/runtime/__tests__/dataGridRuntime.events.contract.spec.ts",
  "Typed runtime event contract tests",
)
registerOptionalFileCheck(
  "contract-test-config-decomposition",
  "packages/datagrid-core/src/config/__tests__/tableConfig.decomposition.contract.spec.ts",
  "Config decomposition contract tests",
)
registerFileCheck(
  "contract-test-rowmodel-boundary",
  "packages/datagrid-core/src/viewport/__tests__/rowModelBoundary.contract.spec.ts",
  "Viewport row-model boundary contract tests",
)
registerFileCheck(
  "contract-test-columnmodel-boundary",
  "packages/datagrid-core/src/viewport/__tests__/columnModelBoundary.contract.spec.ts",
  "Viewport column-model boundary contract tests",
)
registerFileCheck(
  "contract-test-model-bridge",
  "packages/datagrid-core/src/viewport/__tests__/modelBridge.contract.spec.ts",
  "Viewport model bridge contract tests",
)
registerFileCheck(
  "contract-test-render-sync",
  "packages/datagrid-core/src/viewport/__tests__/renderSync.contract.spec.ts",
  "Viewport render sync contract tests",
)
registerFileCheck(
  "contract-test-headless-a11y",
  "packages/datagrid-core/src/a11y/__tests__/headlessA11yStateMachine.contract.spec.ts",
  "Headless accessibility state machine contract tests",
)
registerFileCheck(
  "contract-test-versioned-protocol",
  "packages/datagrid-core/src/protocol/__tests__/versionedPublicProtocol.contract.spec.ts",
  "Versioned public protocol contract tests",
)
registerFileCheck(
  "contract-test-protocol-codemod",
  "packages/datagrid-core/src/protocol/__tests__/publicProtocolCodemod.contract.spec.ts",
  "Public protocol codemod contract tests",
)
registerFileCheck(
  "contract-test-entrypoint-tiers",
  "packages/datagrid-core/src/protocol/__tests__/entrypointTiers.contract.spec.ts",
  "Entrypoint tier contract tests",
)
registerFileCheck(
  "contract-test-model-property",
  "packages/datagrid-core/src/models/__tests__/clientRowModel.property.spec.ts",
  "Model property-based contract tests",
)
registerFileCheck(
  "contract-test-model-stress",
  "packages/datagrid-core/src/models/__tests__/clientRowModel.stress.spec.ts",
  "Model stress contract tests",
)
registerFileCheck(
  "contract-test-boundary-property",
  "packages/datagrid-core/src/viewport/__tests__/modelBridge.property.contract.spec.ts",
  "Boundary property-based contract tests",
)
registerOptionalFileCheck(
  "contract-test-adapter-a11y-mapping",
  "packages/datagrid-vue/src/adapters/__tests__/a11yAttributesAdapter.contract.spec.ts",
  "Adapter DOM/ARIA mapping contract tests",
)
registerTokenCheck(
  "strict-contract-gate-script",
  "package.json",
  ["test:datagrid:strict-contracts", "quality:lock:datagrid"],
  "Root scripts include strict contract gate",
)
registerTokenCheck(
  "public-protocol-codemod-script",
  "package.json",
  ["codemod:datagrid:public-protocol"],
  "Root scripts include public protocol codemod",
)
registerFileCheck(
  "public-protocol-codemod-script-file",
  "scripts/codemods/datagrid-public-protocol-codemod.mjs",
  "Public protocol migration codemod script",
)

// 5) Architecture checklist docs.
registerFileCheck(
  "doc-model-contracts",
  "docs/datagrid-model-contracts.md",
  "Model contracts architecture doc",
)
registerFileCheck(
  "doc-gridcore-service-registry",
  "docs/datagrid-gridcore-service-registry.md",
  "GridCore service registry architecture doc",
)
registerFileCheck("doc-grid-api", "docs/datagrid-grid-api.md", "Unified Grid API architecture doc")
registerFileCheck(
  "doc-typed-runtime-events",
  "docs/datagrid-typed-runtime-events.md",
  "Typed runtime events architecture doc",
)
registerFileCheck(
  "doc-config-decomposition",
  "docs/datagrid-config-decomposition.md",
  "Config decomposition architecture doc",
)
registerFileCheck(
  "doc-viewport-decomposition",
  "docs/datagrid-viewport-controller-decomposition.md",
  "Viewport decomposition architecture doc",
)
registerFileCheck(
  "doc-acceptance-checklist",
  "docs/datagrid-ag-architecture-acceptance-checklist.md",
  "AG-style architecture acceptance checklist",
)
registerFileCheck(
  "doc-strict-contract-testing",
  "docs/datagrid-strict-contract-testing.md",
  "Strict contract testing matrix doc",
)
registerFileCheck(
  "doc-headless-a11y-contract",
  "docs/datagrid-headless-a11y-contract.md",
  "Headless accessibility contract doc",
)
registerFileCheck(
  "doc-versioned-public-protocol",
  "docs/datagrid-versioned-public-protocol.md",
  "Versioned public protocol doc",
)

const totalChecks = checks.length
const passedChecks = checks.filter((check) => check.ok).length
const failedChecks = checks.filter((check) => !check.ok)
const score = Number(((passedChecks / totalChecks) * 10).toFixed(2))
const ok = failedChecks.length === 0 && score >= targetScore

const report = {
  generatedAt: new Date().toISOString(),
  targetScore,
  score,
  ok,
  totals: {
    checks: totalChecks,
    passed: passedChecks,
    failed: failedChecks.length,
  },
  failedChecks,
  checks,
}

mkdirSync(dirname(reportPath), { recursive: true })
writeFileSync(reportPath, JSON.stringify(report, null, 2))

console.log("\nDataGrid Architecture Acceptance")
console.log(`report: ${reportPath}`)
console.log(`score: ${score.toFixed(2)} / 10`)
console.log(`target: ${targetScore.toFixed(2)}`)
console.log(`checks: ${passedChecks}/${totalChecks}`)

if (failedChecks.length > 0) {
  console.error("\nFailed checks:")
  for (const check of failedChecks) {
    console.error(`- [${check.id}] ${check.description} (${check.message})`)
  }
}

if (!ok) {
  process.exit(1)
}
