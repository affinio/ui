import type { MenuOptions } from "../types"

export type TimerHandle = ReturnType<typeof setTimeout> | null

/**
 * Manages delayed open/close scheduling for a menu instance. The implementation is
 * intentionally dumb — idempotent operations with explicit cancellation so that
 * higher-level classes maintain full control over when timers run.
 */
export class MenuTimers {
  private openTimer: TimerHandle = null
  private closeTimer: TimerHandle = null

  constructor(private readonly options: Pick<Required<MenuOptions>, "openDelay" | "closeDelay">) {}

  scheduleOpen(callback: () => void) {
    if (this.openTimer) {
      clearTimeout(this.openTimer)
    }
    this.openTimer = setTimeout(() => {
      this.openTimer = null
      callback()
    }, this.options.openDelay)
  }

  scheduleClose(callback: () => void) {
    if (this.closeTimer) {
      clearTimeout(this.closeTimer)
    }
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null
      callback()
    }, this.options.closeDelay)
  }

  cancelOpen() {
    if (!this.openTimer) return
    clearTimeout(this.openTimer)
    this.openTimer = null
  }

  cancelClose() {
    if (!this.closeTimer) return
    clearTimeout(this.closeTimer)
    this.closeTimer = null
  }

  clearAll() {
    this.cancelOpen()
    this.cancelClose()
  }
}
