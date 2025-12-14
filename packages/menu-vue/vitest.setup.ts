import { afterEach, vi } from "vitest"
import { cleanup } from "@testing-library/vue"

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof window !== "undefined" && !("ResizeObserver" in window)) {
  // @ts-expect-error minimal polyfill for tests
  window.ResizeObserver = ResizeObserverMock
}

if (typeof window !== "undefined" && !window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
}

if (typeof window !== "undefined" && !window.requestAnimationFrame) {
  window.requestAnimationFrame = (cb) => window.setTimeout(cb, 16)
}

afterEach(() => {
  cleanup()
})
