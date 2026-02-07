/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest"

import { setupLivewireHooks } from "../dialog/livewire"

describe("dialog livewire hooks", () => {
  beforeEach(() => {
    delete (window as any).__affinoDialogLivewireHooked
    delete (window as any).Livewire
  })

  it("binds hooks after late livewire:load", () => {
    const scan = vi.fn()
    setupLivewireHooks(scan)

    const hook = vi.fn()
    ;(window as any).Livewire = { hook }

    document.dispatchEvent(new Event("livewire:load"))

    expect(hook).toHaveBeenCalled()
  })

  it("rescans document on livewire:navigated", () => {
    const scan = vi.fn()
    ;(window as any).Livewire = { hook: vi.fn() }

    setupLivewireHooks(scan)
    document.dispatchEvent(new Event("livewire:navigated"))

    expect(scan).toHaveBeenCalledWith(document)
  })

  it("scans morph.added payloads only when dialog roots are present", () => {
    const scan = vi.fn()
    const hooks: Record<string, (...args: any[]) => void> = {}
    ;(window as any).Livewire = {
      hook: vi.fn((name: string, handler: (...args: any[]) => void) => {
        hooks[name] = handler
      }),
    }

    setupLivewireHooks(scan)

    const unrelated = document.createElement("div")
    hooks["morph.added"]?.({ el: unrelated })
    expect(scan).not.toHaveBeenCalled()

    const scoped = document.createElement("div")
    scoped.innerHTML = `<div data-affino-dialog-root="x"></div>`
    hooks["morph.added"]?.({ el: scoped })
    expect(scan).toHaveBeenCalledWith(scoped)
  })

  it("scans message.processed scope only when scope contains dialogs", () => {
    const scan = vi.fn()
    const hooks: Record<string, (...args: any[]) => void> = {}
    ;(window as any).Livewire = {
      hook: vi.fn((name: string, handler: (...args: any[]) => void) => {
        hooks[name] = handler
      }),
    }

    setupLivewireHooks(scan)

    const unrelated = document.createElement("div")
    hooks["message.processed"]?.({}, { el: unrelated })
    expect(scan).not.toHaveBeenCalled()

    const scoped = document.createElement("div")
    scoped.innerHTML = `<div data-affino-dialog-root="x"></div>`
    hooks["message.processed"]?.({}, { el: scoped })
    expect(scan).toHaveBeenCalledWith(scoped)
  })

  it("falls back to document scan when message.processed scope is missing", () => {
    const scan = vi.fn()
    const hooks: Record<string, (...args: any[]) => void> = {}
    ;(window as any).Livewire = {
      hook: vi.fn((name: string, handler: (...args: any[]) => void) => {
        hooks[name] = handler
      }),
    }

    setupLivewireHooks(scan)
    hooks["message.processed"]?.({}, {})

    expect(scan).toHaveBeenCalledWith(document)
  })
})
