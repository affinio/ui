import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/vue"
import { ref } from "vue"
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

  it("keeps trigger ARIA state reactive when the menu opens and closes", async () => {
    renderMenu(`
      <UiMenu>
        <UiMenuTrigger>Reactive Menu</UiMenuTrigger>
        <UiMenuContent>
          <UiMenuItem id="reactive-item">Item</UiMenuItem>
        </UiMenuContent>
      </UiMenu>
    `)

    const trigger = screen.getByRole("button", { name: /reactive menu/i })
    expect(trigger.getAttribute("aria-expanded")).toBe("false")

    await fireEvent.click(trigger)
    await waitFor(() => {
      expect(trigger.getAttribute("aria-expanded")).toBe("true")
    })

    await fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" })
    await waitFor(() => {
      expect(trigger.getAttribute("aria-expanded")).toBe("false")
    })
    expect(document.activeElement).toBe(trigger)
  })

  it("closes on Tab and lets focus leave the menu", async () => {
    renderMenu(`
      <UiMenu>
        <UiMenuTrigger>Tab Menu</UiMenuTrigger>
        <UiMenuContent>
          <UiMenuItem id="tab-item">Item</UiMenuItem>
        </UiMenuContent>
      </UiMenu>
    `)

    await fireEvent.click(screen.getByRole("button", { name: /tab menu/i }))
    const panel = await screen.findByRole("menu")
    await fireEvent.keyDown(panel, { key: "Tab" })

    await waitFor(() => {
      expect(screen.queryByRole("menu")).toBeNull()
    })
  })

  it("mounts a default-open menu", async () => {
    renderMenu(`
      <UiMenu :options="{ defaultOpen: true }">
        <UiMenuTrigger>Default Menu</UiMenuTrigger>
        <UiMenuContent>
          <UiMenuItem id="default-item">Item</UiMenuItem>
        </UiMenuContent>
      </UiMenu>
    `)

    const trigger = screen.getByRole("button", { name: /default menu/i })
    expect(await screen.findByRole("menu")).toBeTruthy()
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
  })

  it("cancels touch long press when the pointer moves or trigger unmounts", async () => {
    vi.useFakeTimers()
    try {
      const rendered = renderMenu(`
        <UiMenu>
          <UiMenuTrigger trigger="both">Touch Menu</UiMenuTrigger>
          <UiMenuContent>
            <UiMenuItem id="touch-item">Item</UiMenuItem>
          </UiMenuContent>
        </UiMenu>
      `)

      const trigger = screen.getByRole("button", { name: /touch menu/i })
      await fireEvent.pointerDown(trigger, { pointerType: "touch", clientX: 10, clientY: 10 })
      await fireEvent.pointerMove(trigger, { pointerType: "touch", clientX: 30, clientY: 10 })
      vi.advanceTimersByTime(500)
      expect(screen.queryByRole("menu")).toBeNull()

      await fireEvent.pointerDown(trigger, { pointerType: "touch", clientX: 10, clientY: 10 })
      rendered.unmount()
      vi.advanceTimersByTime(500)
      expect(document.querySelector("[data-ui-menu-panel='true']")).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it("reacts when a registered item becomes disabled", async () => {
    const disabled = ref(false)
    renderMenu(`
      <UiMenu>
        <UiMenuTrigger>Disabled Menu</UiMenuTrigger>
        <UiMenuContent>
          <UiMenuItem id="dynamic-item" :disabled="disabled">Dynamic</UiMenuItem>
        </UiMenuContent>
      </UiMenu>
    `, { disabled })

    const trigger = screen.getByRole("button", { name: /disabled menu/i })
    await fireEvent.click(trigger)
    const item = await screen.findByRole("menuitem", { name: /dynamic/i })
    expect(item.hasAttribute("aria-disabled")).toBe(false)

    disabled.value = true
    await waitFor(() => {
      expect(item.getAttribute("aria-disabled")).toBe("true")
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

  it("opens a submenu with Enter without selecting or closing its parent", async () => {
    const handleSelect = vi.fn()
    renderMenu(`
      <UiMenu>
        <UiMenuTrigger>Parent Menu</UiMenuTrigger>
        <UiMenuContent>
          <UiSubMenu>
            <UiSubMenuTrigger>More Actions</UiSubMenuTrigger>
            <UiSubMenuContent>
              <UiMenuItem id="nested-action" @select="(payload) => onSelect(payload)">Nested</UiMenuItem>
            </UiSubMenuContent>
          </UiSubMenu>
        </UiMenuContent>
      </UiMenu>
    `, { onSelect: handleSelect })

    await fireEvent.click(screen.getByRole("button", { name: /parent menu/i }))
    const submenuTrigger = await screen.findByRole("menuitem", { name: /more actions/i })
    await fireEvent.keyDown(submenuTrigger, { key: "Enter" })

    await waitFor(() => {
      expect(screen.getAllByRole("menu")).toHaveLength(2)
    })
    expect(handleSelect).not.toHaveBeenCalled()
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

  it("remains stable when pointer rapidly traverses sibling submenu triggers", async () => {
    renderMenu(`
      <UiMenu :options="{ openDelay: 0, closeDelay: 0 }">
        <UiMenuTrigger>Root Fast</UiMenuTrigger>
        <UiMenuContent>
          <UiSubMenu :options="{ openDelay: 0, closeDelay: 0 }">
            <UiSubMenuTrigger>Alpha</UiSubMenuTrigger>
            <UiSubMenuContent>
              <UiMenuItem id="alpha-child">Alpha Child</UiMenuItem>
            </UiSubMenuContent>
          </UiSubMenu>
          <UiSubMenu :options="{ openDelay: 0, closeDelay: 0 }">
            <UiSubMenuTrigger>Beta</UiSubMenuTrigger>
            <UiSubMenuContent>
              <UiMenuItem id="beta-child">Beta Child</UiMenuItem>
            </UiSubMenuContent>
          </UiSubMenu>
          <UiSubMenu :options="{ openDelay: 0, closeDelay: 0 }">
            <UiSubMenuTrigger>Gamma</UiSubMenuTrigger>
            <UiSubMenuContent>
              <UiMenuItem id="gamma-child">Gamma Child</UiMenuItem>
            </UiSubMenuContent>
          </UiSubMenu>
        </UiMenuContent>
      </UiMenu>
    `)

    await fireEvent.click(screen.getByRole("button", { name: /root fast/i }))
    const rootPanel = await screen.findByRole("menu")
    const alpha = await screen.findByRole("menuitem", { name: /alpha/i })
    const beta = await screen.findByRole("menuitem", { name: /beta/i })
    const gamma = await screen.findByRole("menuitem", { name: /gamma/i })

    await fireEvent.pointerEnter(alpha, { relatedTarget: rootPanel })
    await fireEvent.pointerLeave(alpha, { relatedTarget: beta })
    await fireEvent.pointerEnter(beta, { relatedTarget: alpha })
    await fireEvent.pointerLeave(beta, { relatedTarget: gamma })
    await fireEvent.pointerEnter(gamma, { relatedTarget: beta })

    await new Promise((resolve) => setTimeout(resolve, 0))

    await waitFor(() => {
      expect(screen.getAllByRole("menu")).toHaveLength(2)
      expect(screen.queryByText("Alpha Child")).toBeNull()
      expect(screen.queryByText("Beta Child")).toBeNull()
      expect(screen.getByText("Gamma Child")).toBeTruthy()
    })
  })

  it("keeps second-level submenu open on touch interactions", async () => {
    renderMenu(`
      <UiMenu :options="{ openDelay: 0, closeDelay: 0 }">
        <UiMenuTrigger>Root Touch</UiMenuTrigger>
        <UiMenuContent>
          <UiSubMenu :options="{ openDelay: 0, closeDelay: 0 }">
            <UiSubMenuTrigger>Level One</UiSubMenuTrigger>
            <UiSubMenuContent>
              <UiSubMenu :options="{ openDelay: 0, closeDelay: 0 }">
                <UiSubMenuTrigger>Level Two</UiSubMenuTrigger>
                <UiSubMenuContent>
                  <UiMenuItem id="deep-child">Deep Child</UiMenuItem>
                </UiSubMenuContent>
              </UiSubMenu>
            </UiSubMenuContent>
          </UiSubMenu>
        </UiMenuContent>
      </UiMenu>
    `)

    await fireEvent.click(screen.getByRole("button", { name: /root touch/i }))

    const firstLevelTrigger = await screen.findByRole("menuitem", { name: /level one/i })
    await fireEvent.click(firstLevelTrigger)

    const secondLevelTrigger = await screen.findByRole("menuitem", { name: /level two/i })
    await fireEvent.pointerEnter(secondLevelTrigger, { pointerType: "touch", clientX: 24, clientY: 24 })
    await fireEvent.pointerLeave(secondLevelTrigger, { pointerType: "touch", clientX: 24, clientY: 24 })
    await fireEvent.click(secondLevelTrigger)

    await waitFor(() => {
      expect(screen.getAllByRole("menu")).toHaveLength(3)
      expect(screen.getByText("Deep Child")).toBeTruthy()
    })
  })
})
