import type { TabsSnapshot, TabsState, TabsSubscriber } from "./types"

export class TabsCore<Value = string> {
  private state: TabsState<Value>
  private subscribers = new Set<TabsSubscriber<Value>>()

  constructor(defaultValue: Value | null = null) {
    this.state = { value: defaultValue }
  }

  select(value: Value): void {
    this.patch({ value })
  }

  clear(): void {
    this.patch({ value: null })
  }

  getSnapshot(): TabsSnapshot<Value> {
    return this.state
  }

  subscribe(subscriber: TabsSubscriber<Value>): { unsubscribe: () => void } {
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

  private patch(next: TabsState<Value>): void {
    if (next.value === this.state.value) {
      return
    }
    this.state = next
    this.subscribers.forEach((subscriber) => subscriber(this.state))
  }
}
