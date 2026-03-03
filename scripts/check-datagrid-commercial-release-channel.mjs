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
  "datagrid-commercial-release-channel-report.json",
)

const distTag = (process.env.NPM_DIST_TAG ?? "latest").trim()
const policyMode = (process.env.DATAGRID_RELEASE_POLICY_MODE ?? "commercial").trim()
const githubRef = (process.env.GITHUB_REF ?? "").trim()

function isSemverLike(value) {
  return typeof value === "string" && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value)
}

function hasPrerelease(value) {
  return typeof value === "string" && value.includes("-")
}

function hasHotfixMarker(value) {
  if (typeof value !== "string") {
    return false
  }
  return /(?:^|[.-])hotfix(?:[.-]|\d|$)/i.test(value)
}

async function readJson(relPath) {
  const absPath = path.join(workspaceRoot, relPath)
  return JSON.parse(await readFile(absPath, "utf8"))
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

  const datagrid = await readJson("packages/datagrid/package.json")
  const datagridPro = await readJson("packages/datagrid-pro/package.json")
  const version = datagrid.version
  const proVersion = datagridPro.version

  record("version-semver", isSemverLike(version), {
    value: version ?? null,
    file: "packages/datagrid/package.json",
  })
  record("version-aligned", version === proVersion, {
    datagrid: version ?? null,
    datagridPro: proVersion ?? null,
    files: ["packages/datagrid/package.json", "packages/datagrid-pro/package.json"],
  })

  record("dist-tag-supported", ["latest", "next", "enterprise-hotfix"].includes(distTag), {
    distTag,
    supported: ["latest", "next", "enterprise-hotfix"],
  })

  if (distTag === "latest") {
    record("latest-requires-stable-version", !hasPrerelease(version), {
      version,
      distTag,
      reason: "latest channel must publish stable semver only",
    })
  }

  if (distTag === "next") {
    record("next-requires-prerelease-version", hasPrerelease(version), {
      version,
      distTag,
      reason: "next channel must publish prerelease semver",
    })
  }

  if (distTag === "enterprise-hotfix") {
    record("enterprise-hotfix-requires-hotfix-version", hasHotfixMarker(version), {
      version,
      distTag,
      reason: "enterprise-hotfix channel must include hotfix marker in version",
    })
    record("enterprise-hotfix-requires-tag-ref", githubRef.startsWith("refs/tags/enterprise-hotfix/"), {
      githubRef: githubRef || null,
      expectedPrefix: "refs/tags/enterprise-hotfix/",
    })
  }

  if (policyMode === "commercial") {
    record("commercial-workflow-tag-scope", distTag === "latest" || distTag === "next", {
      distTag,
      allowed: ["latest", "next"],
      reason: "enterprise-hotfix publishes from dedicated workflow",
    })
  } else if (policyMode === "enterprise-hotfix") {
    record("enterprise-workflow-dist-tag", distTag === "enterprise-hotfix", {
      distTag,
      expected: "enterprise-hotfix",
    })
  }

  const report = {
    generatedAt: new Date().toISOString(),
    workspaceRoot,
    policyMode,
    distTag,
    version,
    proVersion,
    githubRef: githubRef || null,
    checks,
    failures,
    ok: failures.length === 0,
  }

  await mkdir(path.dirname(REPORT_PATH), { recursive: true })
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8")

  console.log("DataGrid Commercial Release Channel Policy")
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
