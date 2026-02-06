/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { bootstrapAffinoListboxes, hydrateListbox } from "./index"

type ListboxTestRoot = HTMLDivElement & {
  affinoListbox?: unknown
}

function createListboxFixture() {
  const root = document.createElement("div") as ListboxTestRoot
  root.dataset.affinoListboxRoot = "listbox-spec"

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
  return { root, trigger, surface }
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
})
