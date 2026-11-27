import { chromium } from "@playwright/test"
import { mkdir } from "node:fs/promises"
import { performance } from "node:perf_hooks"

const baseURL = process.env.DIAGRAM_PRESENTATION_URL ?? "http://127.0.0.1:5173/diagram/presentation"
const artifactDirectory = process.env.DIAGRAM_PRESENTATION_ARTIFACTS ?? "artifacts/diagram-presentation"
await mkdir(artifactDirectory, { recursive: true })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 })
const page = await context.newPage()
page.setDefaultTimeout(8000)
const failures = []
const check = async (name, operation) => {
  try { await operation(); console.log(`PASS ${name}`) }
  catch (error) { failures.push(name); console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`) }
}
await context.tracing.start({ screenshots: true, snapshots: true, sources: true })
const navigationStarted = performance.now()
await page.goto(baseURL, { waitUntil: "domcontentloaded" })
await page.getByRole("heading", { name: "Shared scene presentation" }).waitFor()
console.log(`METRIC browser_initial_ready_ms ${(performance.now() - navigationStarted).toFixed(2)}`)

await check("immutable and editable scenes share one viewport with collision-safe identities", async () => {
  const immutable = page.locator('[data-presentation-source="immutable-template"]')
  await immutable.waitFor()
  if (await immutable.getAttribute("pointer-events") !== "none") throw new Error("immutable group can intercept pointer events")
  if (await page.locator('[data-scene-entity="shared-shape"]').count() !== 1 || await page.locator('[data-foreground-shape="shared-shape"]').count() !== 1) throw new Error("source-local duplicate shape IDs were not both rendered")
  if (await page.locator('[data-presentation-source="immutable-template"] [data-table-cell-text="merged-title"]').count() !== 1) throw new Error("merged logical Cell did not render exactly once")
  const alternate = await page.locator('[data-presentation-context="alternate"]').textContent()
  if (!alternate?.includes("Independent context B") || !alternate.includes("Alternate merged heading")) throw new Error("independent simultaneous presentation context did not render")
  await page.screenshot({ path: `${artifactDirectory}/shared-scenes.png`, fullPage: true })
})

await check("design/preview overrides and return to authoritative presentation", async () => {
  const label = page.locator('[data-scene-entity="template-label"]')
  if (await label.textContent() !== "Resolved template data") throw new Error("presented Text override did not render")
  if (await page.locator('[data-presentation-source="immutable-template"] [data-table-cell-text="merged-title"]').textContent() !== "Resolved merged heading") throw new Error("merged Cell override did not render")
  await page.getByLabel("Template context").selectOption("design")
  if (await label.textContent() !== "Template label") throw new Error("Design content was not restored")
  await page.getByLabel("Template context").selectOption("preview")
  await page.getByRole("button", { name: "Clear overrides" }).evaluate((button) => button.click())
  if (await label.textContent() !== "Template label") throw new Error("clearing overrides did not restore authoritative Text")
  const overrideStarted = performance.now()
  await page.getByRole("button", { name: "Restore preview" }).evaluate((button) => button.click())
  await page.locator('[data-scene-entity="template-label"]').getByText("Resolved template data").waitFor()
  console.log(`METRIC browser_override_to_dom_ms ${(performance.now() - overrideStarted).toFixed(2)}`)
  if (await label.textContent() !== "Resolved template data") throw new Error("preview override did not return")
  await page.screenshot({ path: `${artifactDirectory}/presented-preview.png`, fullPage: true })
})

await check("read-only scene cannot become an editable-scene selection target", async () => {
  const before = (await page.locator(".state").textContent())?.match(/selection: ([^·]+)/)?.[1]?.trim()
  await page.locator('[data-scene-entity="shared-shape"]').click({ force: true })
  const after = (await page.locator(".state").textContent())?.match(/selection: ([^·]+)/)?.[1]?.trim()
  if (before !== after) throw new Error(`background click changed foreground selection: ${before} -> ${after}`)
  await page.keyboard.press("Delete")
  if (await page.locator('[data-scene-entity="shared-shape"]').count() !== 1) throw new Error("read-only scene content was deleted")
})

await check("foreground editing and history remain independent", async () => {
  const foregroundShape = page.locator('[data-foreground-shape="shared-shape"]')
  await foregroundShape.click()
  const before = await foregroundShape.getAttribute("transform")
  await page.getByRole("button", { name: "Move selected foreground shape" }).click()
  const after = await foregroundShape.getAttribute("transform")
  const boundsAfter = await foregroundShape.locator("ellipse").getAttribute("cx")
  if (before === after && boundsAfter === "195") throw new Error("foreground edit did not change geometry")
  await page.getByRole("button", { name: "Undo" }).click()
  await page.getByRole("button", { name: "Redo" }).click()
  if (await page.locator('[data-scene-entity="template-label"]').textContent() !== "Resolved template data") throw new Error("foreground history changed immutable presentation content")
  await page.screenshot({ path: `${artifactDirectory}/foreground-edit-history.png`, fullPage: true })
})

await check("foreground Table remains editable after immutable preview", async () => {
  const cell = page.locator('[data-diagram-id="editable-table"] [data-table-row="0"][data-table-column="0"]')
  await cell.dblclick()
  const editor = page.getByLabel("Edit row 1, column 1")
  await editor.fill("Foreground edited")
  await editor.press("Enter")
  if (await page.locator('[data-table-cell-text="edit-a"]').textContent() !== "Foreground edited") throw new Error("foreground Table edit did not commit")
  await page.screenshot({ path: `${artifactDirectory}/foreground-table-edit.png`, fullPage: true })
})

await check("Chromium Port reposition preview matches one committed anchor change and Undo", async () => {
  const marker = page.locator('[data-port-edit-handle="true"]')
  const before = { cx: Number(await marker.getAttribute("cx")), cy: Number(await marker.getAttribute("cy")) }
  const svg = page.locator(".presentation-stage svg")
  const screenPoint = async (point) => svg.evaluate((element, value) => {
    const screen = new DOMPoint(value.x, value.y).matrixTransform(element.getScreenCTM())
    return { x: screen.x, y: screen.y }
  }, point)
  const start = await screenPoint({ x: before.cx, y: before.cy })
  const target = await screenPoint({ x: before.cx - 20, y: before.cy - 16 })
  const revisionBefore = Number((await page.locator(".state").textContent())?.match(/revision: (\d+)/)?.[1])
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(target.x, target.y, { steps: 5 })
  await page.waitForTimeout(80)
  const preview = page.locator('[data-port-edit-valid="true"]')
  if (await page.locator("[data-port-edit-valid]").count() !== 1) throw new Error(`Port preview missing after drag: ${await page.locator(".state").textContent()}`)
  await preview.waitFor({ state: "visible" })
  const previewPoint = { x: Number(await preview.getAttribute("cx")), y: Number(await preview.getAttribute("cy")) }
  await page.screenshot({ path: `${artifactDirectory}/port-anchor-preview.png`, fullPage: true })
  await page.mouse.up()
  await page.waitForTimeout(40)
  const after = { x: Number(await marker.getAttribute("cx")), y: Number(await marker.getAttribute("cy")) }
  const revisionAfter = Number((await page.locator(".state").textContent())?.match(/revision: (\d+)/)?.[1])
  if (JSON.stringify(after) !== JSON.stringify(previewPoint)) throw new Error(`Port preview/commit mismatch: ${JSON.stringify({ previewPoint, after })}`)
  if (revisionAfter !== revisionBefore + 1) throw new Error(`Port drag did not create one document revision: ${revisionBefore} -> ${revisionAfter}`)
  await page.getByRole("button", { name: "Undo", exact: true }).click()
  if (Number(await marker.getAttribute("cx")) !== before.cx || Number(await marker.getAttribute("cy")) !== before.cy) throw new Error("single Undo did not restore the original Port anchor")
  await page.getByRole("button", { name: "Redo", exact: true }).click()
  if (Number(await marker.getAttribute("cx")) !== previewPoint.x || Number(await marker.getAttribute("cy")) !== previewPoint.y) throw new Error("Redo did not restore the repositioned Port anchor")
  await page.screenshot({ path: `${artifactDirectory}/port-anchor-committed.png`, fullPage: true })
})

await check("shared viewport pan and zoom affect both sources together", async () => {
  const svg = page.locator(".presentation-stage svg")
  const before = await svg.getAttribute("viewBox")
  await page.getByRole("button", { name: "Zoom +" }).click()
  await page.getByRole("button", { name: "Pan ↘" }).click()
  const after = await svg.getAttribute("viewBox")
  if (before === after) throw new Error("shared viewport controls did not change the common viewBox")
  await page.screenshot({ path: `${artifactDirectory}/shared-viewport.png`, fullPage: true })
})

await context.tracing.stop({ path: `${artifactDirectory}/trace.zip` })
await browser.close()
if (failures.length) process.exitCode = 1
