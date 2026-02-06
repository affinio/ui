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

type RectInit = {
  x?: number
  y?: number
  width?: number
  height?: number
}

function createRect(init: RectInit): DOMRect {
  const { x = 0, y = 0, width = 0, height = 0 } = init
  return {
    x,
    y,
    width,
    height,
    top: y,
    left: x,
    right: x + width,
    bottom: y + height,
    toJSON: () => ({ x, y, width, height, top: y, left: x, right: x + width, bottom: y + height }),
  } as DOMRect
}

function mockRect(element: HTMLElement, rectInit: RectInit) {
  const rect = createRect(rectInit)
  Object.defineProperty(element, "getBoundingClientRect", {
    value: vi.fn(() => rect),
    configurable: true,
  })
}

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

  mockRect(trigger, { x: 200, y: 120, width: 80, height: 36 })
  mockRect(panel, { x: 0, y: 0, width: 180, height: 120 })

  document.body.appendChild(root)
  return { root, panel }
}

function createSubmenuFixture() {
  fixtureId += 1
  const parentRoot = document.createElement("div") as MenuTestRoot
  parentRoot.dataset.affinoMenuRoot = `menu-parent-${fixtureId}`
  parentRoot.dataset.affinoMenuPortal = "inline"

  const parentTrigger = document.createElement("button")
  parentTrigger.dataset.affinoMenuTrigger = ""
  parentTrigger.type = "button"
  parentRoot.appendChild(parentTrigger)

  const parentPanel = document.createElement("div")
  parentPanel.dataset.affinoMenuPanel = ""
  parentRoot.appendChild(parentPanel)

  const parentItem = document.createElement("button")
  parentItem.dataset.affinoMenuItem = ""
  parentItem.id = `menu-parent-item-${fixtureId}`
  parentItem.textContent = "Parent Item"
  parentPanel.appendChild(parentItem)

  const submenuRoot = document.createElement("div") as MenuTestRoot
  submenuRoot.dataset.affinoMenuRoot = `menu-submenu-${fixtureId}`
  submenuRoot.dataset.affinoMenuPortal = "inline"
  submenuRoot.dataset.affinoMenuParent = parentRoot.dataset.affinoMenuRoot
  submenuRoot.dataset.affinoMenuParentItem = parentItem.id

  const submenuTrigger = document.createElement("button")
  submenuTrigger.dataset.affinoMenuTrigger = ""
  submenuTrigger.type = "button"
  submenuRoot.appendChild(submenuTrigger)

  const submenuPanel = document.createElement("div")
  submenuPanel.dataset.affinoMenuPanel = ""
  submenuRoot.appendChild(submenuPanel)

  const submenuItem = document.createElement("button")
  submenuItem.dataset.affinoMenuItem = ""
  submenuItem.textContent = "Child Item"
  submenuPanel.appendChild(submenuItem)

  mockRect(parentTrigger, { x: 200, y: 120, width: 80, height: 36 })
  mockRect(parentPanel, { x: 0, y: 0, width: 180, height: 120 })
  mockRect(submenuTrigger, { x: 300, y: 140, width: 80, height: 36 })
  mockRect(submenuPanel, { x: 0, y: 0, width: 180, height: 120 })

  document.body.appendChild(parentRoot)
  document.body.appendChild(submenuRoot)

  return { parentRoot, submenuRoot }
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

  it("syncs menu state from data-affino-menu-state updates", async () => {
    ;(globalThis as any).requestAnimationFrame = (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    }
    const { root, panel } = createMenuFixture({ portal: "inline" })
    hydrateMenu(root as any)
    expect(panel.hidden).toBe(true)

    root.dataset.affinoMenuState = "open"
    await Promise.resolve()
    expect(panel.hidden).toBe(false)
    expect(root.dataset.affinoMenuState).toBe("open")

    const outside = document.createElement("button")
    outside.textContent = "outside"
    document.body.appendChild(outside)
    outside.focus()

    root.dataset.affinoMenuState = "closed"
    await Promise.resolve()
    expect(panel.hidden).toBe(true)
    expect(root.dataset.affinoMenuState).toBe("closed")
  })

  it("clears detached parent cache before submenu rehydrate", () => {
    const { parentRoot, submenuRoot } = createSubmenuFixture()
    hydrateMenu(parentRoot as any)
    hydrateMenu(submenuRoot as any)
    expect(submenuRoot.dataset.affinoMenuParentResolved).toBe("true")

    parentRoot.remove()
    refreshAffinoMenus()
    vi.runAllTimers()

    expect(submenuRoot.dataset.affinoMenuParentResolved).toBe("false")
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
