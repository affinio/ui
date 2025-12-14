import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/vue"
import UiMenu from "../components/UiMenu.vue"
import UiMenuTrigger from "../components/UiMenuTrigger.vue"
import UiMenuContent from "../components/UiMenuContent.vue"
import UiMenuItem from "../components/UiMenuItem.vue"
import UiSubMenu from "../components/UiSubMenu.vue"
import UiSubMenuTrigger from "../components/UiSubMenuTrigger.vue"
import UiSubMenuContent from "../components/UiSubMenuContent.vue"

const renderMenu = (template: string, bindings?: Record<string, unknown>) =>
  render({
    components: {
      UiMenu,
      UiMenuTrigger,
      UiMenuContent,
      UiMenuItem,
      UiSubMenu,
      UiSubMenuTrigger,
      UiSubMenuContent,
    },
    setup() {
      return bindings ?? {}
    },
    template,
  })

describe("UiMenu", () => {
  it("opens on click and emits select events", async () => {
    const handleSelect = vi.fn()

    renderMenu(
      `<UiMenu>
        <UiMenuTrigger>Open Menu</UiMenuTrigger>
        <UiMenuContent>
          <UiMenuItem id="first" @select="(payload) => onSelect(payload)">First</UiMenuItem>
        </UiMenuContent>
      </UiMenu>`,
      { onSelect: handleSelect }
    )

    const trigger = screen.getByRole("button", { name: /open menu/i })
    await fireEvent.click(trigger)

    const panel = await screen.findByRole("menu")
    await waitFor(() => {
      expect(panel.getAttribute("data-state")).toBe("open")
    })

    const item = await screen.findByRole("menuitem", { name: /first/i })
    await fireEvent.click(item)

    expect(handleSelect).toHaveBeenCalledTimes(1)
    expect(handleSelect.mock.calls[0][0].id).toBe("first")

    await waitFor(() => {
      expect(screen.queryByRole("menu")).toBeNull()
    })
  })

  it("opens nested submenus with keyboard navigation", async () => {
    renderMenu(`
      <UiMenu>
        <UiMenuTrigger>Main Menu</UiMenuTrigger>
        <UiMenuContent>
          <UiSubMenu>
            <UiSubMenuTrigger>More</UiSubMenuTrigger>
            <UiSubMenuContent>
              <UiMenuItem id="child">Child</UiMenuItem>
            </UiSubMenuContent>
          </UiSubMenu>
        </UiMenuContent>
      </UiMenu>
    `)

    const trigger = screen.getByRole("button", { name: /main menu/i })
    await fireEvent.click(trigger)

    const panel = await screen.findByRole("menu")
    await fireEvent.keyDown(panel, { key: "ArrowDown" })
    const submenuTrigger = await screen.findByRole("menuitem", { name: /more/i })
    submenuTrigger.focus()
    await fireEvent.keyDown(submenuTrigger, { key: "ArrowRight" })

    await waitFor(() => {
      const menus = screen.getAllByRole("menu")
      expect(menus).toHaveLength(2)
    })

    expect(await screen.findByRole("menuitem", { name: /child/i })).toBeTruthy()
  })

  it("switches between adjacent submenu triggers on hover", async () => {
    renderMenu(`
      <UiMenu :options="{ openDelay: 0, closeDelay: 0 }">
        <UiMenuTrigger>Root</UiMenuTrigger>
        <UiMenuContent>
          <UiSubMenu :options="{ openDelay: 0, closeDelay: 0 }">
            <UiSubMenuTrigger>First Submenu</UiSubMenuTrigger>
            <UiSubMenuContent>
              <UiMenuItem id="first-child">First Child</UiMenuItem>
            </UiSubMenuContent>
          </UiSubMenu>
          <UiSubMenu :options="{ openDelay: 0, closeDelay: 0 }">
            <UiSubMenuTrigger>Second Submenu</UiSubMenuTrigger>
            <UiSubMenuContent>
              <UiMenuItem id="second-child">Second Child</UiMenuItem>
            </UiSubMenuContent>
          </UiSubMenu>
        </UiMenuContent>
      </UiMenu>
    `)

    const rootTrigger = screen.getByRole("button", { name: /root/i })
    await fireEvent.click(rootTrigger)
    const rootPanel = await screen.findByRole("menu")

    const firstTrigger = await screen.findByRole("menuitem", { name: /first submenu/i })
    const secondTrigger = await screen.findByRole("menuitem", { name: /second submenu/i })

    await fireEvent.pointerEnter(firstTrigger, { relatedTarget: rootPanel })
    await waitFor(() => {
      expect(screen.getAllByRole("menu")).toHaveLength(2)
      expect(screen.getByText("First Child")).toBeTruthy()
    })

    await fireEvent.pointerLeave(firstTrigger, { relatedTarget: secondTrigger })
    await fireEvent.pointerEnter(secondTrigger, { relatedTarget: firstTrigger })

    await new Promise((resolve) => setTimeout(resolve, 0))

    await waitFor(() => {
      expect(screen.getAllByRole("menu")).toHaveLength(2)
      expect(screen.queryByText("First Child")).toBeNull()
      expect(screen.getByText("Second Child")).toBeTruthy()
    })
  })
})
