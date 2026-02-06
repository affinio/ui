import { describe, expect, it } from "vitest"
import { bootstrapAffinoTreeviews, hydrateTreeview } from "./index"

describe("treeview-laravel", () => {
  it("hydrates hierarchy, selection and branch toggles", () => {
    const root = document.createElement("div")
    root.setAttribute("data-affino-treeview-root", "treeview-demo")
    root.dataset.affinoTreeviewDefaultExpanded = "root,beta"
    root.dataset.affinoTreeviewDefaultSelected = "gamma"

    const rootItem = document.createElement("button")
    rootItem.setAttribute("data-affino-treeview-item", "")
    rootItem.setAttribute("data-affino-treeview-value", "root")
    const rootToggle = document.createElement("span")
    rootToggle.setAttribute("data-affino-treeview-toggle", "")
    rootItem.append(rootToggle)

    const alpha = document.createElement("button")
    alpha.setAttribute("data-affino-treeview-item", "")
    alpha.setAttribute("data-affino-treeview-value", "alpha")
    alpha.setAttribute("data-affino-treeview-parent", "root")

    const beta = document.createElement("button")
    beta.setAttribute("data-affino-treeview-item", "")
    beta.setAttribute("data-affino-treeview-value", "beta")
    beta.setAttribute("data-affino-treeview-parent", "root")
    const betaToggle = document.createElement("span")
    betaToggle.setAttribute("data-affino-treeview-toggle", "")
    beta.append(betaToggle)

    const gamma = document.createElement("button")
    gamma.setAttribute("data-affino-treeview-item", "")
    gamma.setAttribute("data-affino-treeview-value", "gamma")
    gamma.setAttribute("data-affino-treeview-parent", "beta")

    root.append(rootItem, alpha, beta, gamma)

    hydrateTreeview(root as HTMLElement & { dataset: DOMStringMap })

    expect(root.getAttribute("role")).toBe("tree")
    expect(root.dataset.affinoTreeviewSelected).toBe("gamma")
    expect(root.dataset.affinoTreeviewActive).toBe("gamma")
    expect(gamma.hidden).toBe(false)
    expect(beta.getAttribute("aria-expanded")).toBe("true")
    expect(betaToggle.dataset.state).toBe("expanded")

    betaToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    expect(beta.getAttribute("aria-expanded")).toBe("false")
    expect(betaToggle.dataset.state).toBe("collapsed")
    expect(gamma.hidden).toBe(true)
  })

  it("supports keyboard navigation helpers", () => {
    const root = document.createElement("div")
    root.setAttribute("data-affino-treeview-root", "keyboard-treeview")
    root.dataset.affinoTreeviewDefaultExpanded = "root,beta"
    root.dataset.affinoTreeviewDefaultActive = "root"
    root.dataset.affinoTreeviewLoop = "true"

    const rootItem = document.createElement("button")
    rootItem.setAttribute("data-affino-treeview-item", "")
    rootItem.setAttribute("data-affino-treeview-value", "root")

    const alpha = document.createElement("button")
    alpha.setAttribute("data-affino-treeview-item", "")
    alpha.setAttribute("data-affino-treeview-value", "alpha")
    alpha.setAttribute("data-affino-treeview-parent", "root")

    const beta = document.createElement("button")
    beta.setAttribute("data-affino-treeview-item", "")
    beta.setAttribute("data-affino-treeview-value", "beta")
    beta.setAttribute("data-affino-treeview-parent", "root")

    const gamma = document.createElement("button")
    gamma.setAttribute("data-affino-treeview-item", "")
    gamma.setAttribute("data-affino-treeview-value", "gamma")
    gamma.setAttribute("data-affino-treeview-parent", "beta")

    root.append(rootItem, alpha, beta, gamma)
    hydrateTreeview(root as HTMLElement & { dataset: DOMStringMap })

    rootItem.focus()
    expect(document.activeElement).toBe(rootItem)
    rootItem.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }))
    expect(root.dataset.affinoTreeviewActive).toBe("alpha")
    expect(document.activeElement).toBe(alpha)
    alpha.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }))
    expect(root.dataset.affinoTreeviewActive).toBe("beta")
    expect(document.activeElement).toBe(beta)
    beta.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))
    expect(root.dataset.affinoTreeviewActive).toBe("gamma")
    expect(document.activeElement).toBe(gamma)
    gamma.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }))
    expect(root.dataset.affinoTreeviewActive).toBe("beta")
    expect(document.activeElement).toBe(beta)
  })

  it("cleans up handle when structure disappears", () => {
    const root = document.createElement("div")
    root.setAttribute("data-affino-treeview-root", "cleanup-treeview")

    const item = document.createElement("button")
    item.setAttribute("data-affino-treeview-item", "")
    item.setAttribute("data-affino-treeview-value", "root")
    root.append(item)

    hydrateTreeview(root as HTMLElement & { dataset: DOMStringMap })
    expect((root as any).affinoTreeview).toBeDefined()

    item.remove()
    hydrateTreeview(root as HTMLElement & { dataset: DOMStringMap })
    expect((root as any).affinoTreeview).toBeUndefined()
  })
})

describe("treeview-laravel public API", () => {
  it("exposes bootstrap/hydrate functions", () => {
    expect(typeof bootstrapAffinoTreeviews).toBe("function")
    expect(typeof hydrateTreeview).toBe("function")
  })
})
