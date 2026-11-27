import { mkdir } from "node:fs/promises"
import { spawn } from "node:child_process"
import { setTimeout as delay } from "node:timers/promises"
import { chromium } from "@playwright/test"

const baseUrl = process.env.DIAGRAM_DEMO_URL ?? "http://127.0.0.1:5181"
const artifactDir = process.env.DIAGRAM_ARTIFACT_DIR ?? "artifacts/diagram-drag-preview"
let server
let browser
const results = []
const committedModeX = {}
const check = async (id, run) => {
  try { await run(); results.push({ id, status: "PASS" }) }
  catch (error) { results.push({ id, status: "FAIL", error: String(error) }) }
}
const assert = (condition, message) => { if (!condition) throw new Error(message) }
try {
  try { if (!(await fetch(`${baseUrl}/diagram`)).ok) throw new Error() } catch {
    const url = new URL(baseUrl)
    server = spawn("pnpm", ["--dir", "packages/demo-vue", "dev", "--host", url.hostname, "--port", url.port || "5181", "--strictPort"], { cwd: process.cwd(), stdio: "ignore" })
    let ready = false
    for (let index = 0; index < 100; index += 1) {
      try { ready = (await fetch(`${baseUrl}/diagram`)).ok } catch {}
      if (ready) break
      await delay(250)
    }
    if (!ready) throw new Error(`Diagram demo failed to start at ${baseUrl}`)
  }
  await mkdir(artifactDir, { recursive: true })
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } })
  await context.tracing.start({ screenshots: true, snapshots: true, sources: false })
  const page = await context.newPage()
  page.setDefaultTimeout(8000)
  await page.goto(`${baseUrl}/diagram`, { waitUntil: "domcontentloaded" })
  await page.locator(".diagram-svg").waitFor()
  await page.getByTestId("drag-fixture-simple").click()
  const entity = (id) => page.locator(`[data-diagram-id="${id}"]`)
  const screenPoint = async (id) => entity(id).evaluate((element) => {
    const box = element.getBBox()
    const matrix = element.getScreenCTM()
    const point = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2).matrixTransform(matrix)
    return { x: point.x, y: point.y }
  })
  const screenWorldPoint = async (x, y) => page.locator(".diagram-svg").evaluate((svg, point) => {
    const matrix = svg.getScreenCTM()
    if (!matrix) throw new Error("canvas has no screen transform")
    const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix)
    return { x: screen.x, y: screen.y }
  }, { x, y })
  const drag = async (id, dx, dy) => {
    const point = await screenPoint(id)
    await page.mouse.move(point.x, point.y)
    await page.mouse.down()
    await page.mouse.move(point.x + dx, point.y + dy, { steps: 5 })
    await page.waitForTimeout(50)
  }
  const finish = async () => { await page.mouse.up(); await page.waitForTimeout(40) }
  const choose = (mode) => page.getByTestId("drag-preview-mode").selectOption(mode)
  await page.screenshot({ path: `${artifactDir}/workbench.png` })

  await check("ghost preserves originals and commits candidate", async () => {
    await choose("ghost")
    const originalX = Number(await entity("preview-simple").getAttribute("x"))
    await drag("preview-simple", 75, 32)
    const originalDuring = Number(await entity("preview-simple").getAttribute("x"))
    const preview = page.locator('.diagram-drag-preview--ghost rect[data-drag-preview="ghost"]').first()
    await preview.waitFor({ state: "attached" })
    const previewX = Number(await preview.getAttribute("x"))
    assert(originalDuring === originalX, `original moved (${originalX} -> ${originalDuring})`)
    assert(previewX !== originalX, `candidate x ${previewX} did not follow pointer from ${originalX}`)
    await page.screenshot({ path: `${artifactDir}/ghost-moving.png` })
    await finish()
    committedModeX.ghost = Number(await entity("preview-simple").getAttribute("x"))
    assert(Math.abs(committedModeX.ghost - previewX) < 1, "committed object differs from last ghost candidate")
    await page.screenshot({ path: `${artifactDir}/ghost-committed.png` })
  })

  await check("outline preserves originals and commits candidate", async () => {
    await page.getByTestId("drag-fixture-reset").click()
    await choose("outline")
    const originalX = Number(await entity("preview-simple").getAttribute("x"))
    await drag("preview-simple", 75, 32)
    const overlay = page.locator('[data-drag-preview="outline"]').first()
    await overlay.waitFor()
    assert(Number(await entity("preview-simple").getAttribute("x")) === originalX, "outline moved original object")
    const candidateX = Number(await overlay.getAttribute("x"))
    assert(candidateX !== originalX, `outline x ${candidateX} did not follow pointer`)
    await page.screenshot({ path: `${artifactDir}/outline-moving.png` })
    await finish()
    const committedX = Number(await entity("preview-simple").getAttribute("x"))
    assert(Math.abs(committedX - candidateX) < 1, `committed geometry x ${committedX} differs from outline candidate x ${candidateX}`)
    committedModeX.outline = committedX
  })

  await check("live remains the default candidate presentation", async () => {
    await page.getByTestId("drag-fixture-reset").click()
    await choose("live")
    const originalX = Number(await entity("preview-simple").getAttribute("x"))
    await drag("preview-simple", 50, 25)
    assert(Number(await entity("preview-simple").getAttribute("x")) !== originalX, "live object did not follow pointer")
    assert(await page.locator("[data-drag-preview]").count() === 0, "live mode created a duplicate preview")
    await page.locator(".diagram-svg").focus()
    await page.keyboard.press("Escape")
    await page.mouse.up()
    assert(Number(await entity("preview-simple").getAttribute("x")) === originalX, "cancel did not restore original geometry")
    await page.getByTestId("drag-fixture-reset").click()
    await drag("preview-simple", 75, 32)
    const liveCandidateX = Number(await entity("preview-simple").getAttribute("x"))
    await finish()
    committedModeX.live = Number(await entity("preview-simple").getAttribute("x"))
    assert(Math.abs(committedModeX.live - liveCandidateX) < 1, "live commit differs from candidate geometry")
    assert(Math.abs(committedModeX.live - committedModeX.ghost) < 1 && Math.abs(committedModeX.live - committedModeX.outline) < 1, `modes committed different x positions ${JSON.stringify(committedModeX)}`)
  })

  await check("ghost candidate includes Core-resolved attached edge geometry", async () => {
    await page.getByTestId("drag-fixture-connected").click()
    await choose("ghost")
    const originalEdge = await entity("preview-connected-edge").getAttribute("points")
    await drag("preview-connected-a", 0, 55)
    const ghostEdge = page.locator('.diagram-drag-preview--ghost polyline[data-drag-preview="ghost"]').first()
    await ghostEdge.waitFor({ state: "attached" })
    assert(await entity("preview-connected-edge").getAttribute("points") === originalEdge, "committed connector geometry changed before commit")
    assert(await ghostEdge.getAttribute("points") !== originalEdge, "candidate connector did not follow its attached object")
    await page.screenshot({ path: `${artifactDir}/connected-ghost.png` })
    await page.keyboard.press("Escape")
    await page.mouse.up()
  })

  await check("ghost and outline preserve originals during real shape resize", async () => {
    await page.getByTestId("drag-fixture-simple").click()
    for (const mode of ["ghost", "outline"]) {
      await choose(mode)
      const shape = entity("preview-simple")
      const initial = await shape.evaluate((element) => Object.fromEntries(["x", "y", "width", "height"].map((key) => [key, Number(element.getAttribute(key))])))
      const handle = await page.locator(".diagram-svg").evaluate((svg, target) => {
        const matrix = svg.getScreenCTM()
        if (!matrix) throw new Error("canvas has no screen transform")
        const circles = [...svg.querySelectorAll("circle.diagram-handle")]
        const found = circles.find((circle) => Math.abs(Number(circle.getAttribute("cx")) - (target.x + target.width)) < 0.1 && Math.abs(Number(circle.getAttribute("cy")) - (target.y + target.height / 2)) < 0.1)
        if (!found) throw new Error("east resize handle missing")
        const point = new DOMPoint(Number(found.getAttribute("cx")), Number(found.getAttribute("cy"))).matrixTransform(matrix)
        return { x: point.x, y: point.y }
      }, initial)
      await page.mouse.move(handle.x, handle.y)
      await page.mouse.down()
      await page.mouse.move(handle.x + 34, handle.y, { steps: 4 })
      await page.waitForTimeout(40)
      const candidate = page.locator(`[data-interaction-preview="${mode}"]`).first()
      await candidate.waitFor()
      const candidateWidth = Number(await candidate.getAttribute("width"))
      assert(Number(await shape.getAttribute("width")) === initial.width, `${mode} changed committed width during preview`)
      assert(candidateWidth > initial.width, `${mode} did not show resized Core candidate`)
      await page.screenshot({ path: `${artifactDir}/${mode}-resize-preview.png` })
      await page.mouse.up()
      await page.waitForTimeout(40)
      assert(Number(await shape.getAttribute("width")) === candidateWidth, `${mode} committed width differs from its candidate`)
      await page.getByLabel("Diagram tools").getByRole("button", { name: "Undo" }).click()
      await page.waitForTimeout(20)
    }
  })

  await check("ghost path vertex editing previews the actual candidate polyline", async () => {
    await page.getByTestId("drag-fixture-path").click()
    await choose("ghost")
    const line = page.locator("polyline.diagram-path-line")
    const original = await line.getAttribute("points")
    const first = original.split(/\s+/)[0].split(",").map(Number)
    const point = await screenWorldPoint(first[0], first[1])
    await page.mouse.move(point.x, point.y)
    await page.mouse.down()
    await page.mouse.move(point.x + 32, point.y + 12, { steps: 4 })
    await page.waitForTimeout(40)
    const preview = page.locator('polyline[data-interaction-preview="ghost"]')
    await preview.waitFor()
    const candidate = await preview.getAttribute("points")
    assert(candidate !== original, "path vertex candidate did not follow the pointer")
    assert(await line.getAttribute("points") === original, "committed path changed during ghost edit")
    await page.screenshot({ path: `${artifactDir}/ghost-path-vertex.png` })
    await page.mouse.up()
    await page.waitForTimeout(40)
    assert(await line.getAttribute("points") === candidate, "committed path differs from the candidate path")
    await page.getByLabel("Diagram tools").getByRole("button", { name: "Undo" }).click()
  })

  await check("nested group and multi-selection use the movement preview", async () => {
    await page.getByTestId("drag-fixture-nested").click()
    await choose("outline")
    await drag("preview-nested-a", 38, 24)
    assert(await page.locator('[data-drag-preview="outline"]').count() >= 2, "nested group members did not produce candidate outlines")
    await page.keyboard.press("Escape"); await page.mouse.up()
    const beforeReset = await entity("preview-nested-a").evaluate((element) => { const box = element.getBoundingClientRect(); return { x: box.x, y: box.y } })
    await page.getByTestId("drag-fixture-nested").click()
    await drag("preview-nested-a", 38, 24)
    await finish()
    await page.getByTestId("drag-fixture-reset").click()
    const afterReset = await entity("preview-nested-a").evaluate((element) => { const box = element.getBoundingClientRect(); return { x: box.x, y: box.y } })
    assert(Math.abs(beforeReset.x - afterReset.x) < 1 && Math.abs(beforeReset.y - afterReset.y) < 1, `nested fixture reset drifted ${JSON.stringify({ beforeReset, afterReset })}`)
    await page.getByTestId("drag-fixture-multi").click()
    await drag("preview-multi-a", 38, 24)
    assert(await page.locator('[data-drag-preview="outline"]').count() >= 2, "multi-selection did not produce candidate outlines")
    await page.screenshot({ path: `${artifactDir}/multi-outline.png` })
    await page.keyboard.press("Escape"); await page.mouse.up()
  })

  await context.tracing.stop({ path: `${artifactDir}/drag-preview-trace.zip` })
  await browser.close(); browser = null
} finally {
  if (browser) await browser.close()
  if (server) { server.kill("SIGTERM"); await new Promise((resolve) => server.once("exit", resolve)) }
}
console.log(JSON.stringify({ results, committedModeX, artifacts: artifactDir }, null, 2))
if (results.some((result) => result.status !== "PASS")) process.exitCode = 1
