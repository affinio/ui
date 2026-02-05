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
})
