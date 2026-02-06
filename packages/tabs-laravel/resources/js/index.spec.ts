import { describe, expect, it } from "vitest"
import { hydrateTabs } from "./index"

describe("tabs-laravel", () => {
  it("hydrates root and switches active panel by selected value", () => {
    const root = document.createElement("div")
    root.setAttribute("data-affino-tabs-root", "test-tabs")

    const triggerA = document.createElement("button")
    triggerA.setAttribute("data-affino-tabs-trigger", "")
    triggerA.setAttribute("data-affino-tabs-value", "general")

    const triggerB = document.createElement("button")
    triggerB.setAttribute("data-affino-tabs-trigger", "")
    triggerB.setAttribute("data-affino-tabs-value", "billing")

    const panelA = document.createElement("div")
    panelA.setAttribute("data-affino-tabs-content", "")
    panelA.setAttribute("data-affino-tabs-value", "general")
    panelA.hidden = true

    const panelB = document.createElement("div")
    panelB.setAttribute("data-affino-tabs-content", "")
    panelB.setAttribute("data-affino-tabs-value", "billing")
    panelB.hidden = true

    root.appendChild(triggerA)
    root.appendChild(triggerB)
    root.appendChild(panelA)
    root.appendChild(panelB)
    hydrateTabs(root as HTMLElement & { dataset: DOMStringMap })

    triggerA.click()
    expect(panelA.hidden).toBe(false)
    expect(panelB.hidden).toBe(true)
    expect(panelA.dataset.state).toBe("active")
    expect(panelB.dataset.state).toBe("inactive")

    triggerB.click()
    expect(panelA.hidden).toBe(true)
    expect(panelB.hidden).toBe(false)
    expect(root.dataset.affinoTabsValue).toBe("billing")
    expect(root.getAttribute("role")).toBe("tablist")
    expect(triggerA.getAttribute("role")).toBe("tab")
    expect(panelA.getAttribute("role")).toBe("tabpanel")
    expect(triggerA.getAttribute("aria-controls")).toBe(panelA.id)
    expect(panelA.getAttribute("aria-labelledby")).toBe(triggerA.id)
  })

  it("cleans up handle when required tabs structure is removed", () => {
    const root = document.createElement("div")
    root.setAttribute("data-affino-tabs-root", "cleanup-tabs")

    const trigger = document.createElement("button")
    trigger.setAttribute("data-affino-tabs-trigger", "")
    trigger.setAttribute("data-affino-tabs-value", "general")
    const panel = document.createElement("div")
    panel.setAttribute("data-affino-tabs-content", "")
    panel.setAttribute("data-affino-tabs-value", "general")

    root.appendChild(trigger)
    root.appendChild(panel)
    hydrateTabs(root as HTMLElement & { dataset: DOMStringMap })
    expect((root as any).affinoTabs).toBeDefined()

    panel.remove()
    hydrateTabs(root as HTMLElement & { dataset: DOMStringMap })

    expect((root as any).affinoTabs).toBeUndefined()
  })

  it("supports keyboard navigation and activation", () => {
    const root = document.createElement("div")
    root.setAttribute("data-affino-tabs-root", "keyboard-tabs")

    const triggerA = document.createElement("button")
    triggerA.setAttribute("data-affino-tabs-trigger", "")
    triggerA.setAttribute("data-affino-tabs-value", "general")

    const triggerB = document.createElement("button")
    triggerB.setAttribute("data-affino-tabs-trigger", "")
    triggerB.setAttribute("data-affino-tabs-value", "billing")

    const triggerC = document.createElement("button")
    triggerC.setAttribute("data-affino-tabs-trigger", "")
    triggerC.setAttribute("data-affino-tabs-value", "security")

    const panelA = document.createElement("div")
    panelA.setAttribute("data-affino-tabs-content", "")
    panelA.setAttribute("data-affino-tabs-value", "general")

    const panelB = document.createElement("div")
    panelB.setAttribute("data-affino-tabs-content", "")
    panelB.setAttribute("data-affino-tabs-value", "billing")

    const panelC = document.createElement("div")
    panelC.setAttribute("data-affino-tabs-content", "")
    panelC.setAttribute("data-affino-tabs-value", "security")

    root.appendChild(triggerA)
    root.appendChild(triggerB)
    root.appendChild(triggerC)
    root.appendChild(panelA)
    root.appendChild(panelB)
    root.appendChild(panelC)

    hydrateTabs(root as HTMLElement & { dataset: DOMStringMap })

    triggerA.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))
    expect(root.dataset.affinoTabsValue).toBe("billing")
    expect(triggerB.getAttribute("aria-selected")).toBe("true")
    expect(triggerB.tabIndex).toBe(0)
    expect(panelB.hidden).toBe(false)

    triggerB.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }))
    expect(root.dataset.affinoTabsValue).toBe("security")
    expect(triggerC.getAttribute("aria-selected")).toBe("true")
    expect(panelC.hidden).toBe(false)

    triggerC.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }))
    expect(root.dataset.affinoTabsValue).toBe("general")
    expect(triggerA.getAttribute("aria-selected")).toBe("true")
    expect(panelA.hidden).toBe(false)

    triggerA.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }))
    expect(root.dataset.affinoTabsValue).toBe("general")
  })

  it("falls back to the first available tab when default value is invalid", () => {
    const root = document.createElement("div")
    root.setAttribute("data-affino-tabs-root", "default-fallback")
    root.dataset.affinoTabsDefaultValue = "missing"

    const triggerA = document.createElement("button")
    triggerA.setAttribute("data-affino-tabs-trigger", "")
    triggerA.setAttribute("data-affino-tabs-value", "general")

    const triggerB = document.createElement("button")
    triggerB.setAttribute("data-affino-tabs-trigger", "")
    triggerB.setAttribute("data-affino-tabs-value", "billing")

    const panelA = document.createElement("div")
    panelA.setAttribute("data-affino-tabs-content", "")
    panelA.setAttribute("data-affino-tabs-value", "general")

    const panelB = document.createElement("div")
    panelB.setAttribute("data-affino-tabs-content", "")
    panelB.setAttribute("data-affino-tabs-value", "billing")

    root.appendChild(triggerA)
    root.appendChild(triggerB)
    root.appendChild(panelA)
    root.appendChild(panelB)

    hydrateTabs(root as HTMLElement & { dataset: DOMStringMap })

    expect(root.dataset.affinoTabsValue).toBe("general")
    expect(panelA.hidden).toBe(false)
    expect(panelB.hidden).toBe(true)
    expect(triggerA.tabIndex).toBe(0)
    expect(triggerB.tabIndex).toBe(-1)

    ;(root as any).affinoTabs?.select("missing")
    expect(root.dataset.affinoTabsValue).toBe("general")
  })
})
