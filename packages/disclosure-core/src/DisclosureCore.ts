import type { DisclosureSnapshot, DisclosureState, DisclosureSubscriber } from "./types"

export class DisclosureCore {
  private state: DisclosureState
  private subscribers = new Set<DisclosureSubscriber>()

  constructor(defaultOpen = false) {
    this.state = { open: defaultOpen }
  }

  open(): void {
    this.patch({ open: true })
  }

  close(): void {
    this.patch({ open: false })
  }

  toggle(): void {
    this.patch({ open: !this.state.open })
  }

  getSnapshot(): DisclosureSnapshot {
    return this.state
  }

  subscribe(subscriber: DisclosureSubscriber): { unsubscribe: () => void } {
    this.subscribers.add(subscriber)
    subscriber(this.state)
    return {
      unsubscribe: () => {
        this.subscribers.delete(subscriber)
      },
    }
  }

  destroy(): void {
    this.subscribers.clear()
  }

  private patch(next: DisclosureState): void {
    if (next.open === this.state.open) {
      return
    }
    this.state = next
    this.subscribers.forEach((subscriber) => subscriber(this.state))
  }
}
