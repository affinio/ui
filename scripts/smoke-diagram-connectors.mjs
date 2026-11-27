import { mkdir, writeFile } from "node:fs/promises"
import { spawn } from "node:child_process"
import { setTimeout as delay } from "node:timers/promises"
import { chromium } from "@playwright/test"

const baseUrl = process.env.DIAGRAM_DEMO_URL ?? "http://127.0.0.1:5179"
const artifactDir = process.env.DIAGRAM_ARTIFACT_DIR ?? "artifacts/diagram-connectors"
const results = []
const browserMetrics = []
let geometryEvidence = null
let server
let browser
const check = (id, name, fn) => results.push({ id, name, fn })
const assert = (ok, message) => { if (!ok) throw new Error(message) }
const parsePoints = (value) => (value ?? "").trim().split(/\s+/).filter(Boolean).map((item) => item.split(",").map(Number))
const orthogonal = (points) => points.every((point, index) => {
  if (index === 0) return Number.isFinite(point.x ?? point[0]) && Number.isFinite(point.y ?? point[1])
  const previous = points[index - 1]
  const x = point.x ?? point[0], y = point.y ?? point[1]
  const px = previous.x ?? previous[0], py = previous.y ?? previous[1]
  return Number.isFinite(x) && Number.isFinite(y) && (Math.abs(x - px) < 1e-5 || Math.abs(y - py) < 1e-5)
})

try {
  try { if (!(await fetch(`${baseUrl}/diagram/connectors`)).ok) throw new Error() } catch {
    const url = new URL(baseUrl)
    server = spawn("pnpm", ["--dir", "packages/demo-vue", "dev", "--host", url.hostname, "--port", url.port || "5179", "--strictPort"], { cwd: process.cwd(), stdio: "ignore" })
    let ready = false
    for (let n = 0; n < 100; n++) {
      try { ready = (await fetch(`${baseUrl}/diagram/connectors`)).ok } catch {}
      if (ready) break
      await delay(250)
    }
    if (!ready) throw new Error(`Connector Workbench did not start at ${baseUrl}`)
  }
  await mkdir(artifactDir, { recursive: true })
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1400, height: 950 }, deviceScaleFactor: 1 })
  await context.tracing.start({ screenshots: true, snapshots: true, sources: false })
  const page = await context.newPage()
  await page.goto(`${baseUrl}/diagram/connectors`, { waitUntil: "domcontentloaded" })
  await page.locator(".workbench-stage").waitFor()
  page.setDefaultTimeout(2500)
  await page.screenshot({ path: `${artifactDir}/connector-workbench.png` })
  const stageBox = async () => page.locator(".workbench-stage").boundingBox()
  const xy = async (x, y) => page.locator(".workbench-stage").evaluate((svg, point) => { const screen = new DOMPoint(point.x, point.y).matrixTransform(svg.getScreenCTM()); return { x: screen.x, y: screen.y } }, { x, y })
  const fixture = async (name) => { await page.getByTestId("fixture-select").selectOption(name); await page.getByRole("button", { name: "Reset fixture" }).click(); await page.waitForTimeout(30) }
  const route = async (id = null) => parsePoints(await (id ? page.getByTestId(`edge-${id}`) : page.locator("[data-edge-id]").last().locator("polyline")).getAttribute("points"))
  const workbench = async (method, args = []) => page.evaluate(({ name, values }) => window.__affinoConnectorAcceptance[name](...values), { name: method, values: args })
  const draw = async (points, { jitter = false, screenshots = [] } = {}) => {
    await page.getByRole("button", { name: "Connector", exact: true }).click()
    const start = await xy(...points[0]); await page.mouse.move(start.x, start.y); await page.mouse.down()
    for (let i = 1; i < points.length; i++) {
      if (jitter && i === 1) for (const [dx, dy] of [[2, 3], [-2, -2], [3, 1], [0, 0]]) { const p = await xy(points[i][0] + dx, points[i][1] + dy); await page.mouse.move(p.x, p.y); await page.waitForTimeout(15) }
      const p = await xy(...points[i]); await page.mouse.move(p.x, p.y, { steps: 4 }); await page.waitForTimeout(35)
      if (screenshots.includes(i)) await page.screenshot({ path: `${artifactDir}/ghost-${i}.png` })
    }
    const ghost = page.getByTestId("connector-ghost")
    await ghost.waitFor({ state: "attached" })
    const preview = parsePoints(await ghost.getAttribute("points"))
    await page.mouse.up(); await page.waitForTimeout(50)
    const committed = await route()
    const equal = await page.getByTestId("preview-commit-equality").innerText()
    const edgeGroup = page.locator("[data-edge-id]").last()
    const edge = edgeGroup.locator("polyline").first()
    geometryEvidence = {
      previewPoints: preview,
      committedPoints: committed,
      previewSourceEndpoint: preview[0] ?? null,
      committedSourceEndpoint: committed[0] ?? null,
      previewTargetEndpoint: preview.at(-1) ?? null,
      committedTargetEndpoint: committed.at(-1) ?? null,
      sourceBinding: { kind: await edge.getAttribute("data-source-kind"), reference: await edge.getAttribute("data-source-ref") },
      targetBinding: { kind: await edge.getAttribute("data-target-kind"), reference: await edge.getAttribute("data-target-ref") },
      orthogonal: orthogonal(preview) && orthogonal(committed),
      previewEqualsCommit: equal === "true",
    }
    return { preview, committed, equal }
  }
  const captureEditEvidence = async (scenarioId, edgeId) => {
    const hook=page.getByTestId("preview-commit-evidence"), edge=page.getByTestId(`edge-${edgeId}`)
    const previewPoints=JSON.parse(await hook.getAttribute("data-preview-points")||"[]"), committedPoints=JSON.parse(await hook.getAttribute("data-committed-points")||"[]")
    const endpoints=JSON.parse(await hook.getAttribute("data-preview-endpoints")||"null")
    geometryEvidence={scenarioId,previewPoints,committedPoints,previewSourceEndpoint:previewPoints[0]??null,committedSourceEndpoint:committedPoints[0]??null,previewTargetEndpoint:previewPoints.at(-1)??null,committedTargetEndpoint:committedPoints.at(-1)??null,previewSourceBinding:endpoints?.source??null,previewTargetBinding:endpoints?.target??null,committedSourceBinding:{kind:await edge.getAttribute("data-source-kind"),reference:await edge.getAttribute("data-source-ref")},committedTargetBinding:{kind:await edge.getAttribute("data-target-kind"),reference:await edge.getAttribute("data-target-ref")},orthogonal:orthogonal(previewPoints)&&orthogonal(committedPoints),previewEqualsCommit:await hook.getAttribute("data-preview-equals-commit")==="true"}
  }
  const drag = async (from, to, steps = 5) => { const a = await xy(...from), b = await xy(...to); await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps }); await page.waitForTimeout(40); return page.locator(".connector-ghost") }
  const measureInteraction = async (name, action) => {
    const started = await page.evaluate(() => performance.now())
    await action()
    const elapsedMs = await page.evaluate(async (start) => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      return performance.now() - start
    }, started)
    browserMetrics.push({ name, elapsedMs: Number(elapsedMs.toFixed(3)), method: "Playwright pointer action to two browser animation frames" })
  }

  check("R2-UI01", "free straight drag create", async () => { await fixture("empty"); const r = await draw([[100,100],[250,100]], { screenshots: [1] }); assert(r.committed.length === 2 && orthogonal(r.committed), `route ${JSON.stringify(r.committed)}`); assert(r.equal === "true", "preview differs from commit"); await page.screenshot({ path: `${artifactDir}/committed-straight.png` }) })
  check("R2-UI02", "free vertical drag create", async () => { await fixture("empty"); const r = await draw([[100,100],[100,260]]); assert(r.committed.length === 2 && orthogonal(r.committed), `route ${JSON.stringify(r.committed)}`); assert(r.equal === "true", "preview differs from commit") })
  check("R2-UI03", "intentional L route", async () => { await fixture("empty"); const r = await draw([[100,100],[230,100],[230,230]], { screenshots: [1,2] }); assert(r.committed.length === 3 && orthogonal(r.committed), `route ${JSON.stringify(r.committed)}`); assert(r.equal === "true", "preview differs from commit") })
  check("R2-UI04", "pointer direction changes retain multiple bends", async () => { await fixture("empty"); const r = await draw([[90,90],[200,90],[200,180],[340,180]], { screenshots: [1,2,3] }); assert(r.committed.length === 4 && orthogonal(r.committed), `route ${JSON.stringify(r.committed)}`); assert(r.equal === "true", "preview differs from commit"); await page.screenshot({ path: `${artifactDir}/committed-multi-bend.png` }) })
  check("R2-UI05", "pointer jitter does not add bends", async () => { await fixture("empty"); const r = await draw([[100,100],[250,100]], { jitter: true }); assert(r.committed.length === 2, `jitter route ${JSON.stringify(r.committed)}`) })
  check("R2-UI06", "backtrack removes last intended bend", async () => { await fixture("empty"); const r = await draw([[100,100],[220,100],[220,180],[205,100]]); assert(orthogonal(r.committed) && r.committed.length <= 3, `backtrack route ${JSON.stringify(r.committed)}`) })
  check("R2-UI07", "port to port creation", async () => { await fixture("horizontal"); const r = await draw([[210,185],[460,195]]); assert(r.committed.length >= 2 && orthogonal(r.committed), `route ${JSON.stringify(r.committed)}`); assert(Math.abs(r.committed[0][0]-210)<1e-4 && Math.abs(r.committed.at(-1)[0]-460)<1e-4, `not port attached ${JSON.stringify(r.committed)}`); assert(r.equal === "true", "preview differs from commit"); await page.screenshot({ path: `${artifactDir}/port-to-port.png` }) })
  check("R2-UI08", "port to free creation", async () => { await fixture("free"); const r = await draw([[210,185],[680,410]]); assert(orthogonal(r.committed) && Math.abs(r.committed[0][0]-210)<1e-4, `route ${JSON.stringify(r.committed)}`) })
  check("R2-UI09", "free to port creation", async () => { await fixture("free"); const r = await draw([[100,100],[460,185]]); const id=await page.locator("[data-edge-id]").last().getAttribute("data-edge-id"); assert(orthogonal(r.committed) && await page.getByTestId(`edge-${id}`).getAttribute("data-target-ref")==="port-b", "free endpoint did not attach to port") })
  check("R2-UI26", "overlapping routes remain independently selectable", async () => { await fixture("stacked"); const first=JSON.stringify(await route("fixture-wire")),second=JSON.stringify(await route("stacked-wire")); assert(first===second, "stacked routes were separated"); await page.screenshot({path:`${artifactDir}/stacked-connectors.png`}); await page.getByTestId("select-fixture-wire").click(); assert(await page.locator(".endpoint-handle").count() === 2, "first edge not selected"); await page.screenshot({path:`${artifactDir}/stacked-first-selected.png`}); await page.getByTestId("select-stacked-wire").click(); assert(await page.locator(".endpoint-handle").count() === 2, "second edge inaccessible"); await page.screenshot({path:`${artifactDir}/stacked-second-selected.png`}) })
  check("R2-UI31", "Escape cancels creation", async () => { await fixture("empty"); await page.getByRole("button", { name: "Connector", exact: true }).click(); const p = await xy(100,100); await page.mouse.move(p.x,p.y); await page.mouse.down(); const q = await xy(200,100); await page.mouse.move(q.x,q.y); await page.keyboard.press("Escape"); await page.mouse.up(); assert(await page.locator("[data-edge-id]").count() === 0 && await page.locator(".connector-ghost").count() === 0, "cancel left connector or ghost") })
  check("R2-UI15", "drag vertical segment horizontally with preview and commit", async () => { await fixture("manual"); await page.getByTestId("select-fixture-wire").click(); const before = await route("fixture-wire"); const handle = page.getByTestId("segment-fixture-wire-1"); const rect = await handle.boundingBox(); assert(rect, "middle segment handle missing"); await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2); await page.mouse.down(); await page.mouse.move(rect.x+rect.width/2+50,rect.y+rect.height/2,{steps:5}); await page.waitForTimeout(50); const ghost=page.locator(".connector-ghost"); await ghost.waitFor({ state: "attached" }); const preview=parsePoints(await ghost.getAttribute("points")); await page.screenshot({path:`${artifactDir}/segment-drag-ghost.png`}); await page.mouse.up(); await page.waitForTimeout(40); const after=await route("fixture-wire"); assert(orthogonal(preview)&&orthogonal(after), `non-orthogonal ${JSON.stringify({preview,after})}`); assert(await page.getByTestId("preview-commit-equality").innerText()==="true", "segment preview differs from commit"); assert(JSON.stringify(before)!==JSON.stringify(after), "segment did not move") })
  check("R2-UI16", "drag horizontal segment vertically with local preview", async () => { await fixture("manual"); await page.getByTestId("select-fixture-wire").click(); const before=await route("fixture-wire"), h=await page.getByTestId("segment-fixture-wire-2").boundingBox(); await page.mouse.move(h.x+h.width/2,h.y+h.height/2); await page.mouse.down(); await page.mouse.move(h.x+h.width/2,h.y+h.height/2+35,{steps:4}); await page.waitForTimeout(40); const preview=parsePoints(await page.getByTestId("connector-edit-ghost").getAttribute("points")); await page.mouse.up(); await page.waitForTimeout(35); const after=await route("fixture-wire"); assert(orthogonal(preview)&&orthogonal(after)&&JSON.stringify(before)!==JSON.stringify(after), "horizontal segment edit invalid"); assert(await page.getByTestId("preview-commit-equality").innerText()==="true", "segment preview differs from commit") })
  check("R2-UI10", "free endpoint attaches to exact port and preserves identity", async () => {
    await fixture("free"); await draw([[100,100],[300,100]]); const id = await page.locator("[data-edge-id]").last().getAttribute("data-edge-id"); await page.getByTestId(`select-${id}`).click();
    const h = await page.getByTestId(`source-${id}`).boundingBox(), target = await xy(210,185); await page.mouse.move(h.x+h.width/2,h.y+h.height/2); await page.mouse.down(); await page.mouse.move(target.x,target.y,{steps:5}); await page.waitForTimeout(40); await page.locator("[data-testid='connector-edit-ghost']").waitFor({state:"attached"}); await page.screenshot({path:`${artifactDir}/endpoint-snap-ghost.png`}); await page.mouse.up(); await page.waitForTimeout(40);
    const edge = page.getByTestId(`edge-${id}`); assert(await edge.getAttribute("data-source-kind")==="port" && await edge.getAttribute("data-source-ref")==="port-a", `source not attached to port: ${id}`); assert(await page.getByTestId("preview-commit-equality").innerText()==="true", "endpoint preview differs from commit"); await captureEditEvidence("R2-UI10",id);
  })
  check("R2-UI11", "attach target endpoint to aligned port and simplify straight", async () => {
    await fixture("free"); await draw([[210,185],[330,185]]); const id=await page.locator("[data-edge-id]").last().getAttribute("data-edge-id"); await page.getByTestId(`select-${id}`).click(); let h=await page.getByTestId(`target-${id}`).boundingBox(), p=await xy(460,185); await page.mouse.move(h.x+h.width/2,h.y+h.height/2); await page.mouse.down(); await page.mouse.move(p.x,p.y,{steps:5}); await page.waitForTimeout(35); await page.mouse.up(); await page.waitForTimeout(35); const pts=await route(id); assert(pts.length===2 && orthogonal(pts), `aligned attached connector was not straight: ${JSON.stringify(pts)}`); assert(await page.getByTestId(`edge-${id}`).getAttribute("data-target-ref")==="port-b", "target not attached"); assert(await page.getByTestId("preview-commit-equality").innerText()==="true", "preview differs after target attachment"); await captureEditEvidence("R2-UI11",id)
  })
  check("R2-UI13", "detach target while preserving source", async () => { await fixture("horizontal"); const id="fixture-wire", source=await page.getByTestId(`edge-${id}`).getAttribute("data-source-ref"); await page.getByTestId(`select-${id}`).click(); let h=await page.getByTestId(`target-${id}`).boundingBox(),p=await xy(700,410); await page.mouse.move(h.x+h.width/2,h.y+h.height/2); await page.mouse.down(); await page.mouse.move(p.x,p.y,{steps:5}); await page.mouse.up(); await page.waitForTimeout(30); const edge=page.getByTestId(`edge-${id}`); assert(await edge.getAttribute("data-target-kind")==="point" && await edge.getAttribute("data-source-ref")===source, "target detachment changed wrong endpoint"); await captureEditEvidence("R2-UI13",id) })
  check("R2-UI12", "detach source and reconnect without replacing edge", async () => {
    await fixture("horizontal"); const id="fixture-wire"; await page.getByTestId(`select-${id}`).click(); let h=await page.getByTestId(`source-${id}`).boundingBox(), p=await xy(80,80); await page.mouse.move(h.x+h.width/2,h.y+h.height/2); await page.mouse.down(); await page.mouse.move(p.x,p.y,{steps:5}); await page.waitForTimeout(40); await page.mouse.up(); await page.waitForTimeout(30); let edge=page.getByTestId(`edge-${id}`); assert(await edge.getAttribute("data-source-kind")==="point", "source did not detach");
    h=await page.getByTestId(`source-${id}`).boundingBox(); p=await xy(460,195); await page.mouse.move(h.x+h.width/2,h.y+h.height/2); await page.mouse.down(); await page.mouse.move(p.x,p.y,{steps:5}); await page.waitForTimeout(35); await page.screenshot({path:`${artifactDir}/reconnect-ghost.png`}); await page.mouse.up(); await page.waitForTimeout(35); edge=page.getByTestId(`edge-${id}`); assert(await edge.getAttribute("data-source-kind")==="port" && await edge.getAttribute("data-source-ref")==="port-b", "source did not reconnect"); assert(await edge.getAttribute("data-target-ref")==="port-b", "opposite endpoint changed unexpectedly"); await captureEditEvidence("R2-UI12",id);
  })
  check("R2-UI17", "source terminal segment handle is locked at the attached port", async () => { await fixture("manual"); await page.getByTestId("select-fixture-wire").click(); assert(await page.getByTestId("segment-fixture-wire-0").count() === 0, "source terminal segment should not expose a drag handle") })
  check("R2-UI18", "target terminal segment handle is locked at the attached port", async () => { await fixture("manual"); await page.getByTestId("select-fixture-wire").click(); assert(await page.getByTestId("segment-fixture-wire-3").count() === 0, "target terminal segment should not expose a drag handle") })
  check("R2-UI19", "drag a straight free connector segment orthogonally", async () => { await fixture("empty"); await draw([[100,150],[500,150]]); const id=await page.locator("[data-edge-id]").last().getAttribute("data-edge-id"); await page.getByTestId(`select-${id}`).click(); const h=await page.getByTestId(`segment-${id}-0`).boundingBox(); await page.mouse.move(h.x+h.width/2,h.y+h.height/2); await page.mouse.down(); await page.mouse.move(h.x+h.width/2,h.y+h.height/2+40,{steps:4}); await page.waitForTimeout(30); const preview=parsePoints(await page.getByTestId("connector-edit-ghost").getAttribute("points")); await page.mouse.up(); assert(orthogonal(preview)&&orthogonal(await route(id)), "straight segment drag introduced diagonal geometry") })
  check("R2-UI22", "alignment snap commits exact port alignment and simplifies route", async () => {
    await fixture("offset"); await page.getByRole("button", { name: "Select", exact: true }).click()
    const start = await xy(495, 315), end = await xy(495, 185)
    await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 1 }); await page.waitForTimeout(25)
    const previewY = Number(await page.locator('[data-port-id="port-b"]').getAttribute("cy"))
    const previewNodeY = Number(await page.locator('[data-node-id="host-b"]').getAttribute("data-world-y"))
    const snapResult = await page.getByTestId("snap-debug").getAttribute("data-result")
    const previewRoute = await route("fixture-wire")
    await page.mouse.up(); await page.waitForTimeout(35)
    const committedY = Number(await page.locator('[data-port-id="port-b"]').getAttribute("cy"))
    const committedNodeY = Number(await page.locator('[data-node-id="host-b"]').getAttribute("data-world-y"))
    const pts = await route("fixture-wire")
    geometryEvidence = { scenarioId: "R2-UI22", previewPoints: previewRoute, committedPoints: pts, previewPortY: previewY, committedPortY: committedY, previewNodeY, committedNodeY, snapResult, orthogonal: orthogonal(pts), previewEqualsCommit: JSON.stringify(previewRoute) === JSON.stringify(pts) }
    assert(previewY === 185 && committedY === 185 && previewNodeY === 150 && committedNodeY === 150, `alignment snap drift: ${JSON.stringify({ previewY, committedY, previewNodeY, committedNodeY, snapResult })}`)
    assert(pts.length === 2 && orthogonal(pts) && JSON.stringify(previewRoute) === JSON.stringify(pts), `aligned route should preview and commit straight: ${JSON.stringify({ previewRoute, pts })}`)
    const zoomPrecisionEvidence = []
    const moveHostTop = async (top) => {
      const startingTop = Number(await page.locator('[data-node-id="host-b"]').getAttribute('data-world-y'))
      const rect = await page.locator('[data-node-id="host-b"] rect').boundingBox(), from = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }, to = await xy(495, top + 35)
      const traceToken = `${Date.now()}-${Math.random()}`
      await page.evaluate((token) => {
        const svg = document.querySelector('.workbench-stage')
        const events = []
        const listener = (event) => {
          if (event.type !== 'pointerdown' && event.type !== 'pointerup') return
          const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.getScreenCTM().inverse())
          events.push({ type: event.type, client: { x: event.clientX, y: event.clientY }, world: { x: point.x, y: point.y } })
        }
        svg.addEventListener('pointerdown', listener, true)
        svg.addEventListener('pointerup', listener, true)
        window.__diagramDragTraces ??= new Map()
        window.__diagramDragTraces.set(token, { svg, listener, events })
      }, traceToken)
      await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 2 }); await page.mouse.up(); await page.waitForTimeout(25)
      const trace = await page.evaluate((token) => {
        const entry = window.__diagramDragTraces.get(token)
        entry.svg.removeEventListener('pointerdown', entry.listener, true)
        entry.svg.removeEventListener('pointerup', entry.listener, true)
        window.__diagramDragTraces.delete(token)
        return entry.events
      }, traceToken)
      const committedTop = Number(await page.locator('[data-node-id="host-b"]').getAttribute("data-world-y"))
      const startPointer = trace.find((event) => event.type === 'pointerdown')
      const endPointer = trace.find((event) => event.type === 'pointerup')
      const inputDeltaY = startPointer && endPointer ? endPointer.world.y - startPointer.world.y : NaN
      const requestedFromWorld = await page.locator('.workbench-stage').evaluate((svg, point) => {
        const world = new DOMPoint(point.x, point.y).matrixTransform(svg.getScreenCTM().inverse())
        return { x: world.x, y: world.y }
      }, from)
      // Browser layout bounds can be fractional and are the actual source of the drag start.
      // Compare committed geometry with the event coordinates after the same SVG inverse transform Core receives.
      return { top: committedTop, startingTop, route: await route("fixture-wire"), requestedTop: top, requestedScreen: { from, to }, requestedFromWorld, expectedFromWorld: { x: 495, y: startingTop + 35 }, requestedFromWorldErrorY: requestedFromWorld.y - (startingTop + 35), requestedToWorld: { x: 495, y: top + 35 }, inputDeltaY, expectedTopFromDeliveredInput: startingTop + inputDeltaY, pointerTrace: trace }
    }
    const away = await moveHostTop(260), returned = await moveHostTop(150)
    assert(Math.abs(away.top - 260) < 0.001 && away.route.length > 2, `moving away did not restore an offset route: ${JSON.stringify(away)}`)
    assert(returned.top === 150 && returned.route.length === 2, `realignment did not simplify: ${JSON.stringify(returned)}`)
    const stage = await stageBox()
    for (const [delta, awayTop] of [[150, 170], [-300, 175]]) {
      await page.keyboard.down("Control"); await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2); await page.mouse.wheel(0, delta); await page.keyboard.up("Control"); await page.waitForTimeout(60)
      const zoomAway = await moveHostTop(awayTop), zoomBack = await moveHostTop(150)
      zoomPrecisionEvidence.push({ zoomDelta: delta, requestedTop: awayTop, ...zoomAway, zoomBackTop: zoomBack.top })
      assert(Math.abs(zoomAway.top - zoomAway.expectedTopFromDeliveredInput) < 1e-6 && zoomAway.route.length > 2 && zoomBack.top === 150 && zoomBack.route.length === 2, `alignment was inconsistent at zoom: ${JSON.stringify({ delta, zoomAway, zoomBack })}`)
    }
    for (let index = 0; index < 8; index += 1) {
      await moveHostTop(163)
      const stable = await moveHostTop(150)
      assert(stable.top === 150 && stable.route.length === 2, `alignment drifted on repetition ${index}: ${JSON.stringify(stable)}`)
    }
    geometryEvidence.zoomPrecisionEvidence = zoomPrecisionEvidence
    await page.screenshot({ path: `${artifactDir}/aligned-straight-committed.png` })
  })
  check("R2-UI23", "manual route keeps interior bends while host moves", async () => { await fixture("manual"); const before=await route("fixture-wire"); await page.getByRole("button",{name:"Select",exact:true}).click(); const b=await page.locator('[data-node-id="host-a"] rect').boundingBox(); await page.mouse.move(b.x+b.width/2,b.y+b.height/2); await page.mouse.down(); await page.mouse.move(b.x+b.width/2+25,b.y+b.height/2+20,{steps:4}); await page.waitForTimeout(30); await page.mouse.up(); await page.waitForTimeout(30); const after=await route("fixture-wire"); assert(orthogonal(after)&&after.some(p=>p[0]===before[2][0]&&p[1]===before[2][1]), "manual interior bend was not preserved"); assert(await page.getByTestId("preview-commit-equality").innerText()==="true", "manual connected-object preview differs from commit"); await captureEditEvidence("R2-UI23","fixture-wire") })
  check("R2-UI21", "attached object movement keeps route orthogonal", async () => {
    await fixture("horizontal"); const before=await route("fixture-wire"); await page.getByRole("button",{name:"Select",exact:true}).click(); const node=page.locator('[data-node-id="host-a"] rect').boundingBox(); const b=await node; const p0={x:b.x+b.width/2,y:b.y+b.height/2}; await page.mouse.move(p0.x,p0.y); await page.mouse.down(); await page.mouse.move(p0.x+25,p0.y+30,{steps:5}); await page.waitForTimeout(30); const during=await route("fixture-wire"); assert(orthogonal(during), `object drag route ${JSON.stringify(during)}`); await page.mouse.up(); const after=await route("fixture-wire"); assert(orthogonal(after) && JSON.stringify(before)!==JSON.stringify(after), "attached route did not follow moved object"); assert(await page.getByTestId("preview-commit-equality").innerText()==="true", "automatic connected-object preview differs from commit"); await captureEditEvidence("R2-UI21","fixture-wire")
  })
  check("R2-UI42", "unrelated object fixture leaves simple route unchanged", async () => { await fixture("free"); const before=await route("fixture-free-wire"); await page.getByRole("button",{name:"Select",exact:true}).click(); const b=await page.locator('[data-node-id="host-a"] rect').boundingBox(), stage=await stageBox(); await page.mouse.move(b.x+b.width/2,b.y+b.height/2); await page.mouse.down(); await page.mouse.move(b.x+b.width/2+500,b.y+b.height/2+200,{steps:6}); const during=await route("fixture-free-wire"); assert(JSON.stringify(during)===JSON.stringify(before), "unrelated preview moved simple connector"); await page.mouse.up(); assert(JSON.stringify(await route("fixture-free-wire"))===JSON.stringify(before), "unrelated object rerouted simple connector") })
  check("R2-UI24", "rotate connected object and preserve orthogonal route", async () => { await fixture("transformed"); await page.getByTestId("select-host-a").click(); await page.getByRole("button",{name:"Rotate selected object"}).click(); const pts=await route("fixture-wire"); assert(orthogonal(pts)&&await page.getByTestId("edge-fixture-wire").getAttribute("data-source-ref")==="port-a", `rotated route ${JSON.stringify(pts)}`) })
  check("R2-UI25", "reflect connected object and preserve orthogonal route", async () => { await fixture("transformed"); await page.getByTestId("select-host-b").click(); await page.getByRole("button",{name:"Reflect selected object"}).click(); const pts=await route("fixture-wire"); assert(orthogonal(pts)&&await page.getByTestId("edge-fixture-wire").getAttribute("data-target-ref")==="port-b", `reflected route ${JSON.stringify(pts)}`) })
  check("R2-UI28", "endpoint snaps geometrically to connector without implicit junction", async () => { await fixture("empty"); await draw([[100,200],[600,200]]); await draw([[100,300],[350,300]]); const id=await page.locator("[data-edge-id]").last().getAttribute("data-edge-id"); await page.getByTestId(`select-${id}`).click(); let h=await page.getByTestId(`target-${id}`).boundingBox(), p=await xy(350,200); await page.mouse.move(h.x+h.width/2,h.y+h.height/2); await page.mouse.down(); await page.mouse.move(p.x,p.y,{steps:5}); await page.waitForTimeout(35); const candidate=await page.getByTestId("connector-debug").count(); await page.mouse.up(); const edge=page.getByTestId(`edge-${id}`); assert(await edge.getAttribute("data-target-kind")==="point" && await page.locator("[data-junction-id]").count()===0, "geometric segment snap created topology") })
  check("R2-UI29", "independent connectors cross without junction", async () => { await fixture("empty"); await draw([[100,200],[600,200]]); const r=await draw([[350,100],[350,400]]); assert(orthogonal(r.committed)&&await page.locator("[data-junction-id]").count()===0, "crossing created junction or diagonal route") })
  check("R2-UI20", "collapse adjacent manual segments without diagonal geometry", async () => { await fixture("manual"); await page.getByTestId("select-fixture-wire").click(); const before=await route("fixture-wire"), start=await xy(330,267.5),end=await xy(460,267.5); await page.mouse.move(start.x,start.y); await page.mouse.down(); await page.mouse.move(end.x,end.y,{steps:6}); await page.waitForTimeout(35); const preview=parsePoints(await page.getByTestId("connector-edit-ghost").getAttribute("points")); await page.mouse.up(); await page.waitForTimeout(30); const after=await route("fixture-wire"); assert(orthogonal(preview)&&orthogonal(after)&&await page.getByTestId("edge-fixture-wire").getAttribute("data-source-ref")==="port-a"&&await page.getByTestId("edge-fixture-wire").getAttribute("data-target-ref")==="port-b", `collapsed route invalid: ${JSON.stringify({before,preview,after})}`) })
  check("R2-UI34", "tool switch cancels an active creation", async () => { await fixture("empty"); await page.getByRole("button",{name:"Connector",exact:true}).click(); const p=await xy(100,100),q=await xy(220,100); await page.mouse.move(p.x,p.y); await page.mouse.down(); await page.mouse.move(q.x,q.y); await page.getByRole("button",{name:"Select",exact:true}).evaluate((button)=>button.click()); await page.mouse.up(); assert(await page.locator("[data-edge-id]").count()===0&&await page.locator(".connector-ghost").count()===0, "tool switch left a connector or ghost") })
  check("R2-UI35", "lost pointer capture clears ghost state", async () => { await fixture("empty"); await page.getByRole("button",{name:"Connector",exact:true}).click(); const p=await xy(100,100),q=await xy(220,100); await page.mouse.move(p.x,p.y); await page.mouse.down(); await page.mouse.move(q.x,q.y); await page.locator(".workbench-stage").dispatchEvent("lostpointercapture"); await page.mouse.up(); assert(await page.locator("[data-edge-id]").count()===0&&await page.locator(".connector-ghost").count()===0, "lost capture left transient state") })
  check("R2-UI36", "undo and redo connector creation", async () => { await fixture("empty"); await draw([[100,100],[300,100]]); assert(await page.locator("[data-edge-id]").count()===1, "creation missing"); await page.getByRole("button",{name:"Undo",exact:true}).click(); assert(await page.locator("[data-edge-id]").count()===0, "undo did not remove created edge"); await page.getByRole("button",{name:"Redo",exact:true}).click(); assert(await page.locator("[data-edge-id]").count()===1, "redo did not restore edge") })
  check("R2-UI37", "undo and redo segment edit", async () => { await fixture("manual"); await page.getByTestId("select-fixture-wire").click(); const before=JSON.stringify(await route("fixture-wire")),h=await page.getByTestId("segment-fixture-wire-1").boundingBox(); await page.mouse.move(h.x+h.width/2,h.y+h.height/2); await page.mouse.down(); await page.mouse.move(h.x+h.width/2+40,h.y+h.height/2,{steps:4}); await page.mouse.up(); const after=JSON.stringify(await route("fixture-wire")); await page.getByRole("button",{name:"Undo",exact:true}).click(); assert(JSON.stringify(await route("fixture-wire"))===before, "undo did not restore route"); await page.getByRole("button",{name:"Redo",exact:true}).click(); assert(JSON.stringify(await route("fixture-wire"))===after, "redo did not restore edit") })
  check("R2-UI38", "undo and redo endpoint attachment", async () => { await fixture("free"); await draw([[100,100],[300,100]]); const id=await page.locator("[data-edge-id]").last().getAttribute("data-edge-id"); await page.getByTestId(`select-${id}`).click(); let h=await page.getByTestId(`source-${id}`).boundingBox(),p=await xy(210,185); await page.mouse.move(h.x+h.width/2,h.y+h.height/2); await page.mouse.down(); await page.mouse.move(p.x,p.y,{steps:4}); await page.mouse.up(); await page.waitForTimeout(30); assert(await page.getByTestId(`edge-${id}`).getAttribute("data-source-kind")==="port", "attachment missing"); await page.getByRole("button",{name:"Undo",exact:true}).click(); assert(await page.getByTestId(`edge-${id}`).getAttribute("data-source-kind")==="point", "undo did not restore free endpoint"); await page.getByRole("button",{name:"Redo",exact:true}).click(); assert(await page.getByTestId(`edge-${id}`).getAttribute("data-source-kind")==="port", "redo did not restore attachment") })
  check("R2-UI39", "reset manual route returns to automatic ownership", async () => { await fixture("manual"); await page.getByTestId("select-fixture-wire").click(); await page.getByRole("button",{name:"Reset Route"}).click(); assert(await page.getByTestId("edge-fixture-wire").getAttribute("data-routing-mode")==="auto", "reset route did not set automatic ownership") })
  check("R2-UI32", "Escape cancels segment drag and restores route", async () => { await fixture("manual"); await page.getByTestId("select-fixture-wire").click(); const before=JSON.stringify(await route("fixture-wire")),h=await page.getByTestId("segment-fixture-wire-1").boundingBox(); await page.mouse.move(h.x+h.width/2,h.y+h.height/2); await page.mouse.down(); await page.mouse.move(h.x+h.width/2+40,h.y+h.height/2,{steps:4}); await page.locator(".workbench-stage").focus(); await page.keyboard.press("Escape"); await page.mouse.up(); assert(JSON.stringify(await route("fixture-wire"))===before&&await page.getByTestId("connector-edit-ghost").count()===0, "segment cancel left mutation or ghost") })
  check("R2-UI33", "Escape cancels endpoint drag", async () => { await fixture("horizontal"); await page.getByTestId("select-fixture-wire").click(); const before=await page.getByTestId("edge-fixture-wire").getAttribute("data-source-ref"),h=await page.getByTestId("source-fixture-wire").boundingBox(),p=await xy(80,80); await page.mouse.move(h.x+h.width/2,h.y+h.height/2); await page.mouse.down(); await page.mouse.move(p.x,p.y,{steps:4}); await page.locator(".workbench-stage").focus(); await page.keyboard.press("Escape"); await page.mouse.up(); assert(await page.getByTestId("edge-fixture-wire").getAttribute("data-source-ref")===before, "endpoint cancel changed binding") })
  check("R2-UI35a", "pointer cancellation clears ghost state", async () => { await fixture("empty"); await page.getByRole("button",{name:"Connector",exact:true}).click(); const p=await xy(100,100),q=await xy(220,100); await page.mouse.move(p.x,p.y); await page.mouse.down(); await page.mouse.move(q.x,q.y); await page.locator(".workbench-stage").dispatchEvent("pointercancel"); await page.mouse.up(); assert(await page.locator("[data-edge-id]").count()===0&&await page.locator(".connector-ghost").count()===0, "pointer cancellation left transient state") })
  check("R2-UI40", "connector remains predictable at changed viewport zoom", async () => { await fixture("empty"); const box=await page.locator(".workbench-stage").boundingBox(); await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.wheel(0,-240); await page.waitForTimeout(50); const r=await draw([[80,80],[180,80],[180,180]]); assert(orthogonal(r.committed)&&r.equal==="true", "zoomed stage route invalid") })
  check("R2-UI30", "explicit junction branch creates topology atomically", async () => { await fixture("junction"); assert(await page.locator("[data-junction-id]").count() === 1 && await page.locator("[data-edge-id]").count()===2, "junction fixture missing"); await page.screenshot({path:`${artifactDir}/explicit-junction.png`}); await page.getByRole("button",{name:"Create explicit junction branch"}).click(); assert(await page.locator("[data-junction-id]").count()===2&&await page.locator("[data-edge-id]").count()===3, "explicit junction branch missing"); await page.getByRole("button",{name:"Undo",exact:true}).click(); assert(await page.locator("[data-junction-id]").count()===1&&await page.locator("[data-edge-id]").count()===2, "junction undo was not atomic") })
  check("R2-UI27", "overlapping connector selection remains independent", async () => { await fixture("stacked"); await page.getByTestId("select-fixture-wire").click(); const selected=await page.locator('[data-testid="edge-fixture-wire"]').getAttribute("class"); await page.getByTestId("select-stacked-wire").click(); assert(selected?.includes("selected") && !(await page.getByTestId("edge-fixture-wire").getAttribute("class"))?.includes("selected") && (await page.getByTestId("edge-stacked-wire").getAttribute("class"))?.includes("selected"), "selection did not isolate stacked edges") })

  check("R2-UI14", "reconnect target to another port without replacing connector", async () => {
    await fixture("free"); await draw([[210,185],[460,185]])
    const id = await page.locator("[data-edge-id]").last().getAttribute("data-edge-id"), before = await page.getByTestId(`edge-${id}`)
    await page.getByTestId(`select-${id}`).click()
    const handle = await page.getByTestId(`target-${id}`).boundingBox(), target = await xy(515,150)
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down(); await page.mouse.move(target.x, target.y, { steps: 5 }); await page.waitForTimeout(30)
    await page.screenshot({ path: `${artifactDir}/target-reconnect-ghost.png` }); await page.mouse.up(); await page.waitForTimeout(35)
    const after = page.getByTestId(`edge-${id}`)
    assert(await after.getAttribute("data-target-kind") === "port" && await after.getAttribute("data-target-ref") === "port-c", "target did not reconnect to requested port")
    assert(await after.getAttribute("data-source-ref") === "port-a" && await page.locator("[data-edge-id]").count() === 2, "reconnect replaced edge or changed opposite endpoint")
    assert(await page.getByTestId("preview-commit-equality").innerText() === "true", "reconnect preview differs from committed route")
  })

  check("R2-UI41", "serialize and restore representative connector scene", async () => {
    await fixture("acceptance")
    const ids = ["persist-free-auto", "persist-port-auto", "persist-manual", "persist-intentional", "persist-stack-a", "persist-stack-b", "persist-junction-host", "persist-junction-branch"]
    await page.getByRole("button", { name: "Connector", exact: true }).click()
    const a = await xy(700, 200), b = await xy(800, 240); await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 3 })
    const during = await workbench("serialize")
    assert(!during.content.edges.some((edge) => edge.id.startsWith("workbench-edge-")), "transient preview was serialized")
    await page.keyboard.press("Escape"); await page.mouse.up()
    const before = await workbench("snapshot"), completeBefore = await workbench("inspectComplete"), serialized = await workbench("serialize")
    assert(serialized.format === "affino-diagram" && serialized.version === 1, "not a production DiagramDocument")
    const restoredDocument = await workbench("restore"), after = await workbench("snapshot")
    assert(JSON.stringify(Object.keys(before).sort()) === JSON.stringify(Object.keys(after).sort()), "edge identities changed on restore")
    for (const id of ids) {
      const prior = before[id], next = after[id]
      assert(prior && next && JSON.stringify(prior.route) === JSON.stringify(next.route), `${id} resolved route changed on restore`)
      assert(JSON.stringify(prior.edge.source) === JSON.stringify(next.edge.source) && JSON.stringify(prior.edge.target) === JSON.stringify(next.edge.target), `${id} endpoint refs changed`)
      if (prior.edge.routing?.mode === "manual") assert(JSON.stringify(prior.edge.points) === JSON.stringify(next.edge.points), `${id} manual route points changed`)
      assert(JSON.stringify(prior.edge.metadata ?? {}) === JSON.stringify(next.edge.metadata ?? {}), `${id} metadata/style was lost`)
    }
    assert(restoredDocument.content.junctions.some((junction) => junction.id === "persist-junction"), "explicit junction did not survive serialization")
    assert(after["persist-port-auto"].edge.routing.mode === "auto" && after["persist-port-auto"].edge.routing.strategy === "simple", "automatic routing config changed")
    assert(after["persist-port-auto"].style?.stroke === "#146cbe", "connector stroke style did not survive restore")
    assert(after["persist-manual"].edge.routing.mode === "manual" && after["persist-intentional"].edge.points.length === 3, "manual ownership or bends changed")
    assert(JSON.stringify(after["persist-stack-a"].route) === JSON.stringify(after["persist-stack-b"].route), "overlapping connectors separated")
    const freshPage = await context.newPage()
    await freshPage.goto(`${baseUrl}/diagram/connectors`, { waitUntil: "domcontentloaded" })
    await freshPage.locator(".workbench-stage").waitFor()
    await freshPage.evaluate((document) => window.__affinoConnectorAcceptance.restoreDocument(document), serialized)
    await freshPage.waitForTimeout(35)
    const restored = await freshPage.evaluate(() => window.__affinoConnectorAcceptance.inspectComplete())
    assert(JSON.stringify(Object.keys(completeBefore.geometry).sort()) === JSON.stringify(Object.keys(restored.geometry).sort()), "fresh-page entity identities changed")
    assert(JSON.stringify(completeBefore.geometry) === JSON.stringify(restored.geometry), "fresh-page resolved geometry differs")
    assert(JSON.stringify(completeBefore.tables) === JSON.stringify(restored.tables), "fresh-page Table layout differs")
    const restoredDocumentContent = restored.document.content
    const ports = restoredDocumentContent.ports
    assert(ports.find((port) => port.id === "persist-port-a")?.metadata?.binding?.key === "device.output" && ports.find((port) => port.id === "persist-port-b")?.direction === "west", "fresh-page port metadata or direction changed")
    const restoredTable = restoredDocumentContent.tables.find((table) => table.id === "persist-table")
    assert(JSON.stringify(restoredTable.columnWidths) === JSON.stringify([37.5, 62.5, 50]) && restoredTable.style.overflow === "wrap", "fresh-page Table dimensions or overflow changed")
    assert(restoredTable.merges[0]?.anchorCellId === "persist-cell-00" && restoredTable.cells[0][0].metadata.binding.key === "drawing.title", "fresh-page merged Table identity or metadata changed")
    assert(restored.tables["persist-table"].visibleCells.length === 5, "fresh-page visible logical cell topology is incorrect")
    await freshPage.evaluate(() => window.__affinoConnectorAcceptance.editTableCell("persist-table", 0, 0, "Restored edit"))
    const editedTable = await freshPage.evaluate(() => window.__affinoConnectorAcceptance.inspectComplete().document.content.tables.find((table) => table.id === "persist-table"))
    assert(editedTable.cells[0][0].text === "Restored edit" && editedTable.cells[0][0].metadata.binding.key === "drawing.title", "fresh-page Table edit did not preserve metadata")
    await freshPage.screenshot({ path: `${artifactDir}/fresh-page-restored-composite.png`, fullPage: true })
    await page.getByTestId("select-persist-manual").click()
    const handle = await page.getByTestId("segment-persist-manual-1").boundingBox()
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down(); await page.mouse.move(handle.x + handle.width / 2 + 30, handle.y + handle.height / 2, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(30)
    assert(JSON.stringify((await workbench("snapshot"))["persist-manual"].route) !== JSON.stringify(after["persist-manual"].route), "restored connector is not editable")
    await page.screenshot({ path: `${artifactDir}/serialize-reloaded-connectors.png` })
  })

  check("R2-UI43", "explicit obstacle router remains compatible; simple routes ignore obstacles", async () => {
    await fixture("advanced")
    const edge = page.getByTestId("edge-fixture-wire"), initial = await route("fixture-wire")
    assert(await edge.getAttribute("data-routing-strategy") === "obstacle-aware", "advanced strategy not selected")
    assert(initial.length >= 4 && orthogonal(initial), `advanced route did not detour obstacle: ${JSON.stringify(initial)}`)
    await page.screenshot({ path: `${artifactDir}/advanced-obstacle-route.png` })
    await page.getByRole("button", { name: "Select", exact: true }).click()
    const box = await page.locator('[data-node-id="host-b"] rect').boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 40, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(30)
    const moved = await route("fixture-wire")
    assert(orthogonal(moved) && JSON.stringify(moved) !== JSON.stringify(initial), "advanced route did not follow attached host movement")
    const document = await workbench("serialize"), advancedEdge = document.content.edges.find((item) => item.id === "fixture-wire")
    assert(advancedEdge.routing.strategy === "obstacle-aware" && advancedEdge.routing.clearance === 8 && advancedEdge.routing.terminalLead === 0, "advanced route options did not serialize")
    const restored = await workbench("restore"), restoredRoute = await route("fixture-wire")
    assert(JSON.stringify(restoredRoute) === JSON.stringify(moved) && restored.content.edges.find((item) => item.id === "fixture-wire").routing.strategy === "obstacle-aware", "advanced route changed after restore")
    const simple = await draw([[240,205],[430,205]])
    const simpleId = await page.locator("[data-edge-id]").last().getAttribute("data-edge-id")
    const simpleStrategy = await page.getByTestId(`edge-${simpleId}`).getAttribute("data-routing-strategy")
    const simpleMode = await page.getByTestId(`edge-${simpleId}`).getAttribute("data-routing-mode")
    const simpleSnapshot = await workbench("snapshot")
    assert(simple.committed.length === 2 && simpleStrategy === "simple", `interactive simple connector inherited obstacle routing: ${JSON.stringify({ route: simple.committed, strategy: simpleStrategy, mode: simpleMode, edgeId: simpleId, edge: simpleSnapshot[simpleId]?.edge })}`)
    const crossesObstacle = simple.committed.length === 2 && simple.committed[0][1] === simple.committed[1][1]
      && Math.min(simple.committed[0][0], simple.committed[1][0]) < 380 && Math.max(simple.committed[0][0], simple.committed[1][0]) > 290
      && simple.committed[0][1] > 160 && simple.committed[0][1] < 230
    assert(crossesObstacle, `simple connector detoured around obstacle: ${JSON.stringify(simple.committed)}`)
  })

  check("PD01", "directional port preview fixture routes east-to-west at both terminals", async () => {
    await fixture("directional")
    assert(await page.getByTestId("port-select").inputValue() === "direction-east" && await page.getByTestId("port-direction").inputValue() === "east", "directional fixture did not expose host A's actual port direction")
    const points = await route("direction-fixture-wire")
    assert(orthogonal(points) && points[1][0] > points[0][0], `source did not leave east: ${JSON.stringify(points)}`)
    assert(points.at(-2)[0] < points.at(-1)[0], `target was not approached from its west side: ${JSON.stringify(points)}`)
    await page.screenshot({ path: `${artifactDir}/directional-east-west.png` })
    await page.getByTestId("port-select").selectOption("direction-east")
    await page.getByTestId("port-direction").selectOption("south")
    const changedDirectionRoute = await route("direction-fixture-wire")
    assert(changedDirectionRoute[1][0] === changedDirectionRoute[0][0] && changedDirectionRoute[1][1] > changedDirectionRoute[0][1], `direction edit did not update the attached automatic route: ${JSON.stringify(changedDirectionRoute)}`)
    const serialized = await workbench("serialize")
    assert(serialized.content.ports.find((port) => port.id === "direction-east").direction === "south", "direction control did not update the production port model")
    await page.getByRole("button", { name: "Undo", exact: true }).click()
    assert((await workbench("serialize")).content.ports.find((port) => port.id === "direction-east").direction === "east", "direction update was not one undoable command")
  })
  check("PD21", "directional connector ghost matches the committed attached route", async () => {
    await fixture("directional")
    const drawn = await draw([[220,205],[350,205],[350,305],[470,305]], { screenshots: [1,2,3] })
    assert(drawn.equal === "true" && orthogonal(drawn.preview) && JSON.stringify(drawn.preview) === JSON.stringify(drawn.committed), `directional preview differs from commit: ${JSON.stringify(drawn)}`)
    const edgeId = await page.locator("[data-edge-id]").last().getAttribute("data-edge-id"), edge = page.getByTestId(`edge-${edgeId}`)
    assert(await edge.getAttribute("data-source-kind") === "port" && await edge.getAttribute("data-source-ref") === "direction-east", "source did not bind to the expected port")
    assert(await edge.getAttribute("data-target-kind") === "port" && await edge.getAttribute("data-target-ref") === "direction-west", "target did not bind to the expected port")
    assert(drawn.committed[1][0] > drawn.committed[0][0] && drawn.committed.at(-2)[0] < drawn.committed.at(-1)[0], `terminal directions were not honored: ${JSON.stringify(drawn.committed)}`)
    await page.screenshot({ path: `${artifactDir}/directional-port-to-port-committed.png` })
  })
  check("PD-NESTED", "nested directional ports retain exact attachment and orthogonal approach through parent transforms", async () => {
    await fixture("nested-directional")
    const before = await workbench("inspectHierarchy")
    assert(before.groups.some((group) => group.id === "direction-inner") && before.groups.some((group) => group.id === "direction-outer"), "nested retained groups are missing")
    const sourceBefore = before.ports.find((entry) => entry.port.id === "direction-east")
    const targetBefore = before.ports.find((entry) => entry.port.id === "direction-west")
    assert(sourceBefore?.worldDirection && targetBefore?.worldDirection && sourceBefore.port.metadata?.binding?.key === "symbol.output" && targetBefore.port.metadata?.binding?.key === "symbol.input", "nested port direction or metadata is missing")
    const originalRoute = before.edges["direction-fixture-wire"].route
    await workbench("rotateGroup", ["direction-outer", 90])
    await workbench("flipGroup", ["direction-outer", "horizontal"])
    await page.waitForTimeout(35)
    const after = await workbench("inspectHierarchy")
    const edge = after.edges["direction-fixture-wire"]
    const source = after.ports.find((entry) => entry.port.id === "direction-east")
    const target = after.ports.find((entry) => entry.port.id === "direction-west")
    const points = edge.route.map((point) => [point.x, point.y])
    assert(JSON.stringify(points) !== JSON.stringify(originalRoute.map((point) => [point.x, point.y])), "parent transforms did not update the attached route")
    assert(orthogonal(points), `transformed route is not orthogonal: ${JSON.stringify(points)}`)
    assert(JSON.stringify(points[0]) === JSON.stringify([source.point.x, source.point.y]) && JSON.stringify(points.at(-1)) === JSON.stringify([target.point.x, target.point.y]), "transformed route endpoints detached from port geometry")
    const vector = { east: [1, 0], west: [-1, 0], north: [0, -1], south: [0, 1] }
    const sourceDirection = vector[source.worldDirection]
    const targetDirection = vector[target.worldDirection]
    const sourceLead = [(points[1][0] - points[0][0]) * sourceDirection[0], (points[1][1] - points[0][1]) * sourceDirection[1]].reduce((a, b) => a + b, 0)
    const targetLead = [(points.at(-1)[0] - points.at(-2)[0]) * targetDirection[0], (points.at(-1)[1] - points.at(-2)[1]) * targetDirection[1]].reduce((a, b) => a + b, 0)
    assert(sourceLead > 0 && targetLead < 0, `terminal approach violates accumulated directions: ${JSON.stringify({ source: source.worldDirection, target: target.worldDirection, points })}`)
    const drawn = await draw([[source.point.x, source.point.y], [target.point.x, target.point.y]])
    assert(drawn.equal === "true" && JSON.stringify(drawn.preview) === JSON.stringify(drawn.committed) && orthogonal(drawn.committed), "nested directional preview did not match committed route")
    const created = page.locator("[data-edge-id]").last().locator("polyline").first()
    assert(await created.getAttribute("data-source-ref") === "direction-east" && await created.getAttribute("data-target-ref") === "direction-west", `pointer-created connector did not preserve exact port identities: ${JSON.stringify({ source: await created.getAttribute("data-source-ref"), target: await created.getAttribute("data-target-ref"), route: drawn.committed })}`)
    await page.screenshot({ path: `${artifactDir}/nested-directional-parents.png` })
  })
  check("PD-CANVAS", "canvas host A auto direction exits right before turning down", async () => {
    await page.goto(`${baseUrl}/diagram/canvas`, { waitUntil: "domcontentloaded" })
    const edge = page.locator('[data-diagram-id="canvas-edge"]')
    await edge.waitFor()
    const points = parsePoints(await edge.getAttribute("points"))
    assert(points.length === 4, `expected a two-bend right/down/right route, got ${JSON.stringify(points)}`)
    assert(points[1][0] > points[0][0] && points[1][1] === points[0][1], `host A did not exit right: ${JSON.stringify(points)}`)
    assert(points[2][0] === points[1][0] && points[2][1] > points[1][1], `middle segment did not run down: ${JSON.stringify(points)}`)
    assert(points[3][0] > points[2][0] && points[3][1] === points[2][1], `last segment did not run right: ${JSON.stringify(points)}`)
    await page.screenshot({ path: `${artifactDir}/canvas-host-a-right-down-right.png`, fullPage: true })
    await page.goto(`${baseUrl}/diagram/connectors`, { waitUntil: "domcontentloaded" })
    await page.locator(".workbench-stage").waitFor()
  })
  check("PD-CROSS", "moving east-facing host A past host B keeps the connector routed", async () => {
    await fixture("directional")
    await page.getByRole("button", { name: "Select", exact: true }).click()
    const from = await xy(165,205), to = await xy(665,205)
    await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 8 }); await page.waitForTimeout(40)
    const preview = await route("direction-fixture-wire")
    assert(preview.length >= 6 && orthogonal(preview), `live route preview disappeared while host A crossed host B: ${JSON.stringify(preview)}`)
    await page.mouse.up(); await page.waitForTimeout(40)
    const points = await route("direction-fixture-wire")
    assert(points.length >= 6 && orthogonal(points), `connector disappeared or became invalid after hosts crossed: ${JSON.stringify(points)}`)
    assert(JSON.stringify(preview) === JSON.stringify(points), `live preview did not match committed route: preview=${JSON.stringify(preview)} commit=${JSON.stringify(points)}`)
    assert(points[1][0] > points[0][0], `source stopped exiting east: ${JSON.stringify(points)}`)
    assert(points.at(-2)[0] < points.at(-1)[0], `target stopped being approached from the west: ${JSON.stringify(points)}`)
    await page.screenshot({ path: `${artifactDir}/directional-hosts-crossed.png` })
  })
  check("HIERARCHY-01", "retained transform origin, nested reparenting, hit testing and child Table editing survive serialization", async () => {
    await page.goto(`${baseUrl}/diagram`, { waitUntil: "domcontentloaded" })
    const demo = page.locator('section[aria-label="Configurable transform origin example"]')
    await demo.waitFor()
    const press = (label) => demo.getByRole("button", { name: label, exact: true }).click()
    const outputText = async () => (await demo.locator("output").allTextContents()).join(" ")
    await demo.getByLabel("Nine-position origin").selectOption("0")
    await press("Set origin")
    assert((await outputText()).includes("relative"), "configurable transform origin did not update")
    const before = await demo.getByLabel("Transform diagnostics").textContent()
    await press("Rotate nested group")
    assert(await demo.getByLabel("Transform diagnostics").textContent() !== before, "nested group rotation did not update world diagnostics")
    await press("Reparent nested group")
    assert((await outputText()).includes("pivot-target"), "nested group reparent did not update ownership")
    await press("Select nested text")
    assert((await outputText()).includes("pivot-label"), "nested entity selection failed")
    await press("Verify nested hit")
    assert((await outputText()).includes("hit=pivot-box"), "Core nested hit test returned the wrong entity")
    await press("Edit nested table cell")
    assert((await demo.locator('[data-diagram-table-id="pivot-table"]').textContent()).includes("EDITED"), "nested Table edit did not commit")
    await press("Serialize and restore")
    assert((await outputText()).includes("pivot-target"), "serialized nested parent relationship did not restore")
    await page.screenshot({ path: `${artifactDir}/nested-transform-hierarchy.png`, fullPage: true })
  })

  const selectedOnly = process.env.DIAGRAM_CONNECTOR_ONLY
  for (const result of results.filter((entry) => !selectedOnly || entry.id === selectedOnly)) {
    geometryEvidence = null
    try { await result.fn(); result.status = "PASS" }
    catch (error) { result.status = "FAIL"; result.error = error.message; await page.screenshot({ path: `${artifactDir}/${result.id}-failure.png` }).catch(() => {}) }
    if (geometryEvidence) result.geometryEvidence = { scenarioId: result.id, ...geometryEvidence }
    delete result.fn
  }
  if (!selectedOnly) {
  await page.goto(`${baseUrl}/diagram/connectors`, { waitUntil: "domcontentloaded" })
  await page.locator(".workbench-stage").waitFor()
  await fixture("empty"); await page.getByRole("button", { name: "Connector", exact: true }).click()
  let point = await xy(100, 100); await page.mouse.move(point.x, point.y); await page.mouse.down()
  await measureInteraction("connector-creation-preview", async () => { const target = await xy(260, 150); await page.mouse.move(target.x, target.y, { steps: 3 }) })
  await measureInteraction("connector-creation-commit", async () => page.mouse.up())
  await fixture("free"); await draw([[100,100],[300,100]]); let edgeId = await page.locator("[data-edge-id]").last().getAttribute("data-edge-id"); await page.getByTestId(`select-${edgeId}`).click()
  let handle = await page.getByTestId(`source-${edgeId}`).boundingBox(), port = await xy(210,185); await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down()
  await measureInteraction("endpoint-drag-preview", async () => page.mouse.move(port.x, port.y, { steps: 3 }))
  await measureInteraction("endpoint-drag-commit", async () => page.mouse.up())
  await fixture("manual"); await page.getByTestId("select-fixture-wire").click(); handle = await page.getByTestId("segment-fixture-wire-1").boundingBox(); await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down()
  await measureInteraction("segment-drag-preview", async () => page.mouse.move(handle.x + handle.width / 2 + 35, handle.y + handle.height / 2, { steps: 3 }))
  await measureInteraction("segment-drag-commit", async () => page.mouse.up())
  await fixture("horizontal"); await page.getByRole("button", { name: "Select", exact: true }).click(); handle = await page.locator('[data-node-id="host-a"] rect').boundingBox(); await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down()
  await measureInteraction("connected-object-drag-preview", async () => page.mouse.move(handle.x + handle.width / 2 + 30, handle.y + handle.height / 2 + 25, { steps: 3 }))
  await measureInteraction("connected-object-drag-commit", async () => page.mouse.up())
  }
  await writeFile(`${artifactDir}/acceptance-results.json`, JSON.stringify({ browser: await browser.version(), results, browserMetrics }, null, 2))
  await context.tracing.stop({ path: `${artifactDir}/connector-acceptance.trace.zip` })
  const reportedResults = results.filter((result) => !selectedOnly || result.id === selectedOnly)
  for (const result of reportedResults) console.log(`${result.status} ${result.id} ${result.name}${result.error ? ` — ${result.error}` : ""}`)
  if (reportedResults.some((result) => result.status === "FAIL")) process.exitCode = 1
} finally {
  await browser?.close()
  if (server) { server.kill("SIGTERM"); server.disconnect?.() }
}
