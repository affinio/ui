import { spawn } from "node:child_process"
import { setTimeout as delay } from "node:timers/promises"
import { chromium } from "@playwright/test"

const route = process.env.TREEVIEW_DEMO_URL ?? "http://localhost:5174/treeview"
const routeUrl = new URL(route)
const scrollTop = Number.parseInt(process.env.TREEVIEW_SMOKE_SCROLL_TOP ?? "18000", 10)
const searchQuery = process.env.TREEVIEW_SMOKE_QUERY ?? "depth 6"
const serverTimeoutMs = Number.parseInt(process.env.TREEVIEW_SMOKE_SERVER_TIMEOUT_MS ?? "15000", 10)
const autoStartServer = process.env.TREEVIEW_SMOKE_START_SERVER !== "0"

const assertPositive = (name, value) => {
  if (!(value > 0)) {
    throw new Error(`${name} expected > 0, received ${value}`)
  }
}

const isRouteAvailable = async () => {
  try {
    const response = await fetch(route, { method: "GET" })
    return response.ok
  } catch {
    return false
  }
}

const startDemoServer = async () => {
  if (!autoStartServer) {
    throw new Error(`${route} is unavailable and TREEVIEW_SMOKE_START_SERVER=0`)
  }

  const host = routeUrl.hostname === "localhost" ? "127.0.0.1" : routeUrl.hostname
  const args = [
    "--dir",
    "packages/demo-vue",
    "dev",
    "--host",
    host,
    "--port",
    routeUrl.port || "5174",
    "--strictPort",
  ]
  const child = spawn("pnpm", args, {
    cwd: process.cwd(),
    detached: process.platform !== "win32",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  })
  let output = ""
  child.stdout.on("data", (chunk) => {
    output += chunk.toString()
  })
  child.stderr.on("data", (chunk) => {
    output += chunk.toString()
  })

  const startedAt = Date.now()
  while (Date.now() - startedAt < serverTimeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`demo server exited before ${route} became available\n${output}`)
    }
    if (await isRouteAvailable()) {
      return child
    }
    await delay(250)
  }

  child.kill("SIGTERM")
  throw new Error(`timed out waiting for ${route}\n${output}`)
}

let server = null
let browser = null
try {
  if (!(await isRouteAvailable())) {
    server = await startDemoServer()
  }

  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } })
  await page.goto(route, { waitUntil: "networkidle" })

  const viewport = page.locator(".treeview-rows")
  await viewport.waitFor()

  const initialRows = await page.locator("[role=treeitem]").count()
  assertPositive("initialRows", initialRows)

  await viewport.evaluate((element, nextScrollTop) => {
    element.scrollTop = nextScrollTop
    element.dispatchEvent(new Event("scroll", { bubbles: true }))
  }, scrollTop)
  await page.waitForTimeout(160)

  const rowsAfterScroll = await page.locator("[role=treeitem]").count()
  assertPositive("rowsAfterScroll", rowsAfterScroll)

  const rowsIntersectingViewport = await page.locator("[role=treeitem]").evaluateAll((rows) => {
    const viewportElement = document.querySelector(".treeview-rows")
    if (!viewportElement) {
      return 0
    }
    const viewportRect = viewportElement.getBoundingClientRect()
    return rows.filter((row) => {
      const rowRect = row.getBoundingClientRect()
      return rowRect.bottom > viewportRect.top && rowRect.top < viewportRect.bottom
    }).length
  })
  assertPositive("rowsIntersectingViewport", rowsIntersectingViewport)

  await page.getByLabel("Search project map").fill(searchQuery)
  await page.waitForTimeout(160)

  const rowsAfterSearch = await page.locator("[role=treeitem]").count()
  const matchedRows = await page.locator('[role=treeitem][data-matched="true"]').count()
  const searchInputFocused = await page.getByLabel("Search project map").evaluate((element) => document.activeElement === element)
  const summary = await page.locator(".treeview-summary").innerText()

  assertPositive("rowsAfterSearch", rowsAfterSearch)
  assertPositive("matchedRows", matchedRows)
  if (!searchInputFocused) {
    throw new Error("Search input lost focus during projection update")
  }

  console.log(JSON.stringify({
    route,
    serverStarted: Boolean(server),
    initialRows,
    rowsAfterScroll,
    rowsIntersectingViewport,
    rowsAfterSearch,
    matchedRows,
    searchInputFocused,
    summary,
  }, null, 2))
} finally {
  if (browser) {
    await browser.close()
  }
  if (server) {
    if (process.platform === "win32") {
      server.kill("SIGTERM")
    } else {
      try {
        process.kill(-server.pid, "SIGTERM")
      } catch {
        server.kill("SIGTERM")
      }
    }
    await Promise.race([
      new Promise((resolve) => server.once("exit", resolve)),
      delay(3000),
    ])
  }
}
