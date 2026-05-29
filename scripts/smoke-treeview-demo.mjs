import { chromium } from "@playwright/test"

const route = process.env.TREEVIEW_DEMO_URL ?? "http://localhost:5174/treeview"
const scrollTop = Number.parseInt(process.env.TREEVIEW_SMOKE_SCROLL_TOP ?? "18000", 10)
const searchQuery = process.env.TREEVIEW_SMOKE_QUERY ?? "depth 6"

const assertPositive = (name, value) => {
  if (!(value > 0)) {
    throw new Error(`${name} expected > 0, received ${value}`)
  }
}

const browser = await chromium.launch({ headless: true })
try {
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
    initialRows,
    rowsAfterScroll,
    rowsIntersectingViewport,
    rowsAfterSearch,
    matchedRows,
    searchInputFocused,
    summary,
  }, null, 2))
} finally {
  await browser.close()
}
