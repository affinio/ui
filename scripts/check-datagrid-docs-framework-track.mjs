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
  "datagrid-docs-framework-track-report.json",
)

const FILE_GROUPS = [
  {
    group: "vue-track",
    files: [
      "docs-site/datagrid/vue-integration.md",
      "docs-site/datagrid/vue-api-reference.md",
      "docs-site/datagrid/vue-sugar-playbook.md",
      "docs-site/datagrid/sugar-overview.md",
      "docs-site/datagrid-ru/vue-integration.md",
      "docs-site/datagrid-ru/vue-api-reference.md",
      "docs-site/datagrid-ru/vue-sugar-playbook.md",
      "docs-site/datagrid-ru/sugar-overview.md",
      "packages/datagrid-vue/README.md",
    ],
    rules: [
      {
        id: "no-direct-core-import",
        message: "Vue-track docs must not import @affino/datagrid-core directly",
        pattern: /import[\s\S]*from\s+["']@affino\/datagrid-core(?:\/advanced)?["']/g,
      },
      {
        id: "no-direct-orchestration-import",
        message: "Vue-track docs must not import @affino/datagrid-orchestration directly",
        pattern: /import[\s\S]*from\s+["']@affino\/datagrid-orchestration["']/g,
      },
      {
        id: "no-vue-internal-import",
        message: "Vue-track docs must not import @affino/datagrid-vue/internal in user-facing examples",
        pattern: /import[\s\S]*from\s+["']@affino\/datagrid-vue\/internal["']/g,
      },
      {
        id: "no-install-core-orchestration",
        message: "Vue-track install snippets should install only @affino/datagrid-vue",
        pattern: /pnpm\s+add[^\n]*@affino\/datagrid-(?:core|orchestration)/g,
      },
    ],
  },
  {
    group: "laravel-track",
    files: [
      "docs-site/datagrid/laravel-integration.md",
      "docs-site/datagrid-ru/laravel-integration.md",
      "packages/datagrid-laravel/README.md",
    ],
    rules: [
      {
        id: "no-direct-core-import",
        message: "Laravel-track docs must not import @affino/datagrid-core directly",
        pattern: /import[\s\S]*from\s+["']@affino\/datagrid-core(?:\/advanced)?["']/g,
      },
      {
        id: "no-direct-orchestration-import",
        message: "Laravel-track docs must not import @affino/datagrid-orchestration directly",
        pattern: /import[\s\S]*from\s+["']@affino\/datagrid-orchestration["']/g,
      },
      {
        id: "no-install-core-orchestration",
        message: "Laravel-track install snippets should install only @affino/datagrid-laravel",
        pattern: /pnpm\s+add[^\n]*@affino\/datagrid-(?:core|orchestration)/g,
      },
    ],
  },
]

function lineNumberAt(text, index) {
  let line = 1
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) {
      line += 1
    }
  }
  return line
}

function compactSnippet(text) {
  return text.replace(/\s+/g, " ").trim().slice(0, 220)
}

async function main() {
  const violations = []
  const fileReports = []

  for (const group of FILE_GROUPS) {
    for (const relFile of group.files) {
      const absFile = path.join(workspaceRoot, relFile)
      const text = await readFile(absFile, "utf8")
      const fileViolations = []

      for (const rule of group.rules) {
        const pattern = new RegExp(rule.pattern)
        for (const match of text.matchAll(pattern)) {
          fileViolations.push({
            ruleId: rule.id,
            message: rule.message,
            line: lineNumberAt(text, match.index ?? 0),
            snippet: compactSnippet(match[0]),
          })
        }
      }

      if (fileViolations.length > 0) {
        violations.push({
          group: group.group,
          file: relFile,
          violations: fileViolations,
        })
      }

      fileReports.push({
        group: group.group,
        file: relFile,
        violationCount: fileViolations.length,
      })
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    workspaceRoot,
    totalFiles: fileReports.length,
    totalViolations: violations.reduce((sum, item) => sum + item.violations.length, 0),
    files: fileReports,
    violations,
  }

  await mkdir(path.dirname(REPORT_PATH), { recursive: true })
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8")

  console.log("DataGrid Docs Framework-Track Check")
  console.log(`report: ${REPORT_PATH}`)
  console.log(`files: ${report.totalFiles}`)
  console.log(`violations: ${report.totalViolations}`)

  if (violations.length === 0) {
    return
  }

  console.error("Failed checks:")
  for (const item of violations) {
    for (const violation of item.violations) {
      console.error(`- [${item.group}/${violation.ruleId}] ${item.file}:${violation.line} ${violation.snippet}`)
    }
  }
  process.exitCode = 1
}

await main()
