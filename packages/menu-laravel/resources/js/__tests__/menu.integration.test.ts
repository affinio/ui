/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { refreshAffinoMenus } from "../index"
import { hydrateMenu, scan } from "../menu/hydrate"

type MenuTestRoot = HTMLDivElement & {
  affinoMenu?: unknown
}

type FixtureOptions = {
  portal?: "inline" | "body"
}

let fixtureId = 0

function createMenuFixture(options?: FixtureOptions) {
  fixtureId += 1
  const root = document.createElement("div") as MenuTestRoot
  root.dataset.affinoMenuRoot = `menu-spec-${fixtureId}`
  if (options?.portal) {
    root.dataset.affinoMenuPortal = options.portal
  }

  const trigger = document.createElement("button")
  trigger.dataset.affinoMenuTrigger = ""
  trigger.type = "button"
  root.appendChild(trigger)

  const panel = document.createElement("div")
  panel.dataset.affinoMenuPanel = ""
  root.appendChild(panel)

  const item = document.createElement("button")
  item.dataset.affinoMenuItem = ""
  item.textContent = "Item A"
  panel.appendChild(item)

  document.body.appendChild(root)
  return { root, panel }
}

describe("menu refresh interactions", () => {
  let originalRaf: typeof requestAnimationFrame | undefined

  beforeEach(() => {
    originalRaf = globalThis.requestAnimationFrame
    ;(globalThis as any).requestAnimationFrame = undefined
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    ;(globalThis as any).requestAnimationFrame = originalRaf
    document.body.innerHTML = ""
  })

  it("keeps existing instance on refresh when structure is unchanged", () => {
    const { root, panel } = createMenuFixture({ portal: "inline" })
    hydrateMenu(root as any)
    const firstHandle = root.affinoMenu

    scan(document)
    expect(root.affinoMenu).toBe(firstHandle)

    const next = document.createElement("button")
    next.dataset.affinoMenuItem = ""
    next.textContent = "Item B"
    panel.appendChild(next)

    scan(document)
    expect(root.affinoMenu).not.toBe(firstHandle)
  })

  it("cleans up body-portal panel after refresh removes detached root", () => {
    const { root, panel } = createMenuFixture({ portal: "body" })
    hydrateMenu(root as any)

    expect(panel.parentElement).toBe(document.body)

    root.remove()
    refreshAffinoMenus()
    vi.runAllTimers()

    expect(document.body.contains(panel)).toBe(false)
  })
})
