import type { TabsSnapshot, TabsState, TabsSubscriber } from "./types"

export class TabsCore<Value = string> {
  private value: Value | null
  private snapshot: TabsSnapshot<Value>
  private subscribers = new Set<TabsSubscriber<Value>>()

  constructor(defaultValue: Value | null = null) {
    this.value = defaultValue
    this.snapshot = this.createSnapshot(defaultValue)
  }

  select(value: Value): void {
    this.patch(value)
  }

  clear(): void {
    this.patch(null)
  }

  getSnapshot(): TabsSnapshot<Value> {
    return this.snapshot
  }

  subscribe(subscriber: TabsSubscriber<Value>): { unsubscribe: () => void } {
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

  private patch(next: Value | null): void {
    if (Object.is(next, this.value)) {
      return
    }
    this.value = next
    this.snapshot = this.createSnapshot(next)
    this.subscribers.forEach((subscriber) => subscriber(this.snapshot))
  }

  private createSnapshot(value: Value | null): TabsSnapshot<Value> {
    const state: TabsState<Value> = { value }
    return Object.freeze(state)
  }
}
