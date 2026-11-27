import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/vue"
import { ref } from "vue"
import UiMenu from "../components/UiMenu.vue"
import UiMenuBar from "../components/UiMenuBar.vue"
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
      UiMenuBar,
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
  it("shares root open state inside a menubar and switches menus on hover", async () => {
    renderMenu(`
      <UiMenuBar aria-label="Application">
        <UiMenu :options="{ openDelay: 0, closeDelay: 0 }">
          <UiMenuTrigger>File</UiMenuTrigger>
          <UiMenuContent><UiMenuItem id="file-open">Open</UiMenuItem></UiMenuContent>
        </UiMenu>
        <UiMenu :options="{ openDelay: 0, closeDelay: 0 }">
          <UiMenuTrigger>Edit</UiMenuTrigger>
          <UiMenuContent><UiMenuItem id="edit-copy">Copy</UiMenuItem></UiMenuContent>
        </UiMenu>
        <UiMenu>
          <UiMenuTrigger>View</UiMenuTrigger>
          <UiMenuContent><UiMenuItem id="view-zoom">Zoom</UiMenuItem></UiMenuContent>
        </UiMenu>
        <UiMenu>
          <UiMenuTrigger>Help</UiMenuTrigger>
          <UiMenuContent><UiMenuItem id="help-about">About</UiMenuItem></UiMenuContent>
        </UiMenu>
      </UiMenuBar>
    `)

    const bar = screen.getByRole("menubar", { name: "Application" })
    const file = screen.getByRole("menuitem", { name: "File" })
    const edit = screen.getByRole("menuitem", { name: "Edit" })
    expect(bar).toBeTruthy()
    expect(file.getAttribute("tabindex")).toBe("0")
    expect(edit.getAttribute("tabindex")).toBe("-1")

    await fireEvent.pointerEnter(edit, { pointerType: "mouse" })
    expect(edit.getAttribute("aria-expanded")).toBe("false")

    await fireEvent.click(file)
    expect(await screen.findByRole("menu")).toBeTruthy()
    expect(file.getAttribute("aria-expanded")).toBe("true")

    await fireEvent.pointerEnter(edit, { pointerType: "mouse" })
    await waitFor(() => {
      expect(file.getAttribute("aria-expanded")).toBe("false")
      expect(edit.getAttribute("aria-expanded")).toBe("true")
      expect(screen.getByText("Copy")).toBeTruthy()
      expect(screen.queryByText("Open")).toBeNull()
      expect(screen.getAllByRole("menu")).toHaveLength(1)
      expect(document.activeElement).toBe(file)
    })
  })

  it("keeps menubar keyboard navigation, Escape focus return, and ARIA state", async () => {
    renderMenu(`
      <UiMenuBar aria-label="Application">
        <UiMenu><UiMenuTrigger>File</UiMenuTrigger><UiMenuContent><UiMenuItem id="file-open">Open</UiMenuItem></UiMenuContent></UiMenu>
        <UiMenu><UiMenuTrigger>Edit</UiMenuTrigger><UiMenuContent><UiMenuItem id="edit-copy">Copy</UiMenuItem></UiMenuContent></UiMenu>
      </UiMenuBar>
    `)

    const file = screen.getByRole("menuitem", { name: "File" })
    const edit = screen.getByRole("menuitem", { name: "Edit" })
    await fireEvent.click(file)
    await waitFor(() => expect(file.getAttribute("aria-expanded")).toBe("true"))
    file.focus()
    await fireEvent.keyDown(file, { key: "ArrowRight" })
    expect(document.activeElement).toBe(edit)
    await waitFor(() => {
      expect(file.getAttribute("aria-expanded")).toBe("false")
      expect(edit.getAttribute("aria-expanded")).toBe("true")
    })
    await fireEvent.keyDown(edit, { key: "ArrowDown" })
    expect(edit.getAttribute("aria-expanded")).toBe("true")
    const menu = await screen.findByRole("menu")
    await fireEvent.keyDown(menu, { key: "Escape" })
    await waitFor(() => expect(edit.getAttribute("aria-expanded")).toBe("false"))
    expect(document.activeElement).toBe(edit)
  })

  it("closes the active root and its submenu after the pointer leaves the menubar", async () => {
    renderMenu(`
      <UiMenuBar aria-label="Application">
        <UiMenu>
          <UiMenuTrigger>File</UiMenuTrigger>
          <UiMenuContent>
            <UiSubMenu>
              <UiSubMenuTrigger>Export</UiSubMenuTrigger>
              <UiSubMenuContent><UiMenuItem id="file-pdf">PDF</UiMenuItem></UiSubMenuContent>
            </UiSubMenu>
          </UiMenuContent>
        </UiMenu>
      </UiMenuBar>
    `)

    const bar = screen.getByRole("menubar", { name: "Application" })
    const trigger = screen.getByRole("menuitem", { name: "File" })
    await fireEvent.click(trigger)
    const rootPanel = screen.getByRole("menu")

    await fireEvent.pointerLeave(bar, { pointerType: "mouse", relatedTarget: rootPanel })
    expect(trigger.getAttribute("aria-expanded")).toBe("true")

    const exportTrigger = screen.getByText("Export")
    await fireEvent.keyDown(exportTrigger, { key: "ArrowRight" })
    await screen.findByRole("menuitem", { name: "PDF" })
    expect(screen.getAllByRole("menu")).toHaveLength(2)

    vi.useFakeTimers()
    try {
      await fireEvent.pointerLeave(bar, { pointerType: "mouse", relatedTarget: document.body })
      await vi.advanceTimersByTimeAsync(150)
      expect(trigger.getAttribute("aria-expanded")).toBe("false")
      expect(screen.queryAllByRole("menu")).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it("clears the parent highlight when returning from a submenu", async () => {
    renderMenu(`
      <UiMenu>
        <UiMenuTrigger>Root</UiMenuTrigger>
        <UiMenuContent>
          <UiSubMenu>
            <UiSubMenuTrigger>More</UiSubMenuTrigger>
            <UiSubMenuContent><UiMenuItem id="nested-action">Nested action</UiMenuItem></UiSubMenuContent>
          </UiSubMenu>
        </UiMenuContent>
      </UiMenu>
    `)

    await fireEvent.click(screen.getByRole("button", { name: "Root" }))
    const rootPanel = await screen.findByRole("menu")
    await fireEvent.keyDown(rootPanel, { key: "ArrowDown" })
    const more = screen.getByText("More")
    expect(more.getAttribute("data-state")).toBe("highlighted")
    await fireEvent.keyDown(more, { key: "ArrowRight" })
    const nested = await screen.findByRole("menuitem", { name: "Nested action" })
    nested.focus()
    await fireEvent.keyDown(nested, { key: "ArrowLeft" })

    await waitFor(() => expect(screen.getAllByRole("menu")).toHaveLength(1))
    expect(more.getAttribute("data-state")).toBe("idle")
    expect(more.getAttribute("tabindex")).toBe("-1")
    expect(document.activeElement).toBe(more)
  })

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
    expect(handleSelect.mock.calls[0]![0].id).toBe("first")

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

  it("clears the first item highlight when the pointer returns from a context menu to its trigger", async () => {
    renderMenu(`
      <UiMenu>
        <UiMenuTrigger trigger="contextmenu">Canvas trigger</UiMenuTrigger>
        <UiMenuContent>
          <UiMenuItem id="context-first">First action</UiMenuItem>
          <UiMenuItem id="context-second">Second action</UiMenuItem>
        </UiMenuContent>
      </UiMenu>
    `)

    const trigger = screen.getByRole("button", { name: "Canvas trigger" })
    await fireEvent.contextMenu(trigger, { clientX: 30, clientY: 40 })
    await screen.findByRole("menu")
    const first = screen.getByRole("menuitem", { name: "First action" })

    await fireEvent.pointerEnter(first, { pointerType: "mouse" })
    expect(first.getAttribute("data-state")).toBe("highlighted")

    await fireEvent.pointerLeave(first, { pointerType: "mouse", relatedTarget: trigger })
    expect(first.getAttribute("data-state")).toBe("idle")
    expect(first.getAttribute("tabindex")).toBe("-1")
    expect(document.activeElement).toBe(trigger)
    expect(screen.getByRole("menu")).toBeTruthy()
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
