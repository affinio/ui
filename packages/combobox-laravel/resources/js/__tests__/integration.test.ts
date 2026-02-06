/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { bootstrapAffinoComboboxes, hydrateCombobox } from "../index"

type ComboboxTestRoot = HTMLDivElement & {
  affinoCombobox?: {
    getSnapshot(): { open: boolean; values: string[]; state: { activeIndex: number } }
  } | undefined
}

function createComboboxFixture() {
  const root = document.createElement("div") as ComboboxTestRoot
  root.dataset.affinoComboboxRoot = "combobox-spec"

  const input = document.createElement("input")
  input.dataset.affinoComboboxInput = ""
  root.appendChild(input)

  const surface = document.createElement("div")
  surface.dataset.affinoComboboxSurface = ""
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
  return { root, input, surface }
}

describe("combobox integration", () => {
  beforeEach(() => {
    delete (window as any).Livewire
    delete (window as any).__affinoComboboxLivewireHooked
    delete (window as any).__affinoComboboxObserver
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal("cancelAnimationFrame", () => {})
  })

  afterEach(() => {
    document.body.innerHTML = ""
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("exposes bootstrap/hydrate API", () => {
    expect(typeof bootstrapAffinoComboboxes).toBe("function")
    expect(typeof hydrateCombobox).toBe("function")
  })

  it("bootstraps without Livewire present", () => {
    const { root } = createComboboxFixture()
    expect(() => bootstrapAffinoComboboxes()).not.toThrow()
    expect(root.affinoCombobox).toBeDefined()
  })

  it("hydrates idempotently and opens once on input", () => {
    const { root, input } = createComboboxFixture()
    hydrateCombobox(root as any)
    hydrateCombobox(root as any)

    input.value = "a"
    input.dispatchEvent(new Event("input", { bubbles: true }))

    expect(root.affinoCombobox?.getSnapshot().open).toBe(true)
  })

  it("rehydrates on structural option changes", async () => {
    const { root, surface } = createComboboxFixture()
    hydrateCombobox(root as any)
    const handleBefore = root.affinoCombobox

    const option = document.createElement("button")
    option.dataset.affinoListboxOption = ""
    option.dataset.affinoListboxValue = "beta"
    option.textContent = "Beta"
    surface.appendChild(option)

    await Promise.resolve()
    await Promise.resolve()

    expect(root.affinoCombobox).not.toBe(handleBefore)
  })

  it("syncs open state from data-affino-combobox-state updates", async () => {
    const { root } = createComboboxFixture()
    hydrateCombobox(root as any)
    expect(root.affinoCombobox?.getSnapshot().open).toBe(false)

    root.dataset.affinoComboboxState = "true"
    await Promise.resolve()
    expect(root.affinoCombobox?.getSnapshot().open).toBe(true)

    root.dataset.affinoComboboxState = "false"
    await Promise.resolve()
    expect(root.affinoCombobox?.getSnapshot().open).toBe(false)
  })

  it("does not rehydrate on text-only mutations", () => {
    const { root, surface } = createComboboxFixture()
    hydrateCombobox(root as any)
    const handleBefore = root.affinoCombobox

    const option = surface.querySelector("[data-affino-listbox-option]") as HTMLButtonElement
    option.textContent = "Alpha updated"
    ;(root as any).affinoCombobox?.getSnapshot()

    expect(root.affinoCombobox).toBe(handleBefore)
  })

  it("triggers exactly one rehydrate for one structural change", async () => {
    const { root, surface } = createComboboxFixture()
    hydrateCombobox(root as any)

    const option = document.createElement("button")
    option.dataset.affinoListboxOption = ""
    option.dataset.affinoListboxValue = "gamma"
    option.textContent = "Gamma"
    surface.appendChild(option)

    await Promise.resolve()
    await Promise.resolve()
    const afterFirstPass = root.affinoCombobox

    await Promise.resolve()
    await Promise.resolve()

    expect(root.affinoCombobox).toBe(afterFirstPass)
  })

  it("cleans up handle after root disconnect", async () => {
    const { root } = createComboboxFixture()
    bootstrapAffinoComboboxes()
    expect(root.affinoCombobox).toBeDefined()

    root.remove()
    await Promise.resolve()
    await Promise.resolve()

    expect(root.affinoCombobox).toBeUndefined()
  })

  it("binds Livewire hooks after late livewire:load and hydrates morph additions", () => {
    createComboboxFixture()
    bootstrapAffinoComboboxes()

    const hooks: Record<string, (...args: any[]) => void> = {}
    ;(window as any).Livewire = {
      hook: vi.fn((name: string, handler: (...args: any[]) => void) => {
        hooks[name] = handler
      }),
    }

    document.dispatchEvent(new Event("livewire:load"))

    const lateRoot = document.createElement("div")
    lateRoot.dataset.affinoComboboxRoot = "combobox-late"
    lateRoot.innerHTML = `
      <input data-affino-combobox-input />
      <div data-affino-combobox-surface>
        <button data-affino-listbox-option data-affino-listbox-value="late">Late</button>
      </div>
    `

    hooks["morph.added"]?.({ el: lateRoot })
    expect((lateRoot as any).affinoCombobox).toBeDefined()
  })

  it("does not duplicate livewire hooks on repeated bootstrap", () => {
    const hook = vi.fn()
    ;(window as any).Livewire = { hook }
    createComboboxFixture()

    bootstrapAffinoComboboxes()
    bootstrapAffinoComboboxes()

    expect(hook).toHaveBeenCalledTimes(1)
  })

  it("rescans on livewire:navigated", () => {
    ;(window as any).Livewire = { hook: vi.fn() }
    const { root } = createComboboxFixture()
    bootstrapAffinoComboboxes()
    const handleBefore = root.affinoCombobox

    document.dispatchEvent(new Event("livewire:navigated"))

    expect(root.affinoCombobox).toBeDefined()
    expect(root.affinoCombobox).not.toBe(handleBefore)
  })

  it("does not commit selection when navigating with arrows in single mode", () => {
    const { root, input } = createComboboxFixture()
    hydrateCombobox(root as any)

    input.value = "a"
    input.dispatchEvent(new Event("input", { bubbles: true }))

    const handle = root.affinoCombobox
    expect(handle?.getSnapshot().open).toBe(true)
    expect(handle?.getSnapshot().values).toEqual([])

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }))
    const afterArrow = handle?.getSnapshot()
    expect(afterArrow?.open).toBe(true)
    expect(afterArrow?.values).toEqual([])
    expect(afterArrow?.state.activeIndex).toBe(0)

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }))
    const afterEnter = handle?.getSnapshot()
    expect(afterEnter?.values).toEqual(["alpha"])
    expect(afterEnter?.open).toBe(false)
  })
})
