import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useEffect } from "react"
import {
  UiMenu,
  UiMenuTrigger,
  UiMenuContent,
  UiMenuItem,
  UiSubMenu,
  UiSubMenuTrigger,
  UiSubMenuContent,
} from "../index"
import { useMenuProvider } from "../context"
import type { MenuController } from "../useMenuController"

let capturedRootController: MenuController | null = null

function CaptureRootController() {
  const provider = useMenuProvider()
  useEffect(() => {
    if (!provider.parentController) {
      capturedRootController = provider.controller
    }
  }, [provider])
  return null
}

describe("UiMenu (React)", () => {
  afterEach(() => {
    capturedRootController = null
  })

  it("opens on click and emits select events", async () => {
    const user = userEvent.setup()
    const handleSelect = vi.fn()

    render(
      <UiMenu>
        <UiMenuTrigger>Open Menu</UiMenuTrigger>
        <UiMenuContent>
          <UiMenuItem id="first" onSelect={handleSelect}>
            First
          </UiMenuItem>
        </UiMenuContent>
      </UiMenu>,
    )

    const trigger = screen.getByRole("button", { name: /open menu/i })
    await user.click(trigger)

    const panel = await screen.findByRole("menu")
    await waitFor(() => {
      expect(panel).toHaveAttribute("data-state", "open")
    })

    const item = await screen.findByRole("menuitem", { name: /first/i })
    await user.click(item)

    expect(handleSelect).toHaveBeenCalledTimes(1)
    expect(handleSelect.mock.calls[0][0].id).toBe("first")

    await waitFor(() => {
      expect(screen.queryByRole("menu")).toBeNull()
    })
  })

  it("opens when UiMenuTrigger renders via asChild", async () => {
    const user = userEvent.setup()

    render(
      <UiMenu>
        <UiMenuTrigger asChild>
          <button type="button">As Child Trigger</button>
        </UiMenuTrigger>
        <UiMenuContent>
          <UiMenuItem id="alpha">Alpha</UiMenuItem>
        </UiMenuContent>
      </UiMenu>,
    )

    const trigger = screen.getByRole("button", { name: /as child trigger/i })
    await user.click(trigger)

    await waitFor(() => {
      expect(screen.getByRole("menu")).toBeTruthy()
    })
  })

  it("keeps default panel positioning class even with overrides", async () => {
    const user = userEvent.setup()

    render(
      <UiMenu>
        <UiMenuTrigger>Styled Menu</UiMenuTrigger>
        <UiMenuContent className="custom-panel">
          <UiMenuItem id="styled-item">Styled</UiMenuItem>
        </UiMenuContent>
      </UiMenu>,
    )

    const trigger = screen.getByRole("button", { name: /styled menu/i })
    await user.click(trigger)

    const panel = await screen.findByRole("menu")
    expect(panel.classList.contains("ui-menu-content")).toBe(true)
    expect(panel.classList.contains("custom-panel")).toBe(true)
  })

  it("focuses the panel after opening", async () => {
    const user = userEvent.setup()
    render(
      <UiMenu>
        <UiMenuTrigger>Focus Menu</UiMenuTrigger>
        <UiMenuContent>
          <UiMenuItem id="alpha">Alpha</UiMenuItem>
        </UiMenuContent>
      </UiMenu>,
    )

    await user.click(screen.getByRole("button", { name: /focus menu/i }))
    const panel = await screen.findByRole("menu")

    await waitFor(() => {
      expect(panel).toHaveAttribute("data-state", "open")
      expect(document.activeElement).toBe(panel)
    })
  })

  it("opens nested submenus with keyboard navigation", async () => {
    const user = userEvent.setup()
    render(
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
      </UiMenu>,
    )

    const trigger = screen.getByRole("button", { name: /main menu/i })
    await user.click(trigger)

    const rootPanel = await screen.findByRole("menu")
    await fireEvent.keyDown(rootPanel, { key: "ArrowDown" })
    const submenuTrigger = await screen.findByRole("menuitem", { name: /more/i })
    submenuTrigger.focus()
    await fireEvent.keyDown(submenuTrigger, { key: "ArrowRight" })

    await waitFor(() => {
      expect(screen.getAllByRole("menu")).toHaveLength(2)
    })

    expect(await screen.findByRole("menuitem", { name: /child/i })).toBeTruthy()
  })

  it("moves focus between adjacent submenu triggers", async () => {
    const user = userEvent.setup()
    render(
      <UiMenu>
        <UiMenuTrigger>Stacks</UiMenuTrigger>
        <UiMenuContent>
          <CaptureRootController />
          <UiSubMenu>
            <UiSubMenuTrigger>Analytics</UiSubMenuTrigger>
            <UiSubMenuContent>
              <UiMenuItem id="analytics-item">Sessions</UiMenuItem>
            </UiSubMenuContent>
          </UiSubMenu>
          <UiSubMenu>
            <UiSubMenuTrigger>Automation</UiSubMenuTrigger>
            <UiSubMenuContent>
              <UiMenuItem id="automation-item">Schedule</UiMenuItem>
            </UiSubMenuContent>
          </UiSubMenu>
          <UiSubMenu>
            <UiSubMenuTrigger>Access</UiSubMenuTrigger>
            <UiSubMenuContent>
              <UiMenuItem id="access-item">Invite</UiMenuItem>
            </UiSubMenuContent>
          </UiSubMenu>
        </UiMenuContent>
      </UiMenu>,
    )

    const trigger = screen.getByRole("button", { name: /stacks/i })
    await user.click(trigger)

    await waitFor(() => {
      expect(capturedRootController).toBeTruthy()
    })
    await user.keyboard("{ArrowDown}")

    const [firstTrigger, secondTrigger, thirdTrigger] = await screen.findAllByRole("menuitem")
    const getActiveItemId = () => capturedRootController?.state.activeItemId

    await waitFor(() => {
      expect(firstTrigger).toHaveAttribute("data-state", "highlighted")
      expect(getActiveItemId()).toBe(firstTrigger.id)
    })

    await user.keyboard("{ArrowDown}")
    await waitFor(() => {
      expect(secondTrigger).toHaveAttribute("data-state", "highlighted")
      expect(firstTrigger).toHaveAttribute("data-state", "idle")
      expect(getActiveItemId()).toBe(secondTrigger.id)
    })
    expect(getActiveItemId()).toBe(secondTrigger.id)

    await user.keyboard("{ArrowDown}")
    await waitFor(() => {
      expect(getActiveItemId()).toBe(thirdTrigger.id)
    })
    await waitFor(() => {
      expect(thirdTrigger).toHaveAttribute("data-state", "highlighted")
    })

    await user.keyboard("{ArrowUp}")
    await waitFor(() => {
      expect(secondTrigger).toHaveAttribute("data-state", "highlighted")
    })
  })

  it("moves focus through menu items with arrow keys", async () => {
    const user = userEvent.setup()
    render(
      <UiMenu>
        <UiMenuTrigger>Keyboard Menu</UiMenuTrigger>
        <UiMenuContent>
          <UiMenuItem id="alpha">Alpha</UiMenuItem>
          <UiMenuItem id="beta">Beta</UiMenuItem>
          <UiMenuItem id="gamma">Gamma</UiMenuItem>
        </UiMenuContent>
      </UiMenu>,
    )

    const trigger = screen.getByRole("button", { name: /keyboard menu/i })
    await user.click(trigger)
    await waitFor(() => {
      expect(screen.getByRole("menu")).toHaveAttribute("data-state", "open")
    })

    await user.keyboard("{ArrowDown}")
    const alpha = await screen.findByRole("menuitem", { name: /alpha/i })
    await waitFor(() => {
      expect(alpha).toHaveAttribute("data-state", "highlighted")
      expect(document.activeElement).toBe(alpha)
    })

    await user.keyboard("{ArrowDown}")
    const beta = await screen.findByRole("menuitem", { name: /beta/i })
    await waitFor(() => {
      expect(beta).toHaveAttribute("data-state", "highlighted")
      expect(document.activeElement).toBe(beta)
    })

    await user.keyboard("{ArrowDown}")
    const gamma = await screen.findByRole("menuitem", { name: /gamma/i })
    await waitFor(() => {
      expect(gamma).toHaveAttribute("data-state", "highlighted")
      expect(document.activeElement).toBe(gamma)
    })

    await user.keyboard("{ArrowUp}")
    await waitFor(() => {
      expect(beta).toHaveAttribute("data-state", "highlighted")
    })
  })

  it("switches between adjacent submenu triggers on hover", async () => {
    const user = userEvent.setup()
    render(
      <UiMenu options={{ openDelay: 0, closeDelay: 0 }}>
        <UiMenuTrigger>Root</UiMenuTrigger>
        <UiMenuContent>
          <UiSubMenu options={{ openDelay: 0, closeDelay: 0 }}>
            <UiSubMenuTrigger>First Submenu</UiSubMenuTrigger>
            <UiSubMenuContent>
              <UiMenuItem id="first-child">First Child</UiMenuItem>
            </UiSubMenuContent>
          </UiSubMenu>
          <UiSubMenu options={{ openDelay: 0, closeDelay: 0 }}>
            <UiSubMenuTrigger>Second Submenu</UiSubMenuTrigger>
            <UiSubMenuContent>
              <UiMenuItem id="second-child">Second Child</UiMenuItem>
            </UiSubMenuContent>
          </UiSubMenu>
        </UiMenuContent>
      </UiMenu>,
    )

    const rootTrigger = screen.getByRole("button", { name: /root/i })
    await user.click(rootTrigger)
    await screen.findByRole("menu")

    const firstTrigger = await screen.findByRole("menuitem", { name: /first submenu/i })
    const secondTrigger = await screen.findByRole("menuitem", { name: /second submenu/i })

    await user.hover(firstTrigger)
    await waitFor(() => {
      expect(screen.getAllByRole("menu")).toHaveLength(2)
      expect(screen.getByText("First Child")).toBeTruthy()
    })

    await user.unhover(firstTrigger)
    await user.hover(secondTrigger)

    await waitFor(() => {
      expect(screen.getAllByRole("menu")).toHaveLength(2)
      expect(screen.queryByText("First Child")).toBeNull()
      expect(screen.getByText("Second Child")).toBeTruthy()
    })
  })

  it("positions the panel relative to the trigger geometry", async () => {
    const user = userEvent.setup()
    const rectMap = new WeakMap<HTMLElement, DOMRect>()
    const makeRect = (rect: { x: number; y: number; width: number; height: number }): DOMRect => ({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      top: rect.y,
      left: rect.x,
      right: rect.x + rect.width,
      bottom: rect.y + rect.height,
      toJSON() {
        return {
          x: this.x,
          y: this.y,
          width: this.width,
          height: this.height,
          top: this.top,
          left: this.left,
          right: this.right,
          bottom: this.bottom,
        }
      },
    }) as DOMRect

    const getBoundingClientRectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function getRect(this: HTMLElement) {
        return rectMap.get(this) ?? makeRect({ x: 0, y: 0, width: 0, height: 0 })
      })

    const rafSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        const id = setTimeout(() => callback(performance.now()), 0)
        return id as unknown as number
      })

    const cancelRafSpy = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation((handle) => {
        clearTimeout(handle as unknown as ReturnType<typeof setTimeout>)
      })

    try {
      render(
        <UiMenu>
          <UiMenuTrigger>Menu</UiMenuTrigger>
          <UiMenuContent>
            <UiMenuItem id="demo">Demo Item</UiMenuItem>
          </UiMenuContent>
        </UiMenu>,
      )

      const trigger = screen.getByRole("button", { name: /menu/i })
      rectMap.set(trigger, makeRect({ x: 240, y: 180, width: 120, height: 42 }))

      await user.click(trigger)
      const panel = await screen.findByRole("menu")
      rectMap.set(panel, makeRect({ x: 0, y: 0, width: 220, height: 300 }))

      window.dispatchEvent(new Event("resize"))

      await waitFor(() => {
        expect(panel.style.left).toBe("240px")
        expect(panel.style.top).toBe("228px")
      })
    } finally {
      getBoundingClientRectSpy.mockRestore()
      rafSpy.mockRestore()
      cancelRafSpy.mockRestore()
    }
  })
})
