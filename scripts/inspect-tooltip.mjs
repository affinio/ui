import { chromium } from "@playwright/test"

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.goto("http://127.0.0.1:8000", { waitUntil: "networkidle" })
  await page.hover(".tooltip-trigger")
  await page.waitForTimeout(500)
  const tooltipInfo = await page.evaluate(() => {
    const root = document.querySelector("[data-affino-tooltip-root]")
    const surface = document.querySelector("[data-affino-tooltip-surface]")
    if (!root || !surface) {
      return null
    }
    const rect = surface.getBoundingClientRect()
    return {
      placementAttr: root.getAttribute("data-affino-tooltip-placement"),
      datasetPlacement: surface.dataset.placement,
      datasetAlign: surface.dataset.align,
      leftStyle: surface.style.left,
      topStyle: surface.style.top,
      hidden: surface.hidden,
      rectLeft: rect.left,
      rectTop: rect.top,
      rectWidth: rect.width,
      rectHeight: rect.height,
    }
  })
  await browser.close()
  console.log(JSON.stringify(tooltipInfo, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
