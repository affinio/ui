import { afterEach, describe, expect, it } from "vitest"
import { bootstrapAffinoTreeviews, hydrateTreeview } from "./index"

afterEach(() => {
  document.body.innerHTML = ""
})

describe("treeview-laravel", () => {
  it("hydrates hierarchy, selection and branch toggles", () => {
    const root = document.createElement("div")
    root.setAttribute("data-affino-treeview-root", "treeview-demo")
    root.dataset.affinoTreeviewDefaultExpanded = "root,beta"
    root.dataset.affinoTreeviewDefaultSelected = "gamma"
    document.body.append(root)

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
    document.body.append(root)

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
    document.body.append(root)

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

  it("rehydrates attribute morphs without losing expansion and selection", async () => {
    const root = document.createElement("div")
    root.setAttribute("data-affino-treeview-root", "morph-treeview")
    const parent = document.createElement("button")
    parent.dataset.affinoTreeviewItem = ""
    parent.dataset.affinoTreeviewValue = "parent"
    const child = document.createElement("button")
    child.dataset.affinoTreeviewItem = ""
    child.dataset.affinoTreeviewValue = "child"
    child.dataset.affinoTreeviewParent = "parent"
    root.append(parent, child)
    document.body.append(root)

    hydrateTreeview(root as any)
    ;(root as any).affinoTreeview.expand("parent")
    ;(root as any).affinoTreeview.select("child")
    bootstrapAffinoTreeviews()

    parent.dataset.affinoTreeviewDisabled = "true"
    await Promise.resolve()
    await Promise.resolve()

    expect(root.dataset.affinoTreeviewSelected).toBe("child")
    expect(parent.getAttribute("aria-expanded")).toBe("true")
    expect(parent.getAttribute("aria-disabled")).toBe("true")
  })
})

describe("treeview-laravel public API", () => {
  it("exposes bootstrap/hydrate functions", () => {
    expect(typeof bootstrapAffinoTreeviews).toBe("function")
    expect(typeof hydrateTreeview).toBe("function")
  })
})
