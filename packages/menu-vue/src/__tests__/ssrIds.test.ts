// @vitest-environment node

import { describe, expect, it } from "vitest"
import { createSSRApp, h } from "vue"
import { renderToString } from "@vue/server-renderer"
import UiMenu from "../components/UiMenu.vue"
import UiMenuTrigger from "../components/UiMenuTrigger.vue"
import UiMenuContent from "../components/UiMenuContent.vue"
import UiMenuItem from "../components/UiMenuItem.vue"

async function renderMenu() {
  return renderToString(
    createSSRApp({
      render: () =>
        h(UiMenu, null, {
          default: () => [
            h(UiMenuTrigger, null, { default: () => "SSR menu" }),
            h(UiMenuContent, null, {
              default: () => h(UiMenuItem, null, { default: () => "Item" }),
            }),
          ],
        }),
    }),
  )
}

describe("menu SSR ids", () => {
  it("stays deterministic across independent server renders", async () => {
    const first = await renderMenu()
    const second = await renderMenu()

    expect(second).toBe(first)
    expect(first).toMatch(/aria-controls="ui-menu-.*-panel"/)
  })
})
