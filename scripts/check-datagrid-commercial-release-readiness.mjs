import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workspaceRoot = path.resolve(__dirname, "..")
const requireDist = process.argv.includes("--require-dist")

const REPORT_PATH = path.join(
  workspaceRoot,
  "artifacts",
  "quality",
  "datagrid-commercial-release-readiness-report.json",
)

const PACKAGES = [
  {
    id: "datagrid",
    name: "@affino/datagrid",
    dir: "packages/datagrid",
  },
  {
    id: "datagrid-pro",
    name: "@affino/datagrid-pro",
    dir: "packages/datagrid-pro",
  },
]

function isSemverLike(value) {
  return typeof value === "string" && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value)
}

async function readText(relPath) {
  const absPath = path.join(workspaceRoot, relPath)
  return readFile(absPath, "utf8")
}

async function readJson(relPath) {
  return JSON.parse(await readText(relPath))
}

async function fileExists(relPath) {
  try {
    await stat(path.join(workspaceRoot, relPath))
    return true
  } catch {
    return false
  }
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

  const manifests = await Promise.all(
    PACKAGES.map(async pkg => ({
      ...pkg,
      manifest: await readJson(path.join(pkg.dir, "package.json")),
    })),
  )

  for (const pkg of manifests) {
    const { id, name, dir, manifest } = pkg

    recordCheck(`${id}-name`, manifest.name === name, {
      expected: name,
      actual: manifest.name ?? null,
      file: `${dir}/package.json`,
    })

    recordCheck(`${id}-version-semver`, isSemverLike(manifest.version), {
      value: manifest.version ?? null,
      file: `${dir}/package.json`,
    })

    recordCheck(`${id}-license`, manifest.license === "MIT", {
      expected: "MIT",
      actual: manifest.license ?? null,
      file: `${dir}/package.json`,
    })

    recordCheck(
      `${id}-files-dist`,
      Array.isArray(manifest.files) && manifest.files.includes("dist"),
      {
        files: manifest.files ?? null,
        file: `${dir}/package.json`,
      },
    )

    recordCheck(
      `${id}-publish-config-access`,
      manifest.publishConfig?.access === "public",
      {
        expected: "public",
        actual: manifest.publishConfig?.access ?? null,
        file: `${dir}/package.json`,
      },
    )

    recordCheck(
      `${id}-publish-config-provenance`,
      manifest.publishConfig?.provenance === true,
      {
        expected: true,
        actual: manifest.publishConfig?.provenance ?? null,
        file: `${dir}/package.json`,
      },
    )

    if (requireDist) {
      recordCheck(
        `${id}-dist-index-js`,
        await fileExists(path.join(dir, "dist/index.js")),
        { file: `${dir}/dist/index.js` },
      )
      recordCheck(
        `${id}-dist-index-d-ts`,
        await fileExists(path.join(dir, "dist/index.d.ts")),
        { file: `${dir}/dist/index.d.ts` },
      )
    }
  }

  const datagridManifest = manifests.find(pkg => pkg.id === "datagrid")?.manifest
  const datagridProManifest = manifests.find(pkg => pkg.id === "datagrid-pro")?.manifest

  recordCheck(
    "datagrid-pro-dependency-link",
    typeof datagridProManifest?.dependencies?.["@affino/datagrid"] === "string",
    {
      dependency: "@affino/datagrid",
      value: datagridProManifest?.dependencies?.["@affino/datagrid"] ?? null,
      file: "packages/datagrid-pro/package.json",
    },
  )

  recordCheck(
    "datagrid-core-dependency-link",
    typeof datagridManifest?.dependencies?.["@affino/datagrid-core"] === "string",
    {
      dependency: "@affino/datagrid-core",
      value: datagridManifest?.dependencies?.["@affino/datagrid-core"] ?? null,
      file: "packages/datagrid/package.json",
    },
  )

  recordCheck(
    "datagrid-vue-dependency-link",
    typeof datagridManifest?.dependencies?.["@affino/datagrid-vue"] === "string",
    {
      dependency: "@affino/datagrid-vue",
      value: datagridManifest?.dependencies?.["@affino/datagrid-vue"] ?? null,
      file: "packages/datagrid/package.json",
    },
  )

  recordCheck(
    "datagrid-and-pro-version-aligned",
    datagridManifest?.version === datagridProManifest?.version,
    {
      datagrid: datagridManifest?.version ?? null,
      datagridPro: datagridProManifest?.version ?? null,
      files: ["packages/datagrid/package.json", "packages/datagrid-pro/package.json"],
    },
  )

  const rootManifest = await readJson("package.json")
  const rootScripts = rootManifest.scripts ?? {}
  recordCheck(
    "root-release-channel-check-script",
    typeof rootScripts["release:commercial:channel:check"] === "string",
    {
      script: "release:commercial:channel:check",
      value: rootScripts["release:commercial:channel:check"] ?? null,
      file: "package.json",
    },
  )
  recordCheck(
    "root-release-pack-gate-script",
    typeof rootScripts["release:commercial:pack:gate"] === "string",
    {
      script: "release:commercial:pack:gate",
      value: rootScripts["release:commercial:pack:gate"] ?? null,
      file: "package.json",
    },
  )
  recordCheck(
    "commercial-release-workflow-exists",
    await fileExists(".github/workflows/commercial-release.yml"),
    {
      file: ".github/workflows/commercial-release.yml",
    },
  )
  recordCheck(
    "enterprise-hotfix-workflow-exists",
    await fileExists(".github/workflows/enterprise-hotfix-release.yml"),
    {
      file: ".github/workflows/enterprise-hotfix-release.yml",
    },
  )

  const report = {
    generatedAt: new Date().toISOString(),
    workspaceRoot,
    requireDist,
    checks,
    failures,
    ok: failures.length === 0,
  }

  await mkdir(path.dirname(REPORT_PATH), { recursive: true })
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8")

  console.log("DataGrid Commercial Release Readiness")
  console.log(`report: ${REPORT_PATH}`)
  console.log(`checks: ${checks.filter(item => item.ok).length}/${checks.length}`)

  if (failures.length > 0) {
    console.error("Failed checks:")
    for (const failure of failures) {
      console.error(`- [${failure.id}] ${JSON.stringify(failure.details)}`)
    }
    process.exitCode = 1
  }
}

await main()
