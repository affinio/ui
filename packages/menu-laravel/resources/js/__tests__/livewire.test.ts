/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../menu/hydrate", () => ({
  disconnectMutationObserver: vi.fn(),
  restartMutationObserver: vi.fn(),
  scheduleRefresh: vi.fn(),
}))

import { setupLivewireHooks } from "../menu/livewire"
import { disconnectMutationObserver, restartMutationObserver, scheduleRefresh } from "../menu/hydrate"

describe("menu livewire hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete (window as any).__affinoMenuLivewireHooked
    delete (window as any).Livewire
  })

  it("binds hooks after late livewire:load", () => {
    setupLivewireHooks()

    const hook = vi.fn()
    ;(window as any).Livewire = { hook }
    document.dispatchEvent(new Event("livewire:load"))

    expect(hook).toHaveBeenCalled()
  })

  it("restarts observer and schedules refresh around livewire navigation", () => {
    ;(window as any).Livewire = { hook: vi.fn() }
    setupLivewireHooks()

    ;(disconnectMutationObserver as ReturnType<typeof vi.fn>).mockClear()
    ;(restartMutationObserver as ReturnType<typeof vi.fn>).mockClear()
    ;(scheduleRefresh as ReturnType<typeof vi.fn>).mockClear()

    document.dispatchEvent(new Event("livewire:navigating"))
    expect(disconnectMutationObserver).toHaveBeenCalled()

    document.dispatchEvent(new Event("livewire:navigated"))
    expect(restartMutationObserver).toHaveBeenCalled()
    expect(scheduleRefresh).toHaveBeenCalled()
  })

  it("wires livewire hook events to refresh scheduling", () => {
    ;(window as any).Livewire = { hook: vi.fn() }
    setupLivewireHooks()

    const hookMock = (window as any).Livewire.hook as ReturnType<typeof vi.fn>
    expect(hookMock).toHaveBeenCalledTimes(3)

    hookMock.mock.calls.forEach(([_name, handler]) => {
      if (typeof handler === "function") {
        handler()
      }
    })

    expect(scheduleRefresh).toHaveBeenCalledTimes(3)
  })
})
