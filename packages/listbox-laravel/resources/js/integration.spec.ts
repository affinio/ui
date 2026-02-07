/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { bootstrapAffinoListboxes, hydrateListbox } from "./index"

type ListboxTestRoot = HTMLDivElement & {
  affinoListbox?: unknown
}

let fixtureId = 0

function createListboxFixture() {
  fixtureId += 1
  const root = document.createElement("div") as ListboxTestRoot
  root.dataset.affinoListboxRoot = `listbox-spec-${fixtureId}`

  const trigger = document.createElement("button")
  trigger.dataset.affinoListboxTrigger = ""
  root.appendChild(trigger)

  const surface = document.createElement("div")
  surface.dataset.affinoListboxSurface = ""
  root.appendChild(surface)

  const optionAlpha = document.createElement("button")
  optionAlpha.dataset.affinoListboxOption = ""
  optionAlpha.dataset.affinoListboxValue = "alpha"
  optionAlpha.textContent = "Alpha"
  surface.appendChild(optionAlpha)

  const optionBeta = document.createElement("button")
  optionBeta.dataset.affinoListboxOption = ""
  optionBeta.dataset.affinoListboxValue = "beta"
  optionBeta.textContent = "Beta"
  surface.appendChild(optionBeta)

  document.body.appendChild(root)
  return { root, trigger, surface, optionAlpha, optionBeta }
}

function createWrappedTriggerFixture() {
  fixtureId += 1
  const root = document.createElement("div") as ListboxTestRoot
  root.dataset.affinoListboxRoot = `listbox-wrapped-spec-${fixtureId}`

  const triggerWrapper = document.createElement("div")
  triggerWrapper.dataset.affinoListboxTrigger = ""
  root.appendChild(triggerWrapper)

  const triggerButton = document.createElement("button")
  triggerButton.type = "button"
  triggerButton.textContent = "Open"
  triggerWrapper.appendChild(triggerButton)

  const surface = document.createElement("div")
  surface.dataset.affinoListboxSurface = ""
  root.appendChild(surface)

  const optionAlpha = document.createElement("div")
  optionAlpha.dataset.affinoListboxOption = ""
  optionAlpha.dataset.affinoListboxValue = "alpha"
  optionAlpha.textContent = "Alpha"
  surface.appendChild(optionAlpha)

  const optionBeta = document.createElement("div")
  optionBeta.dataset.affinoListboxOption = ""
  optionBeta.dataset.affinoListboxValue = "beta"
  optionBeta.textContent = "Beta"
  surface.appendChild(optionBeta)

  document.body.appendChild(root)
  return { root, triggerWrapper, triggerButton, surface }
}

describe("listbox integration", () => {
  beforeEach(() => {
    delete (window as any).Livewire
    delete (window as any).__affinoListboxLivewireHooked
    delete (window as any).__affinoListboxObserver
  })

  afterEach(() => {
    document.body.innerHTML = ""
    vi.restoreAllMocks()
  })

  it("bootstraps without Livewire present", () => {
    const { root } = createListboxFixture()
    expect(() => bootstrapAffinoListboxes()).not.toThrow()
    expect(root.affinoListbox).toBeDefined()
  })

  it("hydrates idempotently without duplicate trigger listeners", () => {
    const { root, trigger, surface } = createListboxFixture()
    hydrateListbox(root as any)
    hydrateListbox(root as any)

    trigger.click()

    expect(root.dataset.affinoListboxState).toBe("open")
    expect(surface.hidden).toBe(false)
  })

  it("cancels option click default to avoid label-triggered reopen flows", () => {
    const { root, trigger, surface } = createListboxFixture()
    hydrateListbox(root as any)

    trigger.click()
    expect(root.dataset.affinoListboxState).toBe("open")

    const option = surface.querySelector("[data-affino-listbox-option]") as HTMLButtonElement
    const click = new MouseEvent("click", { bubbles: true, cancelable: true })
    const dispatched = option.dispatchEvent(click)

    expect(dispatched).toBe(false)
    expect(click.defaultPrevented).toBe(true)
    expect(root.dataset.affinoListboxState).toBe("closed")
    expect(surface.hidden).toBe(true)
  })

  it("moves focus out of surface before hiding it on single-select commit", () => {
    const { root, trigger, surface } = createListboxFixture()
    hydrateListbox(root as any)

    trigger.click()
    const option = surface.querySelector("[data-affino-listbox-option]") as HTMLButtonElement
    option.focus()
    expect(document.activeElement).toBe(option)

    option.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))

    expect(root.dataset.affinoListboxState).toBe("closed")
    expect(surface.hidden).toBe(true)
    expect(surface.getAttribute("aria-hidden")).toBe("true")
    expect(document.activeElement).toBe(trigger)
  })

  it("returns focus to nested trigger control before aria-hidden when trigger root is a wrapper", () => {
    const { root, triggerButton, surface } = createWrappedTriggerFixture()
    hydrateListbox(root as any)

    triggerButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    const option = surface.querySelector("[data-affino-listbox-option]") as HTMLDivElement
    option.focus()
    expect(document.activeElement).toBe(option)

    option.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))

    expect(root.dataset.affinoListboxState).toBe("closed")
    expect(surface.hidden).toBe(true)
    expect(surface.getAttribute("aria-hidden")).toBe("true")
    expect(document.activeElement).toBe(triggerButton)
  })

  it("keeps external focus on outside close instead of forcing trigger focus", () => {
    const { root, trigger, surface } = createListboxFixture()
    const outside = document.createElement("button")
    document.body.appendChild(outside)
    hydrateListbox(root as any)

    trigger.click()
    expect(root.dataset.affinoListboxState).toBe("open")
    expect(surface.hidden).toBe(false)

    outside.focus()
    outside.dispatchEvent(new Event("focusin", { bubbles: true }))

    expect(root.dataset.affinoListboxState).toBe("closed")
    expect(surface.hidden).toBe(true)
    expect(document.activeElement).toBe(outside)
  })

  it("cancels option mousedown default to avoid label-triggered trigger activation", () => {
    const { root, trigger, surface } = createListboxFixture()
    hydrateListbox(root as any)

    trigger.click()
    expect(root.dataset.affinoListboxState).toBe("open")

    const option = surface.querySelector("[data-affino-listbox-option]") as HTMLButtonElement
    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true })
    const dispatched = option.dispatchEvent(down)

    expect(dispatched).toBe(false)
    expect(down.defaultPrevented).toBe(true)
  })

  it("rehydrates on structural option changes", async () => {
    const { root, surface } = createListboxFixture()
    hydrateListbox(root as any)
    const handleBefore = root.affinoListbox

    const option = document.createElement("button")
    option.dataset.affinoListboxOption = ""
    option.dataset.affinoListboxValue = "beta"
    option.textContent = "Beta"
    surface.appendChild(option)

    await Promise.resolve()
    await Promise.resolve()

    expect(root.affinoListbox).not.toBe(handleBefore)
  })

  it("does not rehydrate on text-only mutations", () => {
    const { root, surface } = createListboxFixture()
    hydrateListbox(root as any)
    const handleBefore = root.affinoListbox

    const option = surface.querySelector("[data-affino-listbox-option]") as HTMLButtonElement
    option.textContent = "Alpha updated"
    ;(root as any).affinoListbox?.getSnapshot()

    expect(root.affinoListbox).toBe(handleBefore)
  })

  it("triggers exactly one rehydrate for one structural change", async () => {
    const { root, surface } = createListboxFixture()
    hydrateListbox(root as any)

    const option = document.createElement("button")
    option.dataset.affinoListboxOption = ""
    option.dataset.affinoListboxValue = "gamma"
    option.textContent = "Gamma"
    surface.appendChild(option)

    await Promise.resolve()
    await Promise.resolve()
    const afterFirstPass = root.affinoListbox

    await Promise.resolve()
    await Promise.resolve()

    expect(root.affinoListbox).toBe(afterFirstPass)
  })

  it("cleans up handle after root disconnect", async () => {
    const { root } = createListboxFixture()
    bootstrapAffinoListboxes()
    expect(root.affinoListbox).toBeDefined()

    root.remove()
    await Promise.resolve()
    await Promise.resolve()

    expect(root.affinoListbox).toBeUndefined()
  })

  it("cleans up stale handle when required structure is missing", () => {
    const { root, surface } = createListboxFixture()
    hydrateListbox(root as any)
    expect(root.affinoListbox).toBeDefined()

    surface.remove()
    hydrateListbox(root as any)

    expect(root.affinoListbox).toBeUndefined()
    expect(root.dataset.affinoListboxState).toBe("closed")
  })

  it("does not rehydrate for unrelated DOM additions", async () => {
    const { root } = createListboxFixture()
    bootstrapAffinoListboxes()
    const handleBefore = root.affinoListbox

    const unrelated = document.createElement("div")
    unrelated.textContent = "unrelated"
    document.body.appendChild(unrelated)

    await Promise.resolve()
    await Promise.resolve()

    expect(root.affinoListbox).toBe(handleBefore)
  })

  it("binds Livewire hooks after late livewire:load and hydrates morph additions", () => {
    createListboxFixture()
    bootstrapAffinoListboxes()

    const hooks: Record<string, (...args: any[]) => void> = {}
    ;(window as any).Livewire = {
      hook: vi.fn((name: string, handler: (...args: any[]) => void) => {
        hooks[name] = handler
      }),
    }

    document.dispatchEvent(new Event("livewire:load"))

    const lateRoot = document.createElement("div")
    lateRoot.dataset.affinoListboxRoot = "listbox-late"
    lateRoot.innerHTML = `
      <button data-affino-listbox-trigger></button>
      <div data-affino-listbox-surface>
        <button data-affino-listbox-option data-affino-listbox-value="late">Late</button>
      </div>
    `

    hooks["morph.added"]?.({ el: lateRoot })
    expect((lateRoot as any).affinoListbox).toBeDefined()
  })

  it("does not duplicate livewire hooks on repeated bootstrap", () => {
    const hook = vi.fn()
    ;(window as any).Livewire = { hook }
    createListboxFixture()

    bootstrapAffinoListboxes()
    bootstrapAffinoListboxes()

    expect(hook).toHaveBeenCalledTimes(1)
  })

  it("rescans on livewire:navigated", () => {
    ;(window as any).Livewire = { hook: vi.fn() }
    const { root } = createListboxFixture()
    bootstrapAffinoListboxes()
    const handleBefore = root.affinoListbox

    document.dispatchEvent(new Event("livewire:navigated"))

    expect(root.affinoListbox).toBeDefined()
    expect(root.affinoListbox).not.toBe(handleBefore)
  })

  it("does not commit selection when navigating with arrows in single mode", () => {
    const { root, trigger } = createListboxFixture()
    hydrateListbox(root as any)

    trigger.click()

    const handle = (root as any).affinoListbox as {
      getSnapshot(): { open: boolean; values: string[]; state: { activeIndex: number } }
    }
    expect(handle.getSnapshot().open).toBe(true)
    expect(handle.getSnapshot().values).toEqual([])

    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }))
    const afterArrow = handle.getSnapshot()
    expect(afterArrow.open).toBe(true)
    expect(afterArrow.values).toEqual([])
    expect(afterArrow.state.activeIndex).toBe(0)

    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }))
    const afterEnter = handle.getSnapshot()
    expect(afterEnter.values).toEqual(["alpha"])
    expect(afterEnter.open).toBe(false)
  })

  it("tracks options only inside listbox surface", () => {
    const { root, trigger } = createListboxFixture()
    const rogue = document.createElement("button")
    rogue.dataset.affinoListboxOption = ""
    rogue.dataset.affinoListboxValue = "rogue"
    rogue.textContent = "Rogue"
    root.insertBefore(rogue, root.firstChild)

    hydrateListbox(root as any)
    trigger.click()

    const handle = (root as any).affinoListbox as {
      getSnapshot(): { values: string[] }
    }
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }))
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }))

    expect(handle.getSnapshot().values).toEqual(["alpha"])
  })

  it("applies listbox ARIA semantics and tracks active descendant", () => {
    const { root, trigger, surface } = createListboxFixture()
    root.dataset.affinoListboxMode = "multiple"
    const options = surface.querySelectorAll<HTMLButtonElement>("[data-affino-listbox-option]")
    const optionAlpha = options[0]
    const optionBeta = options[1]
    optionBeta.dataset.affinoListboxDisabled = "true"

    hydrateListbox(root as any)

    expect(surface.getAttribute("role")).toBe("listbox")
    expect(surface.getAttribute("aria-multiselectable")).toBe("true")
    expect(trigger.getAttribute("aria-haspopup")).toBe("listbox")
    expect(trigger.getAttribute("aria-disabled")).toBe("false")
    expect(optionBeta.getAttribute("aria-disabled")).toBe("true")

    trigger.click()
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }))

    expect(surface.getAttribute("aria-activedescendant")).toBe(optionAlpha.id)
    expect(optionAlpha.getAttribute("role")).toBe("option")
    expect(optionAlpha.getAttribute("aria-selected")).toBe("false")
    expect(surface.getAttribute("aria-hidden")).toBe("false")
  })
})
