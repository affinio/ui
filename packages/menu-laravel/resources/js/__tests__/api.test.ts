/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest"

import { bootstrapAffinoMenus, hydrateMenu, refreshAffinoMenus } from "../index"

type MenuTestRoot = HTMLDivElement & {
  affinoMenu?: unknown
}

afterEach(() => {
  document.body.innerHTML = ""
  delete (window as any).Livewire
})

function createMenuRoot() {
  const root = document.createElement("div") as MenuTestRoot
  root.dataset.affinoMenuRoot = "menu-api"
  root.innerHTML = `
    <button data-affino-menu-trigger></button>
    <div data-affino-menu-panel>
      <button data-affino-menu-item>Item</button>
    </div>
  `
  document.body.appendChild(root)
  return root
}

describe("menu public API", () => {
  it("exposes bootstrap/hydrate/refresh", () => {
    expect(typeof bootstrapAffinoMenus).toBe("function")
    expect(typeof hydrateMenu).toBe("function")
    expect(typeof refreshAffinoMenus).toBe("function")
  })

  it("bootstraps without Livewire", () => {
    const root = createMenuRoot()
    expect(() => bootstrapAffinoMenus()).not.toThrow()
    expect(root.affinoMenu).toBeDefined()
  })
})
