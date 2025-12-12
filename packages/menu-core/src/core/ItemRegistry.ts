interface ItemEntry {
  id: string
  disabled: boolean
  order: number
}

export interface RegistrationResult {
  created: boolean
  disabled: boolean
}

/**
 * Maintains the list of registered menu items with deterministic ordering. The registry is
 * intentionally opinionated: duplicate IDs are rejected unless the caller explicitly marks an
 * operation as an update, ensuring bugs surface early during development.
 */
export class ItemRegistry {
  private readonly items = new Map<string, ItemEntry>()
  private orderCursor = 0

  register(id: string, disabled: boolean, allowUpdate = false): RegistrationResult {
    const existing = this.items.get(id)
    if (existing) {
      if (!allowUpdate) {
        throw new Error(`Menu item with id "${id}" is already registered`)
      }
      existing.disabled = disabled
      return { created: false, disabled: existing.disabled }
    }

    this.items.set(id, { id, disabled, order: this.orderCursor++ })
    return { created: true, disabled }
  }

  unregister(id: string): boolean {
    return this.items.delete(id)
  }

  has(id: string): boolean {
    return this.items.has(id)
  }

  updateDisabled(id: string, disabled: boolean) {
    const entry = this.items.get(id)
    if (!entry) {
      throw new Error(`Cannot update unknown menu item with id "${id}"`)
    }
    entry.disabled = disabled
  }

  getOrderedItems(): ItemEntry[] {
    return [...this.items.values()].sort((a, b) => a.order - b.order)
  }

  getEnabledItemIds(): string[] {
    return this.getOrderedItems()
      .filter((entry) => !entry.disabled)
      .map((entry) => entry.id)
  }

  isDisabled(id: string): boolean {
    return this.items.get(id)?.disabled ?? false
  }
}
