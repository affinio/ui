import { readFile, readdir } from "node:fs/promises"
import { extname, join, resolve } from "node:path"

const root = resolve(new URL("..", import.meta.url).pathname)
const packages = [
  "treeview-core",
  "treeview-vue",
  "dialog-core",
  "dialog-vue",
  "diagram-core",
  "diagram-vue",
]
const failures = []

for (const packageName of packages) {
  const dist = join(root, "packages", packageName, "dist")
  for await (const file of walk(dist)) {
    if (extname(file) !== ".js") continue
    const source = await readFile(file, "utf8")
    for (const match of source.matchAll(/(?:from\s+|import\s*\(\s*)(["'])(\.[^"']+)\1/g)) {
      const specifier = match[2]
      if (!specifier.endsWith(".js")) {
        failures.push(`${file}: ${specifier}`)
      }
    }
  }
}

if (failures.length) {
  console.error("Component ESM relative specifier gate failed:")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log(`component-esm-specifiers-passed (${packages.length} packages)`)
}

async function* walk(directory) {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    throw new Error(`Missing built dist directory: ${directory}`, { cause: error })
  }
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name === "__tests__") continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) yield* walk(path)
    else yield path
  }
}
