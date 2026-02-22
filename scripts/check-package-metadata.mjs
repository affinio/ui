import fs from "node:fs"
import path from "node:path"

const ROOT = process.cwd()
const PACKAGES_DIR = path.join(ROOT, "packages")
const WRITE_MODE = process.argv.includes("--write")
const JSON_MODE = process.argv.includes("--json")

const REPO_URL = "git+https://github.com/affinio/affinio.git"
const REPO_WEB = "https://github.com/affinio/affinio"
const BUGS_URL = `${REPO_WEB}/issues`

function listPackageJsonFiles() {
  if (!fs.existsSync(PACKAGES_DIR)) {
    return []
  }
  return fs
    .readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(PACKAGES_DIR, entry.name, "package.json"))
    .filter((filePath) => fs.existsSync(filePath))
    .sort()
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

function expectedMetadata(packageDirName) {
  return {
    repository: {
      type: "git",
      url: REPO_URL,
      directory: `packages/${packageDirName}`,
    },
    homepage: `${REPO_WEB}/tree/main/packages/${packageDirName}#readme`,
    bugs: {
      url: BUGS_URL,
    },
  }
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0
}

const packageJsonFiles = listPackageJsonFiles()
const failures = []
const changedFiles = []

for (const filePath of packageJsonFiles) {
  const packageDirName = path.basename(path.dirname(filePath))
  const manifest = readJson(filePath)
  const expected = expectedMetadata(packageDirName)
  let fileChanged = false

  if (!isNonEmptyString(manifest.description)) {
    failures.push({
      file: relative(filePath),
      field: "description",
      expected: "non-empty string",
      actual: manifest.description ?? null,
    })
  }

  if (JSON.stringify(manifest.repository ?? null) !== JSON.stringify(expected.repository)) {
    failures.push({
      file: relative(filePath),
      field: "repository",
      expected: expected.repository,
      actual: manifest.repository ?? null,
    })
    if (WRITE_MODE) {
      manifest.repository = expected.repository
      fileChanged = true
    }
  }

  if ((manifest.homepage ?? null) !== expected.homepage) {
    failures.push({
      file: relative(filePath),
      field: "homepage",
      expected: expected.homepage,
      actual: manifest.homepage ?? null,
    })
    if (WRITE_MODE) {
      manifest.homepage = expected.homepage
      fileChanged = true
    }
  }

  if (JSON.stringify(manifest.bugs ?? null) !== JSON.stringify(expected.bugs)) {
    failures.push({
      file: relative(filePath),
      field: "bugs",
      expected: expected.bugs,
      actual: manifest.bugs ?? null,
    })
    if (WRITE_MODE) {
      manifest.bugs = expected.bugs
      fileChanged = true
    }
  }

  if (WRITE_MODE && fileChanged) {
    writeJson(filePath, manifest)
    changedFiles.push(relative(filePath))
  }
}

if (JSON_MODE) {
  process.stdout.write(
    `${JSON.stringify(
      {
        root: ROOT,
        writeMode: WRITE_MODE,
        packageCount: packageJsonFiles.length,
        failures,
        changedFiles,
      },
      null,
      2,
    )}\n`,
  )
} else {
  console.log("Package Metadata Policy")
  console.log(`root: ${ROOT}`)
  console.log(`packages checked: ${packageJsonFiles.length}`)
  if (WRITE_MODE) {
    console.log(`write mode: enabled (changed files: ${changedFiles.length})`)
  }
  if (failures.length === 0) {
    console.log("result: OK (package metadata matches policy)")
  } else {
    console.log(`result: FAIL (${failures.length} issues)`)
    for (const failure of failures) {
      console.log(`- ${failure.file} :: ${failure.field}`)
      console.log(`  expected: ${JSON.stringify(failure.expected)}`)
      console.log(`  actual:   ${JSON.stringify(failure.actual)}`)
    }
  }
}

if (!WRITE_MODE && failures.length > 0) {
  process.exitCode = 1
}

