import { mkdir, readFile, writeFile } from "node:fs/promises"
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
  "datagrid-commercial-boundaries-report.json",
)

async function readText(relPath) {
  const absPath = path.join(workspaceRoot, relPath)
  return readFile(absPath, "utf8")
}

async function readJson(relPath) {
  return JSON.parse(await readText(relPath))
}

async function main() {
  const checks = []
  const failures = []

  const recordCheck = (id, ok, details) => {
    checks.push({ id, ok, details })
    if (!ok) {
      failures.push({ id, details })
    }
  }

  const datagridManifest = await readJson("packages/datagrid/package.json")
  const datagridProManifest = await readJson("packages/datagrid-pro/package.json")
  const datagridCoreManifest = await readJson("packages/datagrid-core/package.json")
  const datagridLaravelManifest = await readJson("packages/datagrid-laravel/package.json")
  const datagridVueManifest = await readJson("packages/datagrid-vue/package.json")
  const commercialPlan = await readText("docs/datagrid-commercial-packaging-plan.md")
  const datagridEntry = await readText("packages/datagrid/src/index.ts")
  const datagridCorePublicEntry = await readText("packages/datagrid-core/src/public.ts")
  const datagridCoreAdvancedEntry = await readText("packages/datagrid-core/src/advanced.ts")
  const datagridCoreProEntry = await readText("packages/datagrid-core/src/pro.ts")
  const datagridLaravelEntry = await readText("packages/datagrid-laravel/resources/js/index.ts")
  const datagridLaravelProEntry = await readText("packages/datagrid-laravel/resources/js/pro.ts")
  const datagridVuePublicEntry = await readText("packages/datagrid-vue/src/public.ts")
  const datagridVueProEntry = await readText("packages/datagrid-vue/src/pro.ts")

  recordCheck(
    "pkg-datagrid-name",
    datagridManifest.name === "@affino/datagrid",
    {
      expected: "@affino/datagrid",
      actual: datagridManifest.name ?? null,
    },
  )

  recordCheck(
    "pkg-datagrid-pro-name",
    datagridProManifest.name === "@affino/datagrid-pro",
    {
      expected: "@affino/datagrid-pro",
      actual: datagridProManifest.name ?? null,
    },
  )

  recordCheck(
    "pkg-datagrid-depends-on-core",
    typeof datagridManifest.dependencies?.["@affino/datagrid-core"] === "string",
    {
      dependency: "@affino/datagrid-core",
      value: datagridManifest.dependencies?.["@affino/datagrid-core"] ?? null,
    },
  )

  recordCheck(
    "pkg-datagrid-depends-on-vue",
    typeof datagridManifest.dependencies?.["@affino/datagrid-vue"] === "string",
    {
      dependency: "@affino/datagrid-vue",
      value: datagridManifest.dependencies?.["@affino/datagrid-vue"] ?? null,
    },
  )

  recordCheck(
    "pkg-datagrid-not-depend-on-pro",
    typeof datagridManifest.dependencies?.["@affino/datagrid-pro"] !== "string",
    {
      dependency: "@affino/datagrid-pro",
      value: datagridManifest.dependencies?.["@affino/datagrid-pro"] ?? null,
    },
  )

  recordCheck(
    "pkg-datagrid-pro-depends-on-datagrid",
    typeof datagridProManifest.dependencies?.["@affino/datagrid"] === "string",
    {
      dependency: "@affino/datagrid",
      value: datagridProManifest.dependencies?.["@affino/datagrid"] ?? null,
    },
  )

  recordCheck(
    "pkg-datagrid-vue-has-pro-subpath",
    typeof datagridVueManifest.exports?.["./pro"]?.import === "string",
    {
      export: "./pro",
      value: datagridVueManifest.exports?.["./pro"] ?? null,
    },
  )

  recordCheck(
    "pkg-datagrid-core-has-pro-subpath",
    typeof datagridCoreManifest.exports?.["./pro"]?.import === "string",
    {
      export: "./pro",
      value: datagridCoreManifest.exports?.["./pro"] ?? null,
    },
  )

  recordCheck(
    "pkg-datagrid-laravel-has-pro-subpath",
    typeof datagridLaravelManifest.exports?.["./pro"]?.import === "string",
    {
      export: "./pro",
      value: datagridLaravelManifest.exports?.["./pro"] ?? null,
    },
  )

  const forbiddenCommunityExports = [
    "createDataSourceBackedRowModel",
    "createServerBackedRowModel",
    "createServerRowModel",
    "createDataGridWorkerOwnedRowModel",
    "createDataGridWorkerOwnedRowModelHost",
    "createDataGridWorkerMessageHost",
    "createDataGridWorkerPostMessageTransport",
  ]

  for (const token of forbiddenCommunityExports) {
    recordCheck(
      `community-entrypoint-forbidden-export-${token}`,
      !datagridEntry.includes(token),
      { token, file: "packages/datagrid/src/index.ts" },
    )
  }

  const forbiddenVuePublicExports = [
    "createDataSourceBackedRowModel",
    "createServerBackedRowModel",
    "createServerRowModel",
    "createDataGridServerPivotRowId",
    "createDataGridWorkerOwnedRowModel",
    "createDataGridWorkerOwnedRowModelHost",
    "createDataGridWorkerMessageHost",
    "createDataGridWorkerPostMessageTransport",
  ]

  for (const token of forbiddenVuePublicExports) {
    recordCheck(
      `vue-public-forbidden-export-${token}`,
      !datagridVuePublicEntry.includes(token),
      { token, file: "packages/datagrid-vue/src/public.ts" },
    )
  }

  const forbiddenCorePublicExports = [
    "createDataSourceBackedRowModel",
    "createServerBackedRowModel",
    "createServerRowModel",
    "createDataGridServerPivotRowId",
  ]

  for (const token of forbiddenCorePublicExports) {
    recordCheck(
      `core-public-forbidden-export-${token}`,
      !datagridCorePublicEntry.includes(token),
      { token, file: "packages/datagrid-core/src/public.ts" },
    )
  }

  const forbiddenCoreAdvancedExports = [
    "createDataSourceBackedRowModel",
    "createServerBackedRowModel",
    "createServerRowModel",
    "createDataGridServerPivotRowId",
  ]

  for (const token of forbiddenCoreAdvancedExports) {
    recordCheck(
      `core-advanced-forbidden-export-${token}`,
      !datagridCoreAdvancedEntry.includes(token),
      { token, file: "packages/datagrid-core/src/advanced.ts" },
    )
  }

  const requiredCoreProExports = [
    "createDataSourceBackedRowModel",
    "createServerBackedRowModel",
    "createServerRowModel",
    "createDataGridServerPivotRowId",
  ]

  for (const token of requiredCoreProExports) {
    recordCheck(
      `core-pro-required-export-${token}`,
      datagridCoreProEntry.includes(token),
      { token, file: "packages/datagrid-core/src/pro.ts" },
    )
  }

  const forbiddenLaravelPublicExports = [
    "createDataSourceBackedRowModel",
    "createServerBackedRowModel",
    "createServerRowModel",
    "createDataGridServerPivotRowId",
    "normalizePivotSpec",
    "clonePivotSpec",
    "isSamePivotSpec",
  ]

  for (const token of forbiddenLaravelPublicExports) {
    recordCheck(
      `laravel-public-forbidden-export-${token}`,
      !datagridLaravelEntry.includes(token),
      { token, file: "packages/datagrid-laravel/resources/js/index.ts" },
    )
  }

  const requiredLaravelProExports = [
    "createDataSourceBackedRowModel",
    "createServerBackedRowModel",
    "createServerRowModel",
    "createDataGridServerPivotRowId",
  ]

  for (const token of requiredLaravelProExports) {
    recordCheck(
      `laravel-pro-required-export-${token}`,
      datagridLaravelProEntry.includes(token),
      { token, file: "packages/datagrid-laravel/resources/js/pro.ts" },
    )
  }

  const requiredVueProExports = [
    "createDataSourceBackedRowModel",
    "createServerBackedRowModel",
    "createServerRowModel",
    "createDataGridWorkerOwnedRowModel",
    "createDataGridWorkerOwnedRowModelHost",
    "createDataGridWorkerPostMessageTransport",
  ]

  for (const token of requiredVueProExports) {
    recordCheck(
      `vue-pro-required-export-${token}`,
      datagridVueProEntry.includes(token),
      { token, file: "packages/datagrid-vue/src/pro.ts" },
    )
  }

  recordCheck(
    "vue-pro-imports-core-pro",
    datagridVueProEntry.includes(`from "@affino/datagrid-core/pro"`),
    { file: "packages/datagrid-vue/src/pro.ts" },
  )

  recordCheck(
    "commercial-plan-has-pricing-pro-monthly",
    commercialPlan.includes("USD 39 / developer / month"),
    { file: "docs/datagrid-commercial-packaging-plan.md" },
  )

  recordCheck(
    "commercial-plan-has-pricing-pro-yearly",
    commercialPlan.includes("USD 390 / developer / year"),
    { file: "docs/datagrid-commercial-packaging-plan.md" },
  )

  recordCheck(
    "commercial-plan-has-enterprise-anchor-price",
    commercialPlan.includes("USD 15,000 / year"),
    { file: "docs/datagrid-commercial-packaging-plan.md" },
  )

  recordCheck(
    "commercial-plan-has-stripe-billing",
    /Stripe Checkout \+ Stripe Billing/.test(commercialPlan),
    { file: "docs/datagrid-commercial-packaging-plan.md" },
  )

  const report = {
    generatedAt: new Date().toISOString(),
    workspaceRoot,
    checks,
    failures,
    ok: failures.length === 0,
  }

  await mkdir(path.dirname(REPORT_PATH), { recursive: true })
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8")

  console.log("DataGrid Commercial Boundaries Check")
  console.log(`report: ${REPORT_PATH}`)
  console.log(`checks: ${checks.filter(item => item.ok).length}/${checks.length}`)

  if (failures.length === 0) {
    return
  }

  console.error("Failed checks:")
  for (const failure of failures) {
    console.error(`- [${failure.id}] ${JSON.stringify(failure.details)}`)
  }
  process.exitCode = 1
}

await main()
