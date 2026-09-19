interface ItemEntry {
  id: string
  disabled: boolean
}

export interface RegistrationResult {
  created: boolean
  disabled: boolean
  changed: boolean
}

/**
 * Maintains the list of registered menu items with deterministic ordering. The registry is
 * intentionally opinionated: duplicate IDs are rejected unless the caller explicitly marks an
 * operation as an update, ensuring bugs surface early during development.
 */
export class ItemRegistry {
  private readonly items = new Map<string, ItemEntry>()
  private orderedItemsCache: ItemEntry[] | null = null
  private enabledItemIdsCache: readonly string[] | null = null

  register(id: string, disabled: boolean, allowUpdate = false): RegistrationResult {
    const existing = this.items.get(id)
    if (existing) {
      if (!allowUpdate) {
        throw new Error(`Menu item with id "${id}" is already registered`)
      }
      if (existing.disabled === disabled) {
        return { created: false, disabled: existing.disabled, changed: false }
      }
      existing.disabled = disabled
      this.enabledItemIdsCache = null
      return { created: false, disabled: existing.disabled, changed: true }
    }

    this.items.set(id, { id, disabled })
    this.invalidateAllCaches()
    return { created: true, disabled, changed: true }
  }

  unregister(id: string): boolean {
    const removed = this.items.delete(id)
    if (removed) {
      this.invalidateAllCaches()
    }
    return removed
  }

  has(id: string): boolean {
    return this.items.has(id)
  }

  updateDisabled(id: string, disabled: boolean) {
    const entry = this.items.get(id)
    if (!entry) {
      throw new Error(`Cannot update unknown menu item with id "${id}"`)
    }
    if (entry.disabled === disabled) {
      return
    }
    entry.disabled = disabled
    this.enabledItemIdsCache = null
  }

  syncOrder(ids: readonly string[]): boolean {
    const nextIds: string[] = []
    const seen = new Set<string>()

    for (const id of ids) {
      if (this.items.has(id) && !seen.has(id)) {
        nextIds.push(id)
        seen.add(id)
      }
    }
    for (const id of this.items.keys()) {
      if (!seen.has(id)) {
        nextIds.push(id)
      }
    }

    const currentIds = [...this.items.keys()]
    if (currentIds.length === nextIds.length && currentIds.every((id, index) => id === nextIds[index])) {
      return false
    }

    const entries = nextIds.map((id) => this.items.get(id)).filter((entry): entry is ItemEntry => Boolean(entry))
    this.items.clear()
    for (const entry of entries) {
      this.items.set(entry.id, entry)
    }
    this.orderedItemsCache = null
    this.enabledItemIdsCache = null
    return true
  }

  getOrderedItems(): ItemEntry[] {
    if (!this.orderedItemsCache) {
      this.orderedItemsCache = [...this.items.values()]
    }
    return [...this.orderedItemsCache]
  }

  getEnabledItemIdsSnapshot(): readonly string[] {
    if (this.enabledItemIdsCache) {
      return this.enabledItemIdsCache
    }
    const enabled: string[] = []
    this.items.forEach((entry) => {
      if (!entry.disabled) {
        enabled.push(entry.id)
      }
    })
    this.enabledItemIdsCache = Object.freeze(enabled.slice())
    return this.enabledItemIdsCache
  }

  getEnabledItemIds(): string[] {
    return [...this.getEnabledItemIdsSnapshot()]
  }

  isDisabled(id: string): boolean {
    return this.items.get(id)?.disabled ?? false
  }

  private invalidateAllCaches() {
    this.orderedItemsCache = null
    this.enabledItemIdsCache = null
  }
}
