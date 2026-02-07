/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../menu/hydrate", () => ({
  disconnectMutationObserver: vi.fn(),
  refreshMenusInScope: vi.fn(),
  restartMutationObserver: vi.fn(),
  scheduleRefresh: vi.fn(),
}))

import { setupLivewireHooks } from "../menu/livewire"
import { disconnectMutationObserver, refreshMenusInScope, restartMutationObserver, scheduleRefresh } from "../menu/hydrate"

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
    expect(scheduleRefresh).toHaveBeenCalled()
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
    expect(hookMock).toHaveBeenCalledTimes(5)

    hookMock.mock.calls.forEach(([_name, handler]) => {
      if (typeof handler === "function") {
        handler()
      }
    })

    expect(scheduleRefresh).toHaveBeenCalled()
  })

  it("refreshes scope on morph hooks when element is provided", () => {
    ;(window as any).Livewire = { hook: vi.fn() }
    setupLivewireHooks()

    const hookMock = (window as any).Livewire.hook as ReturnType<typeof vi.fn>
    const handlers = new Map<string, (...args: unknown[]) => void>()
    hookMock.mock.calls.forEach(([name, handler]) => {
      if (typeof name === "string" && typeof handler === "function") {
        handlers.set(name, handler)
      }
    })

    const scope = document.createElement("div")
    handlers.get("morph.added")?.({ el: scope })
    handlers.get("morph.updated")?.({ el: scope })

    expect(refreshMenusInScope).toHaveBeenCalledTimes(2)
    expect(refreshMenusInScope).toHaveBeenNthCalledWith(1, scope)
    expect(refreshMenusInScope).toHaveBeenNthCalledWith(2, scope)
  })

  it("skips refresh work for scoped morph updates that do not include menu roots", () => {
    ;(window as any).Livewire = { hook: vi.fn() }
    setupLivewireHooks()

    const hookMock = (window as any).Livewire.hook as ReturnType<typeof vi.fn>
    const handlers = new Map<string, (...args: unknown[]) => void>()
    hookMock.mock.calls.forEach(([name, handler]) => {
      if (typeof name === "string" && typeof handler === "function") {
        handlers.set(name, handler)
      }
    })

    ;(scheduleRefresh as ReturnType<typeof vi.fn>).mockClear()
    ;(refreshMenusInScope as ReturnType<typeof vi.fn>).mockClear()

    const scope = document.createElement("div")
    handlers.get("morph.added")?.({ el: scope })
    handlers.get("morph.updated")?.({ el: scope })
    handlers.get("message.processed")?.({ component: { el: scope } })
    handlers.get("commit")?.({ component: { el: scope } })

    expect(refreshMenusInScope).not.toHaveBeenCalled()
    expect(scheduleRefresh).not.toHaveBeenCalled()
  })

  it("falls back to full refresh on component removal when scope is disconnected", () => {
    ;(window as any).Livewire = { hook: vi.fn() }
    setupLivewireHooks()

    const hookMock = (window as any).Livewire.hook as ReturnType<typeof vi.fn>
    const handlers = new Map<string, (...args: unknown[]) => void>()
    hookMock.mock.calls.forEach(([name, handler]) => {
      if (typeof name === "string" && typeof handler === "function") {
        handlers.set(name, handler)
      }
    })

    ;(scheduleRefresh as ReturnType<typeof vi.fn>).mockClear()
    ;(refreshMenusInScope as ReturnType<typeof vi.fn>).mockClear()

    const disconnected = document.createElement("div")
    disconnected.dataset.affinoMenuRoot = "menu-disconnected"
    handlers.get("component.removed")?.({ el: disconnected })

    expect(refreshMenusInScope).not.toHaveBeenCalled()
    expect(scheduleRefresh).toHaveBeenCalledTimes(1)
  })
})
