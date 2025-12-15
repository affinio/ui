import "@testing-library/jest-dom/vitest"
import { afterEach, vi } from "vitest"
import { cleanup } from "@testing-library/react"

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

if (typeof window !== "undefined" && !("PointerEvent" in window)) {
  class PointerEventPolyfill extends MouseEvent {
    constructor(type: string, init?: PointerEventInit) {
      super(type, init)
      this.pointerId = init?.pointerId ?? 0
      this.width = init?.width ?? 0
      this.height = init?.height ?? 0
      this.pressure = init?.pressure ?? 0
      this.tangentialPressure = init?.tangentialPressure ?? 0
      this.tiltX = init?.tiltX ?? 0
      this.tiltY = init?.tiltY ?? 0
      this.twist = init?.twist ?? 0
      this.pointerType = init?.pointerType ?? "mouse"
      this.isPrimary = init?.isPrimary ?? true
    }
  }
  // @ts-expect-error assign polyfill for tests
  window.PointerEvent = PointerEventPolyfill as typeof PointerEvent
  // Ensure globalThis also exposes PointerEvent for libraries reading it directly
  if (!("PointerEvent" in globalThis)) {
    // @ts-expect-error test polyfill
    globalThis.PointerEvent = window.PointerEvent
  }
  // eslint-disable-next-line no-console
  console.log("PointerEvent polyfill installed")
}

if (typeof window !== "undefined") {
  // eslint-disable-next-line no-console
  console.log("PointerEvent available:", "PointerEvent" in window)
}

afterEach(() => {
  cleanup()
})
