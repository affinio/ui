import { chromium } from "@playwright/test"
import { mkdir } from "node:fs/promises"
import { spawn } from "node:child_process"
import { setTimeout as delay } from "node:timers/promises"

const artifactDir = process.env.SELECT_ARTIFACT_DIR ?? "artifacts/select-acceptance"
await mkdir(artifactDir, { recursive: true })
const server = spawn("pnpm", ["--filter", "demo-vue", "dev", "--host", "127.0.0.1", "--port", "4179"], { stdio: "ignore", detached: true })
let browser
try {
  let ready = false
  for (let i = 0; i < 80; i += 1) {
    try { const response = await fetch("http://127.0.0.1:4179/select"); if (response.ok) { ready = true; break } } catch {}
    await delay(250)
  }
  if (!ready) throw new Error("Select demo server did not start")
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 390, height: 740 } })
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true })
  const page = await context.newPage()
  await page.goto("http://127.0.0.1:4179/select")
  await page.getByRole("heading", { name: "Select", exact: true }).waitFor()
  const basic = page.getByRole("combobox", { name: "Basic Select" })
  await basic.click()
  await page.getByRole("option", { name: "Review", exact: true }).click()
  if (!(await basic.innerText()).includes("Review")) throw new Error("Mouse selection did not update the control")
  if (!(await page.getByRole("combobox", { name: "Controlled open Select" }).innerText()).includes("Review")) throw new Error("Independent Select instance did not receive the shared model")

  const paper = page.getByRole("combobox", { name: "Paper size" })
  await paper.focus()
  await paper.press("ArrowDown")
  await paper.press("ArrowDown")
  await paper.press("Enter")
  if (!(await paper.innerText()).includes("A4")) throw new Error("Keyboard selection did not commit the active option")
  if (!(await paper.evaluate(element => document.activeElement === element))) throw new Error("Keyboard commit did not preserve trigger focus")
  await paper.press("ArrowDown")
  await paper.press("Escape")
  if (!(await paper.innerText()).includes("A4")) throw new Error("Escape changed the selected value")
  await page.getByRole("button", { name: "External model update" }).click()
  if (!(await page.getByRole("combobox", { name: "Numeric value" }).innerText()).includes("Three")) throw new Error("External numeric model update did not render")
  if (!(await page.getByRole("combobox", { name: "Disabled control" }).isDisabled())) throw new Error("Disabled control is interactive")

  const disabledOption = page.getByRole("combobox", { name: "Disabled option" })
  await disabledOption.focus()
  await disabledOption.press("ArrowDown")
  await disabledOption.press("ArrowDown")
  const disabledActive = await disabledOption.getAttribute("aria-activedescendant")
  if (!disabledActive || !(await page.locator(`#${disabledActive}`).innerText()).includes("Final")) throw new Error("Keyboard navigation did not skip a disabled option")
  await disabledOption.press("Enter")
  if (!(await disabledOption.innerText()).includes("Final")) throw new Error("Keyboard selection after a disabled option failed")

  const basicAgain = page.getByRole("combobox", { name: "Basic Select" })
  await basicAgain.focus()
  await basicAgain.press("f")
  if (!(await basicAgain.getAttribute("aria-activedescendant"))) throw new Error("Typeahead did not activate an option")
  const activeId = await basicAgain.getAttribute("aria-activedescendant")
  if (!(await page.locator(`#${activeId}`).innerText()).includes("Final")) throw new Error("Typeahead selected the wrong active option")
  await basicAgain.press("Escape")
  await page.evaluate(() => document.querySelectorAll("vite-plugin-vue-devtools, #vue-devtools__anchor, #vue-devtools__panel, [data-vue-devtools]").forEach(element => element.remove()))
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.screenshot({ path: `${artifactDir}/compact-inspector.png`, fullPage: true })

  await page.setViewportSize({ width: 390, height: 740 })
  const longSelect = page.getByRole("combobox", { name: "Long label" })
  await longSelect.click()
  const longOption = page.getByRole("option", { name: /very long option label/ })
  const longBox = await longOption.boundingBox()
  if (!longBox || longBox.width > 390 || longBox.y < 0 || longBox.y + longBox.height > 740) throw new Error("Long option popup exceeds narrow viewport or is clipped")
  await page.screenshot({ path: `${artifactDir}/long-option.png` })
  await page.keyboard.press("Escape")

  await page.getByRole("button", { name: "Open dialog scenario" }).click()
  const dialogSelect = page.getByRole("combobox", { name: "Dialog orientation" })
  await dialogSelect.click()
  await page.getByRole("option", { name: "Landscape" }).click()
  if (!(await dialogSelect.innerText()).includes("Landscape")) throw new Error("Select did not work inside dialog")

  await context.tracing.stop({ path: `${artifactDir}/select.trace.zip` })
  console.log(JSON.stringify({ status: "passed", screenshots: [`${artifactDir}/compact-inspector.png`, `${artifactDir}/long-option.png`], trace: `${artifactDir}/select.trace.zip` }, null, 2))
  await context.close()
} finally {
  await browser?.close()
  try { process.kill(-server.pid, "SIGTERM") } catch { server.kill("SIGTERM") }
}
