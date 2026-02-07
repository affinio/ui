import type { DisclosureSnapshot, DisclosureState, DisclosureSubscriber } from "./types"

export class DisclosureCore {
  private openState: boolean
  private snapshot: DisclosureSnapshot
  private subscribers = new Set<DisclosureSubscriber>()

  constructor(defaultOpen = false) {
    this.openState = defaultOpen
    this.snapshot = this.createSnapshot(defaultOpen)
  }

  open(): void {
    this.patch(true)
  }

  close(): void {
    this.patch(false)
  }

  toggle(): void {
    this.patch(!this.openState)
  }

  getSnapshot(): DisclosureSnapshot {
    return this.snapshot
  }

  isOpen(): boolean {
    return this.openState
  }

  subscribe(subscriber: DisclosureSubscriber): { unsubscribe: () => void } {
    this.subscribers.add(subscriber)
    subscriber(this.snapshot)
    return {
      unsubscribe: () => {
        this.subscribers.delete(subscriber)
      },
    }
  }

  destroy(): void {
    this.subscribers.clear()
  }

  private patch(nextOpen: boolean): void {
    if (nextOpen === this.openState) {
      return
    }
    this.openState = nextOpen
    this.snapshot = this.createSnapshot(nextOpen)
    this.subscribers.forEach((subscriber) => subscriber(this.snapshot))
  }

  private createSnapshot(open: boolean): DisclosureSnapshot {
    const state: DisclosureState = { open }
    return Object.freeze(state)
  }
}
