import { mkdir, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workspaceRoot = path.resolve(__dirname, "..")
const releaseDir = path.join(workspaceRoot, "artifacts", "release")
const reportPath = path.join(
  workspaceRoot,
  "artifacts",
  "quality",
  "datagrid-commercial-tarball-boundaries-report.json",
)

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: workspaceRoot,
      stdio: "pipe",
      shell: false,
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", chunk => {
      stdout += chunk.toString()
    })
    child.stderr.on("data", chunk => {
      stderr += chunk.toString()
    })
    child.on("error", reject)
    child.on("close", code => {
      resolve({
        code: code ?? 1,
        stdout,
        stderr,
      })
    })
  })
}

async function findTarballs() {
  let files = []
  try {
    files = await readdir(releaseDir)
  } catch {
    return {
      datagrid: null,
      datagridPro: null,
    }
  }
  const datagrid = files
    .filter(file => /^affino-datagrid-\d/.test(file) && file.endsWith(".tgz"))
    .sort()
  const datagridPro = files
    .filter(file => /^affino-datagrid-pro-\d/.test(file) && file.endsWith(".tgz"))
    .sort()
  return {
    datagrid: datagrid.at(-1) ?? null,
    datagridPro: datagridPro.at(-1) ?? null,
  }
}

async function readTarEntry(tarballPath, entry) {
  const result = await run("tar", ["-xOf", tarballPath, entry])
  if (result.code !== 0) {
    return null
  }
  return result.stdout
}

async function listTarEntries(tarballPath) {
  const result = await run("tar", ["-tf", tarballPath])
  if (result.code !== 0) {
    return []
  }
  return result.stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
}

async function main() {
  const checks = []
  const failures = []

  const record = (id, ok, details) => {
    checks.push({ id, ok, details })
    if (!ok) {
      failures.push({ id, details })
    }
  }

  const tarballs = await findTarballs()
  record("datagrid-tarball-present", tarballs.datagrid != null, {
    dir: releaseDir,
    tarball: tarballs.datagrid,
  })
  record("datagrid-pro-tarball-present", tarballs.datagridPro != null, {
    dir: releaseDir,
    tarball: tarballs.datagridPro,
  })

  const datagridTarballPath = tarballs.datagrid ? path.join(releaseDir, tarballs.datagrid) : null
  const datagridProTarballPath = tarballs.datagridPro ? path.join(releaseDir, tarballs.datagridPro) : null

  if (datagridTarballPath) {
    const entries = await listTarEntries(datagridTarballPath)
    record("datagrid-dist-index-js-in-tarball", entries.includes("package/dist/index.js"), {
      tarball: tarballs.datagrid,
      entry: "package/dist/index.js",
    })
    record("datagrid-dist-index-d-ts-in-tarball", entries.includes("package/dist/index.d.ts"), {
      tarball: tarballs.datagrid,
      entry: "package/dist/index.d.ts",
    })

    const indexJs = await readTarEntry(datagridTarballPath, "package/dist/index.js")
    const indexDts = await readTarEntry(datagridTarballPath, "package/dist/index.d.ts")
    const combined = `${indexJs ?? ""}\n${indexDts ?? ""}`

    const forbiddenPatterns = [
      "@affino/datagrid-core/pro",
      "@affino/datagrid-vue/pro",
      "createServerBackedRowModel",
      "createDataSourceBackedRowModel",
      "createServerRowModel",
      "createDataGridServerPivotRowId",
      "enableProFeatures",
    ]

    for (const pattern of forbiddenPatterns) {
      record(`datagrid-community-forbidden-${pattern}`, !combined.includes(pattern), {
        tarball: tarballs.datagrid,
        pattern,
      })
    }
  }

  if (datagridProTarballPath) {
    const indexDts = await readTarEntry(datagridProTarballPath, "package/dist/index.d.ts")
    const indexJs = await readTarEntry(datagridProTarballPath, "package/dist/index.js")
    const combined = `${indexJs ?? ""}\n${indexDts ?? ""}`
    record("datagrid-pro-exports-enableProFeatures", combined.includes("enableProFeatures"), {
      tarball: tarballs.datagridPro,
      pattern: "enableProFeatures",
    })
  }

  const report = {
    generatedAt: new Date().toISOString(),
    workspaceRoot,
    releaseDir,
    tarballs,
    checks,
    failures,
    ok: failures.length === 0,
  }

  await mkdir(path.dirname(reportPath), { recursive: true })
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")

  console.log("DataGrid Commercial Tarball Boundaries")
  console.log(`report: ${reportPath}`)
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
