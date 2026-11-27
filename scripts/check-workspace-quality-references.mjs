#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"

const root = process.cwd()
const rootPackage = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
const workspacePackages = new Map()
for (const directory of ["packages", "."]) {
  const entries = directory === "." ? ["demo-vue", "demo-laravel", "docs-site"] : readdirSync(join(root, directory))
  for (const entry of entries) {
    const manifest = join(root, directory, entry, "package.json")
    if (!existsSync(manifest)) continue
    const pkg = JSON.parse(readFileSync(manifest, "utf8"))
    if (pkg.name) workspacePackages.set(pkg.name, manifest)
  }
}

const errors = []
const scripts = rootPackage.scripts ?? {}
for (const [name, command] of Object.entries(scripts)) {
  for (const [, reference] of command.matchAll(/(?:^|\s)(?:node\s+)?(?:\.\/)?(scripts\/[\w./-]+\.(?:mjs|cjs|js))/g)) {
    const target = resolve(root, reference)
    if (!existsSync(target)) errors.push(`${name}: missing script file ${reference}`)
  }
  for (const [, reference] of command.matchAll(/(?:^|\s)(tests?\/[\w./-]+\.(?:spec|test)\.[\w]+)/g)) {
    if (!existsSync(resolve(root, reference))) errors.push(`${name}: missing test file ${reference}`)
  }
  for (const [, packageName] of command.matchAll(/--filter\s+(@[\w.-]+\/[\w.-]+|[\w.-]+)/g)) {
    if (packageName === "./packages" || packageName.startsWith("!")) continue
    if (!workspacePackages.has(packageName)) errors.push(`${name}: workspace filter ${packageName} does not exist`)
  }
  for (const [, reference] of command.matchAll(/pnpm\s+run\s+([\w:-]+)/g)) {
    if (!(reference in scripts)) errors.push(`${name}: references missing root script ${reference}`)
  }
}

console.log("Workspace Quality Reference Check")
console.log(`root scripts checked: ${Object.keys(scripts).length}`)
console.log(`workspace packages checked: ${workspacePackages.size}`)
if (errors.length) {
  for (const error of errors) console.error(`FAIL ${error}`)
  process.exitCode = 1
} else {
  console.log("result: OK (all explicit script, test, and workspace references resolve)")
}
