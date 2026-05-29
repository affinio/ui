import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { spawn } from "node:child_process"
import { setTimeout as delay } from "node:timers/promises"
import { chromium } from "@playwright/test"

const route = process.env.TREEVIEW_DEMO_URL ?? "http://localhost:5174/treeview"
const routeUrl = new URL(route)
const scrollTop = Number.parseInt(process.env.TREEVIEW_SMOKE_SCROLL_TOP ?? "18000", 10)
const searchQuery = process.env.TREEVIEW_SMOKE_QUERY ?? "depth 6"
const noMatchQuery = process.env.TREEVIEW_SMOKE_NO_MATCH_QUERY ?? "definitely-no-treeview-match"
const serverTimeoutMs = Number.parseInt(process.env.TREEVIEW_SMOKE_SERVER_TIMEOUT_MS ?? "15000", 10)
const autoStartServer = process.env.TREEVIEW_SMOKE_START_SERVER !== "0"
const screenshotDir = process.env.TREEVIEW_SMOKE_SCREENSHOT_DIR ?? "artifacts/treeview-smoke"
const captureScreenshots = process.env.TREEVIEW_SMOKE_SCREENSHOTS !== "0"

const assertPositive = (name, value) => {
  if (!(value > 0)) {
    throw new Error(`${name} expected > 0, received ${value}`)
  }
}

const countRowsIntersectingViewport = async (page) => {
  return page.locator("[role=treeitem]").evaluateAll((rows) => {
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
}

const getActiveRowValue = async (page) => {
  return page.locator('[role=treeitem][data-active="true"]').first().getAttribute("data-value")
}

const getVisibleTotal = async (page) => {
  const summary = await page.locator(".treeview-summary").innerText()
  const match = summary.match(/(\d+) visible \/ (\d+) total/)
  if (!match) {
    throw new Error(`could not parse visible summary: ${summary}`)
  }
  return Number.parseInt(match[1], 10)
}

const isActiveElementInsideViewport = async (page) => {
  return page.evaluate(() => {
    const viewportElement = document.querySelector(".treeview-rows")
    const activeElement = document.activeElement
    if (!viewportElement || !(activeElement instanceof HTMLElement) || activeElement.getAttribute("role") !== "treeitem") {
      return false
    }
    const viewportRect = viewportElement.getBoundingClientRect()
    const activeRect = activeElement.getBoundingClientRect()
    return activeRect.bottom > viewportRect.top && activeRect.top < viewportRect.bottom
  })
}

const hasPageHorizontalOverflow = async (page) => {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
}

const captureScreenshot = async (page, name) => {
  if (!captureScreenshots) {
    return null
  }
  await mkdir(screenshotDir, { recursive: true })
  const path = join(screenshotDir, `${name}.png`)
  await page.screenshot({ path, fullPage: false })
  return path
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
  const initialScreenshot = await captureScreenshot(page, "treeview-initial")

  const firstRowValue = await page.locator("[role=treeitem]").first().getAttribute("data-value")
  await page.locator("[role=treeitem]").first().click()
  const activeAfterClick = await getActiveRowValue(page)
  if (activeAfterClick !== firstRowValue) {
    throw new Error(`click did not set active row, expected ${firstRowValue}, received ${activeAfterClick}`)
  }

  for (let index = 0; index < 30; index += 1) {
    await page.keyboard.press("ArrowDown")
  }
  await page.waitForTimeout(160)

  const activeAfterKeyboard = await getActiveRowValue(page)
  const keyboardScrollTop = await viewport.evaluate((element) => element.scrollTop)
  const keyboardRowsIntersectingViewport = await countRowsIntersectingViewport(page)
  const keyboardFocusVisible = await isActiveElementInsideViewport(page)
  assertPositive("keyboardRowsIntersectingViewport", keyboardRowsIntersectingViewport)
  if (!(keyboardScrollTop > 0)) {
    throw new Error(`keyboard navigation did not scroll the virtual viewport, scrollTop=${keyboardScrollTop}`)
  }
  if (!keyboardFocusVisible) {
    throw new Error("keyboard navigation focus is outside the virtual viewport")
  }
  if (!activeAfterKeyboard || activeAfterKeyboard === activeAfterClick) {
    throw new Error(`keyboard navigation did not move active row, active=${activeAfterKeyboard}`)
  }

  await viewport.evaluate((element, nextScrollTop) => {
    element.scrollTop = nextScrollTop
    element.dispatchEvent(new Event("scroll", { bubbles: true }))
  }, scrollTop)
  await page.waitForTimeout(160)

  const rowsAfterScroll = await page.locator("[role=treeitem]").count()
  assertPositive("rowsAfterScroll", rowsAfterScroll)

  const rowsIntersectingViewport = await countRowsIntersectingViewport(page)
  assertPositive("rowsIntersectingViewport", rowsIntersectingViewport)
  const scrolledScreenshot = await captureScreenshot(page, "treeview-scrolled")

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
  const searchScreenshot = await captureScreenshot(page, "treeview-search")

  await page.getByLabel("Clear treeview search").click()
  await page.waitForTimeout(160)
  const rowsAfterClear = await page.locator("[role=treeitem]").count()
  const rowsAfterClearInViewport = await countRowsIntersectingViewport(page)
  assertPositive("rowsAfterClear", rowsAfterClear)
  assertPositive("rowsAfterClearInViewport", rowsAfterClearInViewport)

  await viewport.evaluate((element) => {
    element.scrollTop = 0
    element.dispatchEvent(new Event("scroll", { bubbles: true }))
  })
  await page.waitForTimeout(160)
  await page.locator('[role=treeitem][data-value="workspace"]').click()
  const visibleBeforeCollapse = await getVisibleTotal(page)
  await page.keyboard.press("ArrowLeft")
  await page.waitForTimeout(160)
  const visibleAfterCollapse = await getVisibleTotal(page)
  const rowsAfterCollapseInViewport = await countRowsIntersectingViewport(page)
  const activeAfterCollapse = await getActiveRowValue(page)
  if (!(visibleAfterCollapse < visibleBeforeCollapse)) {
    throw new Error(`ArrowLeft did not collapse root, before=${visibleBeforeCollapse}, after=${visibleAfterCollapse}`)
  }
  assertPositive("rowsAfterCollapseInViewport", rowsAfterCollapseInViewport)
  if (activeAfterCollapse !== "workspace") {
    throw new Error(`collapse moved active row, active=${activeAfterCollapse}`)
  }

  await page.keyboard.press("ArrowRight")
  await page.waitForTimeout(160)
  const visibleAfterExpand = await getVisibleTotal(page)
  const rowsAfterExpandInViewport = await countRowsIntersectingViewport(page)
  if (!(visibleAfterExpand > visibleAfterCollapse)) {
    throw new Error(`ArrowRight did not expand root, collapsed=${visibleAfterCollapse}, expanded=${visibleAfterExpand}`)
  }
  assertPositive("rowsAfterExpandInViewport", rowsAfterExpandInViewport)

  await page.getByLabel("Search project map").fill(noMatchQuery)
  await page.waitForTimeout(160)
  const rowsAfterNoMatch = await page.locator("[role=treeitem]").count()
  const emptySearchVisible = await page.getByRole("status").filter({ hasText: "No matching nodes" }).isVisible()
  const visibleAfterNoMatch = await getVisibleTotal(page)
  const searchInputFocusedAfterNoMatch = await page.getByLabel("Search project map").evaluate((element) => document.activeElement === element)
  if (rowsAfterNoMatch !== 0 || visibleAfterNoMatch !== 0 || !emptySearchVisible || !searchInputFocusedAfterNoMatch) {
    throw new Error(JSON.stringify({ rowsAfterNoMatch, visibleAfterNoMatch, emptySearchVisible, searchInputFocusedAfterNoMatch }))
  }
  const emptyScreenshot = await captureScreenshot(page, "treeview-empty-search")

  await page.getByLabel("Clear treeview search").click()
  await page.waitForTimeout(160)
  const rowsAfterNoMatchClear = await page.locator("[role=treeitem]").count()
  const rowsAfterNoMatchClearInViewport = await countRowsIntersectingViewport(page)
  assertPositive("rowsAfterNoMatchClear", rowsAfterNoMatchClear)
  assertPositive("rowsAfterNoMatchClearInViewport", rowsAfterNoMatchClearInViewport)


  const mobilePage = await browser.newPage({
    isMobile: true,
    viewport: { width: 390, height: 844 },
  })
  await mobilePage.goto(route, { waitUntil: "networkidle" })
  await mobilePage.locator(".treeview-rows").waitFor()
  const mobileInitialRows = await mobilePage.locator("[role=treeitem]").count()
  assertPositive("mobileInitialRows", mobileInitialRows)
  const mobileHasHorizontalOverflow = await hasPageHorizontalOverflow(mobilePage)
  if (mobileHasHorizontalOverflow) {
    throw new Error("mobile viewport has horizontal page overflow")
  }
  const mobileInitialScreenshot = await captureScreenshot(mobilePage, "treeview-mobile-initial")

  const mobileViewport = mobilePage.locator(".treeview-rows")
  await mobileViewport.evaluate((element, nextScrollTop) => {
    element.scrollTop = nextScrollTop
    element.dispatchEvent(new Event("scroll", { bubbles: true }))
  }, Math.floor(scrollTop / 2))
  await mobilePage.waitForTimeout(160)
  const mobileRowsAfterScroll = await mobilePage.locator("[role=treeitem]").count()
  const mobileRowsIntersectingViewport = await countRowsIntersectingViewport(mobilePage)
  assertPositive("mobileRowsAfterScroll", mobileRowsAfterScroll)
  assertPositive("mobileRowsIntersectingViewport", mobileRowsIntersectingViewport)

  await mobilePage.getByLabel("Search project map").fill(searchQuery)
  await mobilePage.waitForTimeout(160)
  const mobileRowsAfterSearch = await mobilePage.locator("[role=treeitem]").count()
  const mobileMatchedRows = await mobilePage.locator('[role=treeitem][data-matched="true"]').count()
  const mobileSearchFocused = await mobilePage.getByLabel("Search project map").evaluate((element) => document.activeElement === element)
  assertPositive("mobileRowsAfterSearch", mobileRowsAfterSearch)
  assertPositive("mobileMatchedRows", mobileMatchedRows)
  if (!mobileSearchFocused) {
    throw new Error("mobile search input lost focus during projection update")
  }
  const mobileSearchScreenshot = await captureScreenshot(mobilePage, "treeview-mobile-search")
  await mobilePage.close()

  console.log(JSON.stringify({
    route,
    serverStarted: Boolean(server),
    screenshots: [initialScreenshot, scrolledScreenshot, searchScreenshot, emptyScreenshot, mobileInitialScreenshot, mobileSearchScreenshot].filter(Boolean),
    initialRows,
    activeAfterClick,
    activeAfterKeyboard,
    keyboardScrollTop,
    keyboardRowsIntersectingViewport,
    keyboardFocusVisible,
    rowsAfterScroll,
    rowsIntersectingViewport,
    rowsAfterSearch,
    matchedRows,
    searchInputFocused,
    rowsAfterClear,
    rowsAfterClearInViewport,
    visibleBeforeCollapse,
    visibleAfterCollapse,
    rowsAfterCollapseInViewport,
    activeAfterCollapse,
    visibleAfterExpand,
    rowsAfterExpandInViewport,
    rowsAfterNoMatch,
    visibleAfterNoMatch,
    emptySearchVisible,
    searchInputFocusedAfterNoMatch,
    rowsAfterNoMatchClear,
    rowsAfterNoMatchClearInViewport,
    mobileInitialRows,
    mobileHasHorizontalOverflow,
    mobileRowsAfterScroll,
    mobileRowsIntersectingViewport,
    mobileRowsAfterSearch,
    mobileMatchedRows,
    mobileSearchFocused,
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
