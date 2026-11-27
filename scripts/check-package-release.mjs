#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join, resolve, sep } from "node:path"
import { spawnSync } from "node:child_process"

const root = process.cwd()
const args = process.argv.slice(2)
const packageName = args.find((arg) => !arg.startsWith("--"))
const browserIndex = args.indexOf("--browser-script")
const browserScript = browserIndex >= 0 ? args[browserIndex + 1] : undefined
const fail = (message) => { console.error(`FAIL ${message}`); process.exit(1) }
if (!packageName) fail("usage: pnpm run release:check:package -- <workspace-package> [--browser-script <root-script>]")

let packageDir
for (const directory of ["packages", "."]) {
  const entries = directory === "." ? ["demo-vue", "demo-laravel", "docs-site"] : readdirSync(join(root, directory))
  for (const entry of entries) {
    const candidate = join(root, directory, entry)
    const manifestPath = join(candidate, "package.json")
    if (existsSync(manifestPath) && JSON.parse(readFileSync(manifestPath, "utf8")).name === packageName) packageDir = candidate
  }
}
if (!packageDir) fail(`${packageName} is not a workspace package`)

const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"))
if (manifest.private) fail(`${packageName} is private and is not independently publishable`)
const rootManifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
const run = (label, command, commandArgs, cwd = root) => {
  console.log(`\n[release:${packageName}] ${label}`)
  const result = spawnSync(command, commandArgs, { cwd, stdio: "inherit" })
  if (result.status !== 0) fail(`${label} failed${result.error ? `: ${result.error.message}` : ""}`)
}

run("workspace dependency policy", "pnpm", ["run", "quality:deps:workspace-internal"])
run("workspace package metadata policy", "pnpm", ["run", "quality:metadata:packages"])
if (!manifest.scripts?.test) fail(`${packageName} has no package test script`)
if (!manifest.scripts?.build) fail(`${packageName} has no package build script`)
run("package tests", "pnpm", ["--filter", packageName, "run", "test"])
if (manifest.scripts["type-check"]) run("package type-check", "pnpm", ["--filter", packageName, "run", "type-check"])
run("package build", "pnpm", ["--filter", packageName, "run", "build"])

const publicTargets = new Set()
const declarationTargets = new Set()
const collectTargets = (value) => {
  if (typeof value === "string") {
    if (value.startsWith("./") && !value.includes("*")) publicTargets.add(value.slice(2))
  } else if (Array.isArray(value)) {
    for (const item of value) collectTargets(item)
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key === "types" && typeof child === "string" && child.startsWith("./") && !child.includes("*")) declarationTargets.add(child.slice(2))
      collectTargets(child)
    }
  }
}
if (manifest.types || manifest.typings) {
  const target = String(manifest.types ?? manifest.typings).replace(/^\.\//, "")
  declarationTargets.add(target)
  publicTargets.add(target)
}
collectTargets(manifest.exports)
if (manifest.main && typeof manifest.main === "string") publicTargets.add(manifest.main.replace(/^\.\//, ""))
if (manifest.module && typeof manifest.module === "string") publicTargets.add(manifest.module.replace(/^\.\//, ""))
for (const target of publicTargets) {
  const absolute = resolve(packageDir, target)
  if (!absolute.startsWith(`${resolve(packageDir)}${sep}`) || !existsSync(absolute)) fail(`export target is missing after build: ${target}`)
}
if (!publicTargets.size) fail(`${packageName} declares no verifiable package entry point in exports, types, or main`)

console.log(`\n[release:${packageName}] dry-run package contents`)
const pack = spawnSync("npm", ["pack", "--dry-run", "--json"], { cwd: packageDir, encoding: "utf8" })
if (pack.status !== 0) fail(`npm pack dry-run failed: ${pack.stderr || pack.error?.message || "unknown error"}`)
let packResult
try { packResult = JSON.parse(pack.stdout)[0] } catch { fail("npm pack dry-run returned invalid JSON") }
const packedFiles = new Set((packResult.files ?? []).map((file) => file.path))
for (const target of publicTargets) if (!packedFiles.has(target)) fail(`public package entry is not included in tarball: ${target}`)
for (const target of declarationTargets) if (!packedFiles.has(target)) fail(`public declaration is not included in tarball: ${target}`)

const hasUI = /-(vue|react)$/.test(packageName)
if (hasUI && !browserScript) fail(`${packageName} is a UI package; pass its focused browser acceptance root script with --browser-script`)
if (browserScript) {
  if (!rootManifest.scripts?.[browserScript]) fail(`browser acceptance root script does not exist: ${browserScript}`)
  run("package browser acceptance", "pnpm", ["run", browserScript])
} else {
  console.log("browser acceptance: not applicable to this headless package")
}

console.log(`\nPASS ${packageName} release checks`)
