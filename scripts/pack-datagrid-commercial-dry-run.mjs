import { mkdir, readdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workspaceRoot = path.resolve(__dirname, "..")
const outputDir = path.join(workspaceRoot, "artifacts", "release")
const reportPath = path.join(outputDir, "datagrid-commercial-pack-report.json")

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: workspaceRoot,
      stdio: "pipe",
      shell: false,
      ...options,
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", chunk => {
      const text = chunk.toString()
      stdout += text
      process.stdout.write(text)
    })
    child.stderr.on("data", chunk => {
      const text = chunk.toString()
      stderr += text
      process.stderr.write(text)
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

async function main() {
  await rm(outputDir, { recursive: true, force: true })
  await mkdir(outputDir, { recursive: true })

  const commands = [
    {
      id: "pack-datagrid",
      command: "pnpm",
      args: ["--dir", "packages/datagrid", "pack", "--pack-destination", "../../artifacts/release"],
    },
    {
      id: "pack-datagrid-pro",
      command: "pnpm",
      args: ["--dir", "packages/datagrid-pro", "pack", "--pack-destination", "../../artifacts/release"],
    },
  ]

  const steps = []
  let hasFailure = false

  for (const command of commands) {
    console.log(`\n[pack] ${command.id}`)
    const result = await run(command.command, command.args)
    steps.push({
      id: command.id,
      command: [command.command, ...command.args].join(" "),
      code: result.code,
      stdout: result.stdout,
      stderr: result.stderr,
    })
    if (result.code !== 0) {
      hasFailure = true
      break
    }
  }

  const tarballs = (await readdir(outputDir))
    .filter(file => file.endsWith(".tgz"))
    .sort()

  const report = {
    generatedAt: new Date().toISOString(),
    workspaceRoot,
    outputDir,
    steps,
    tarballs,
    ok: !hasFailure
      && tarballs.some(file => file.startsWith("affino-datagrid-"))
      && tarballs.some(file => file.startsWith("affino-datagrid-pro-")),
  }

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")

  console.log("\nDataGrid Commercial Pack Dry Run")
  console.log(`report: ${reportPath}`)
  console.log(`tarballs: ${tarballs.length}`)

  if (!report.ok) {
    if (!hasFailure) {
      console.error("Failed checks:")
      if (!tarballs.some(file => file.startsWith("affino-datagrid-"))) {
        console.error("- missing datagrid tarball")
      }
      if (!tarballs.some(file => file.startsWith("affino-datagrid-pro-"))) {
        console.error("- missing datagrid-pro tarball")
      }
    }
    process.exitCode = 1
  }
}

await main()
