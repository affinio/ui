import { chromium } from "@playwright/test"
import { mkdir } from "node:fs/promises"

const baseURL = process.env.DIAGRAM_RULERS_URL ?? "http://127.0.0.1:5173/diagram/rulers"
const artifactDirectory = process.env.DIAGRAM_RULERS_ARTIFACTS ?? "artifacts/diagram-rulers"
await mkdir(artifactDirectory, { recursive: true })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })
const page = await context.newPage()
page.setDefaultTimeout(8000)
const failures = []
const check = async (name, operation) => {
  try { await operation(); console.log(`PASS ${name}`) }
  catch (error) { failures.push(name); console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`) }
}
await context.tracing.start({ screenshots: true, snapshots: true, sources: true })
await page.goto(baseURL, { waitUntil: "networkidle" })
await page.getByRole("heading", { name: "Adaptive rulers and guides" }).waitFor()
await page.screenshot({ path: `${artifactDirectory}/initial.png` })

await check("horizontal and vertical rulers, negative ticks, cursor and selection extent", async () => {
  const horizontal = page.locator('[data-diagram-ruler="x"]')
  const vertical = page.locator('[data-diagram-ruler="y"]')
  await horizontal.waitFor(); await vertical.waitFor()
  const labels = await horizontal.locator("text").allTextContents()
  if (!labels.some((text) => text.trim().startsWith("-"))) throw new Error(`negative horizontal coordinates are not labeled: ${JSON.stringify(labels)}`)
  const canvas = page.getByRole("application", { name: "Diagram canvas" })
  const box = await canvas.boundingBox()
  if (!box) throw new Error("canvas has no visible bounds")
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.locator(".affino-diagram-cursor-indicator").waitFor()
  await page.locator('[data-entity-id="ruler-demo-a"]').click()
  await page.locator(".affino-diagram-selection-extent").waitFor()
  await page.screenshot({ path: `${artifactDirectory}/rulers-selection-cursor.png` })
  const before = await horizontal.locator("text").allTextContents()
  await page.getByRole("button", { name: "Zoom +" }).evaluate((button) => button.click())
  await page.waitForTimeout(40)
  const after = await horizontal.locator("text").allTextContents()
  if (JSON.stringify(before) === JSON.stringify(after)) throw new Error(`tick spacing did not adapt to zoom: ${JSON.stringify(before)} -> ${JSON.stringify(after)}; ${await page.locator(".ruler-page footer").textContent()}`)
  await page.getByRole("button", { name: "Pan ↖" }).evaluate((button) => button.click())
  await page.getByLabel("X origin").fill("35")
  await page.waitForTimeout(30)
  await page.screenshot({ path: `${artifactDirectory}/rulers-zoom-pan-origin.png` })
})

await check("ruler guide creation, guide editing, locking, visibility and undo", async () => {
  const ruler = page.locator('[data-diagram-ruler="x"]')
  const rulerBox = await ruler.boundingBox()
  const canvas = page.getByRole("application", { name: "Diagram canvas" })
  const canvasBox = await canvas.boundingBox()
  if (!rulerBox || !canvasBox) throw new Error("ruler or canvas is not visible")
  await page.mouse.move(rulerBox.x + rulerBox.width * 0.42, rulerBox.y + 12)
  await page.mouse.down()
  await page.mouse.move(rulerBox.x + rulerBox.width * 0.42, canvasBox.y + 150, { steps: 5 })
  if (await page.locator(".affino-diagram-guide-preview").count() !== 1) throw new Error("ruler drag did not show a full-canvas guide preview")
  await page.mouse.up()
  if (await page.locator(".affino-diagram-guide-preview").count() !== 0) throw new Error("guide preview remained after commit")
  const guide = page.locator("[data-guide-id]").last()
  await guide.waitFor({ state: "attached" })
  const originalPosition = await guide.getAttribute("x1")
  const point = await guide.evaluate((element) => {
    const line = element
    const svg = line.ownerSVGElement
    const matrix = svg.getScreenCTM()
    const p = svg.createSVGPoint(); p.x = Number(line.getAttribute("x1")); p.y = 200
    const screen = p.matrixTransform(matrix)
    return { x: screen.x, y: screen.y }
  })
  await page.mouse.move(point.x, point.y); await page.mouse.down(); await page.mouse.move(point.x + 48, point.y, { steps: 4 }); await page.mouse.up()
  await page.waitForTimeout(40)
  if (await guide.getAttribute("x1") === originalPosition) throw new Error("dragging the guide did not change its position")
  const committedPosition = await guide.getAttribute("x1")
  const cancelPoint = await guide.evaluate((element) => {
    const svg = element.ownerSVGElement
    const matrix = svg.getScreenCTM()
    const p = svg.createSVGPoint(); p.x = Number(element.getAttribute("x1")); p.y = 220
    const screen = p.matrixTransform(matrix)
    return { x: screen.x, y: screen.y }
  })
  await page.mouse.move(cancelPoint.x, cancelPoint.y); await page.mouse.down(); await page.mouse.move(cancelPoint.x + 36, cancelPoint.y, { steps: 3 })
  await page.locator(".affino-diagram-guides").dispatchEvent("pointercancel", { pointerId: 1, bubbles: true })
  await page.mouse.up(); await page.waitForTimeout(30)
  if (await guide.getAttribute("x1") !== committedPosition) throw new Error("pointer cancellation committed a guide drag")
  await page.getByRole("button", { name: "Undo" }).click()
  await page.waitForTimeout(30)
  if (await guide.getAttribute("x1") !== originalPosition) throw new Error("guide edit was not undoable")
  await page.screenshot({ path: `${artifactDirectory}/persistent-guide.png` })
})

await check("guide snapping reuses Core snapping and commits selection movement", async () => {
  await page.getByLabel("X origin").fill("0")
  await page.getByLabel("Snap to guides").check()
  await page.locator('[data-entity-id="ruler-demo-a"]').click({ force: true })
  await page.getByRole("button", { name: "Snap selection" }).click()
  await page.waitForTimeout(40)
  const shape = page.locator('[data-entity-id="ruler-demo-a"] rect')
  const x = Number(await shape.getAttribute("x"))
  if (Math.abs(x + 40 - 120) > 1 && Math.abs(x + 180 - 120) > 1 && Math.abs(x + 90 - 120) > 1) {
    // A user-created ruler guide is also eligible; the Core snap can choose the nearest guide.
    const guidePositions = await page.locator("[data-guide-id]").evaluateAll((lines) => lines.map((line) => Number(line.getAttribute("x1"))))
    if (!guidePositions.some((position) => Math.abs(x - position) < 1 || Math.abs(x + 180 - position) < 1)) throw new Error(`selection did not align to any visible Core guide (${await page.locator(".ruler-page footer").textContent()}, x=${x})`)
  }
})

await context.tracing.stop({ path: `${artifactDirectory}/trace.zip` })
await browser.close()
if (failures.length) process.exitCode = 1
