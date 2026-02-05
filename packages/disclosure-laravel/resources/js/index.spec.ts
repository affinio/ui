import { describe, expect, it } from "vitest"
import { hydrateDisclosure } from "./index"

describe("disclosure-laravel", () => {
  it("hydrates root and toggles content visibility", () => {
    const root = document.createElement("div")
    root.setAttribute("data-affino-disclosure-root", "test-disclosure")

    const trigger = document.createElement("button")
    trigger.setAttribute("data-affino-disclosure-trigger", "")
    const content = document.createElement("div")
    content.setAttribute("data-affino-disclosure-content", "")
    content.hidden = true

    root.appendChild(trigger)
    root.appendChild(content)
    hydrateDisclosure(root as HTMLElement & { dataset: DOMStringMap })

    trigger.click()
    expect(content.hidden).toBe(false)
    expect(content.dataset.state).toBe("open")
  })
})
