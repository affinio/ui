import fs from "node:fs"
import path from "node:path"

const ROOT = process.cwd()
const WRITE_MODE = process.argv.includes("--write")
const JSON_OUTPUT = process.argv.includes("--json")
const INTERNAL_PREFIX = "@affino/"
const ENFORCED_SECTIONS = ["dependencies", "devDependencies", "optionalDependencies"]
const INFO_SECTIONS = ["peerDependencies"]
const WORKSPACE_PREFIX = "workspace:"

function listPackageJsonFiles(rootDir) {
  const files = []
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") {
        continue
      }
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        visit(fullPath)
        continue
      }
      if (entry.isFile() && entry.name === "package.json") {
        files.push(fullPath)
      }
    }
  }
  visit(rootDir)
  return files
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"))
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function relative(filePath) {
  return path.relative(ROOT, filePath) || "."
}

function isInternalPackage(name) {
  return typeof name === "string" && name.startsWith(INTERNAL_PREFIX)
}

function isWorkspaceSpec(spec) {
  return typeof spec === "string" && spec.startsWith(WORKSPACE_PREFIX)
}

const packageJsonFiles = listPackageJsonFiles(ROOT)

const mismatches = []
const peerInfo = []
let changedFiles = 0

for (const filePath of packageJsonFiles) {
  let manifest
  try {
    manifest = readJson(filePath)
  } catch (error) {
    mismatches.push({
      file: relative(filePath),
      section: "parse",
      packageName: null,
      specifier: String(error),
      expected: null,
    })
    continue
  }

  let fileChanged = false

  for (const section of ENFORCED_SECTIONS) {
    const deps = manifest?.[section]
    if (!deps || typeof deps !== "object") {
      continue
    }
    for (const [depName, specifier] of Object.entries(deps)) {
      if (!isInternalPackage(depName)) {
        continue
      }
      if (isWorkspaceSpec(specifier)) {
        continue
      }
      mismatches.push({
        file: relative(filePath),
        section,
        packageName: depName,
        specifier,
        expected: "workspace:^",
      })
      if (WRITE_MODE) {
        deps[depName] = "workspace:^"
        fileChanged = true
      }
    }
  }

  for (const section of INFO_SECTIONS) {
    const deps = manifest?.[section]
    if (!deps || typeof deps !== "object") {
      continue
    }
    for (const [depName, specifier] of Object.entries(deps)) {
      if (!isInternalPackage(depName)) {
        continue
      }
      peerInfo.push({
        file: relative(filePath),
        section,
        packageName: depName,
        specifier,
      })
    }
  }

  if (WRITE_MODE && fileChanged) {
    writeJson(filePath, manifest)
    changedFiles += 1
  }
}

if (JSON_OUTPUT) {
  process.stdout.write(
    `${JSON.stringify(
      {
        root: ROOT,
        writeMode: WRITE_MODE,
        changedFiles,
        mismatches,
        peerInfo,
      },
      null,
      2,
    )}\n`,
  )
} else {
  console.log("Internal Workspace Dependency Policy")
  console.log(`root: ${ROOT}`)
  console.log(`package.json files scanned: ${packageJsonFiles.length}`)
  console.log(`enforced sections: ${ENFORCED_SECTIONS.join(", ")}`)
  if (WRITE_MODE) {
    console.log(`write mode: enabled (changed files: ${changedFiles})`)
  }
  if (mismatches.length === 0) {
    console.log("result: OK (all internal deps use workspace protocol in enforced sections)")
  } else {
    console.log(`result: FAIL (${mismatches.length} mismatches)`)
    for (const mismatch of mismatches) {
      console.log(
        `- ${mismatch.file} :: ${mismatch.section} :: ${mismatch.packageName} = ${mismatch.specifier} (expected ${mismatch.expected})`,
      )
    }
  }
  if (peerInfo.length > 0) {
    console.log(`info: internal peerDependencies entries found (${peerInfo.length})`)
    for (const peer of peerInfo) {
      console.log(`  - ${peer.file} :: ${peer.packageName} = ${peer.specifier}`)
    }
  }
}

if (!WRITE_MODE && mismatches.length > 0) {
  process.exitCode = 1
}

