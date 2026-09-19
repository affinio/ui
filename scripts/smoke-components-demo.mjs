import { spawn } from "node:child_process"
import { setTimeout as delay } from "node:timers/promises"
import { chromium } from "@playwright/test"

const baseUrl = process.env.COMPONENT_DEMO_URL ?? "http://localhost:5174"
const timeoutMs = Number.parseInt(process.env.COMPONENT_DEMO_SERVER_TIMEOUT_MS ?? "15000", 10)

async function isAvailable() {
  try {
    return (await fetch(`${baseUrl}/dialogs`)).ok
  } catch {
    return false
  }
}

async function startServer() {
  const url = new URL(baseUrl)
  const child = spawn("pnpm", ["--dir", "packages/demo-vue", "dev", "--host", url.hostname, "--port", url.port || "5174", "--strictPort"], {
    cwd: process.cwd(),
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  })
  let output = ""
  child.stdout.on("data", (chunk) => { output += chunk.toString() })
  child.stderr.on("data", (chunk) => { output += chunk.toString() })
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) throw new Error(`demo server exited early\n${output}`)
    if (await isAvailable()) return child
    await delay(250)
  }
  child.kill("SIGTERM")
  throw new Error(`timed out waiting for ${baseUrl}\n${output}`)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

let server = null
let browser = null
try {
  if (!(await isAvailable())) server = await startServer()
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } })

  await page.goto(`${baseUrl}/dialogs`, { waitUntil: "networkidle" })
  await page.getByRole("button", { name: "Launch primary dialog" }).click()
  await page.getByRole("dialog").waitFor()
  assert(await page.getByRole("dialog").getAttribute("aria-modal") === "true", "dialog must expose aria-modal=true")
  await page.keyboard.press("Escape")
  await page.getByRole("dialog").waitFor({ state: "detached" })

  await page.goto(`${baseUrl}/diagram`, { waitUntil: "networkidle" })
  const canvas = page.locator("svg.diagram-svg")
  await canvas.waitFor()
  const initialRevision = Number(await page.locator(".diagram-stats dd").nth(2).innerText())
  await page.getByRole("button", { name: "Bay 1" }).click()
  await page.getByRole("button", { name: "Rotate 15" }).click()
  const selected = page.locator('[data-diagram-id="node-0"][data-selected="true"]')
  await selected.waitFor()
  const nextRevision = Number(await page.locator(".diagram-stats dd").nth(2).innerText())
  assert(nextRevision > initialRevision, `diagram revision did not advance: ${initialRevision} -> ${nextRevision}`)
  const beforeZoom = await page.getByLabel("Zoom level").innerText()
  await page.getByRole("button", { name: "+" }).click()
  assert((await page.getByLabel("Zoom level").innerText()) !== beforeZoom, "diagram zoom control did not update")

  console.log("component-demo-browser-smoke-passed")
} finally {
  await browser?.close()
  if (server) {
    server.kill("SIGTERM")
    if (server.connected) server.disconnect()
  }
}
