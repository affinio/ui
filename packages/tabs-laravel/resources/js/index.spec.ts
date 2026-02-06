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
})
