import { readdir, stat } from "node:fs/promises"
import path from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const packageRoot = path.join(root, "packages")
const packageNames = (await readdir(packageRoot)).sort()
const diagnostics = []
let nextPackage = 0

async function checkNextPackage() {
  while (nextPackage < packageNames.length) {
    const packageName = packageNames[nextPackage++]
  const packagePath = path.join(packageRoot, packageName)
  const configPath = path.join(packagePath, "tsconfig.tests.json")
  try {
    await stat(configPath)
  } catch {
    continue
  }

  const vue = await packageContainsVue(packagePath)
  const compiler = vue ? "vue-tsc" : "tsc"
  const result = await runCompiler(compiler, packageName)
  if (result !== 0) diagnostics.push(packageName)
  }
}

await Promise.all(Array.from({ length: Math.min(4, packageNames.length) }, () => checkNextPackage()))

if (diagnostics.length > 0) {
  console.error(`Test type-check failed in ${diagnostics.length} package(s): ${diagnostics.join(", ")}`)
  process.exitCode = 1
} else {
  console.log("Test type-check passed for all configured packages.")
}

async function packageContainsVue(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) continue
    const entryPath = path.join(directory, entry.name)
    if (entry.isFile() && entry.name.endsWith(".vue")) return true
    if (entry.isDirectory() && await packageContainsVue(entryPath)) return true
  }
  return false
}

function runCompiler(compiler, packageName) {
  return new Promise((resolve) => {
    const child = spawn(path.join(root, "node_modules", ".bin", compiler), ["-p", `packages/${packageName}/tsconfig.tests.json`, "--noEmit", "--pretty", "false"], {
      cwd: root,
      stdio: "inherit",
    })
    child.on("error", (error) => {
      console.error(`Unable to run ${compiler} for ${packageName}:`, error)
      resolve(1)
    })
    child.on("exit", (code) => resolve(code ?? 1))
  })
}
