import { afterEach, describe, expect, it, vi } from "vitest"
import { bindLivewireActionBridge } from "./livewireActionBridge"

describe("livewire action bridge", () => {
  afterEach(() => {
    document.body.innerHTML = ""
    delete (window as any).Livewire
    vi.restoreAllMocks()
  })

  it("calls component method using explicit owner id", () => {
    const call = vi.fn()
    const find = vi.fn((id: string) => (id === "cmp-explicit" ? { call } : null))
    ;(window as any).Livewire = { find }

    const root = document.createElement("div")
    root.innerHTML = `
      <button
        type="button"
        data-affino-livewire-owner="cmp-explicit"
        data-affino-livewire-call="saveDraft"
      >
        Save
      </button>
    `
    document.body.appendChild(root)
    bindLivewireActionBridge({ root })

    const button = root.querySelector("button") as HTMLButtonElement
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }))

    expect(call).toHaveBeenCalledWith("saveDraft")
  })

  it("falls back to owning wire:id for teleported dialog content when explicit owner is stale", () => {
    const call = vi.fn()
    const find = vi.fn((id: string) => (id === "wire-live-123" ? { call } : null))
    ;(window as any).Livewire = { find }

    const root = document.createElement("div")
    root.innerHTML = `
      <div wire:id="wire-live-123">
        <div data-affino-dialog-root="dialog-owner-1"></div>
      </div>
      <div data-affino-dialog-owner="dialog-owner-1">
        <button
          type="button"
          data-affino-livewire-owner="dialogs-simple"
          data-affino-livewire-call="saveDraft"
        >
          Save
        </button>
      </div>
    `
    document.body.appendChild(root)
    bindLivewireActionBridge({ root })

    const button = root.querySelector("[data-affino-livewire-call='saveDraft']") as HTMLButtonElement
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }))

    expect(find).toHaveBeenCalledWith("dialogs-simple")
    expect(find).toHaveBeenCalledWith("wire-live-123")
    expect(call).toHaveBeenCalledWith("saveDraft")
  })

  it("resolves owner from connected root with wire:id when duplicate dialog roots exist", () => {
    const call = vi.fn()
    const find = vi.fn((id: string) => (id === "wire-live-456" ? { call } : null))
    ;(window as any).Livewire = { find }

    const root = document.createElement("div")
    root.innerHTML = `
      <div data-affino-dialog-root="dialog-owner-dup"></div>
      <section wire:id="wire-live-456">
        <div data-affino-dialog-root="dialog-owner-dup"></div>
      </section>
      <div data-affino-dialog-owner="dialog-owner-dup">
        <button
          type="button"
          data-affino-livewire-owner="dialogs-simple"
          data-affino-livewire-call="saveDraft"
        >
          Save
        </button>
      </div>
    `
    document.body.appendChild(root)
    bindLivewireActionBridge({ root })

    const button = root.querySelector("[data-affino-livewire-call='saveDraft']") as HTMLButtonElement
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }))

    expect(find).toHaveBeenCalledWith("dialogs-simple")
    expect(find).toHaveBeenCalledWith("wire-live-456")
    expect(call).toHaveBeenCalledWith("saveDraft")
  })

  it("passes JSON args payload to livewire method", () => {
    const call = vi.fn()
    const find = vi.fn((id: string) => (id === "cmp-explicit" ? { call } : null))
    ;(window as any).Livewire = { find }

    const root = document.createElement("div")
    root.innerHTML = `
      <button
        type="button"
        data-affino-livewire-owner="cmp-explicit"
        data-affino-livewire-call="apply"
        data-affino-livewire-args='[42, "high"]'
      >
        Apply
      </button>
    `
    document.body.appendChild(root)
    bindLivewireActionBridge({ root })

    const button = root.querySelector("button") as HTMLButtonElement
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }))

    expect(call).toHaveBeenCalledWith("apply", 42, "high")
  })

  it("supports method calls via $wire.$call fallback", () => {
    const wireCall = vi.fn()
    const find = vi.fn((id: string) => (id === "cmp-explicit" ? ({ $wire: { $call: wireCall } } as any) : null))
    ;(window as any).Livewire = { find }

    const root = document.createElement("div")
    root.innerHTML = `
      <button
        type="button"
        data-affino-livewire-owner="cmp-explicit"
        data-affino-livewire-call="saveDraft"
      >
        Save
      </button>
    `
    document.body.appendChild(root)
    bindLivewireActionBridge({ root })

    const button = root.querySelector("button") as HTMLButtonElement
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }))

    expect(wireCall).toHaveBeenCalledWith("saveDraft")
  })

  it("syncs model value on input events", () => {
    const set = vi.fn()
    const find = vi.fn((id: string) => (id === "cmp-explicit" ? { call: vi.fn(), set } : null))
    ;(window as any).Livewire = { find }

    const root = document.createElement("div")
    root.innerHTML = `
      <input
        type="text"
        value="draft"
        data-affino-livewire-owner="cmp-explicit"
        data-affino-livewire-model="title"
        data-affino-livewire-model-event="input"
      />
    `
    document.body.appendChild(root)
    bindLivewireActionBridge({ root })

    const input = root.querySelector("input") as HTMLInputElement
    input.value = "updated"
    input.dispatchEvent(new Event("input", { bubbles: true }))

    expect(set).toHaveBeenCalledWith("title", "updated")
  })

  it("syncs model value using inferred owner from teleported dialog context", () => {
    const set = vi.fn()
    const find = vi.fn((id: string) => (id === "wire-live-123" ? { call: vi.fn(), set } : null))
    ;(window as any).Livewire = { find }

    const root = document.createElement("div")
    root.innerHTML = `
      <div wire:id="wire-live-123">
        <div data-affino-dialog-root="dialog-owner-1"></div>
      </div>
      <div data-affino-dialog-owner="dialog-owner-1">
        <input
          type="text"
          value="before"
          data-affino-livewire-owner="dialogs-simple"
          data-affino-livewire-model="title"
          data-affino-livewire-model-event="input"
        />
      </div>
    `
    document.body.appendChild(root)
    bindLivewireActionBridge({ root })

    const input = root.querySelector("input") as HTMLInputElement
    input.value = "after"
    input.dispatchEvent(new Event("input", { bubbles: true }))

    expect(set).toHaveBeenCalledWith("title", "after")
  })

  it("supports model sync via $wire.$set fallback", () => {
    const wireSet = vi.fn()
    const find = vi.fn((id: string) => (id === "cmp-explicit" ? ({ $wire: { $set: wireSet } } as any) : null))
    ;(window as any).Livewire = { find }

    const root = document.createElement("div")
    root.innerHTML = `
      <input
        type="text"
        value="draft"
        data-affino-livewire-owner="cmp-explicit"
        data-affino-livewire-model="title"
        data-affino-livewire-model-event="input"
      />
    `
    document.body.appendChild(root)
    bindLivewireActionBridge({ root })

    const input = root.querySelector("input") as HTMLInputElement
    input.value = "updated"
    input.dispatchEvent(new Event("input", { bubbles: true }))

    expect(wireSet).toHaveBeenCalledWith("title", "updated")
  })
})
