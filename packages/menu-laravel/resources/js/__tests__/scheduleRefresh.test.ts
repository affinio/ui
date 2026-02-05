import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { scheduleRefresh } from "../menu/hydrate"

describe("scheduleRefresh", () => {
  let originalRaf: typeof requestAnimationFrame | undefined

  beforeEach(() => {
    originalRaf = globalThis.requestAnimationFrame
    // Force the branch that falls back to setTimeout for deterministic tests.
    ;(globalThis as any).requestAnimationFrame = undefined
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    ;(globalThis as any).requestAnimationFrame = originalRaf
  })

  it("coalesces concurrent refresh requests", () => {
    const timeoutSpy = vi.spyOn(globalThis, "setTimeout")

    scheduleRefresh()
    scheduleRefresh()

    expect(timeoutSpy).toHaveBeenCalledTimes(1)

    vi.runAllTimers()

    scheduleRefresh()

    expect(timeoutSpy).toHaveBeenCalledTimes(2)
  })
})
