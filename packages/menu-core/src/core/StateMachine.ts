import type { MenuState } from "../types"

export interface HighlightChange {
  changed: boolean
  previous: string | null
  current: string | null
}

export class MenuStateMachine {
  private activeItemId: string | null = null
  private pendingInitialHighlight = false

  constructor(private readonly options: { loopFocus: boolean; closeOnSelect: boolean }) {}

  get snapshot(): Pick<MenuState, "activeItemId"> {
    return { activeItemId: this.activeItemId }
  }

  reset() {
    this.pendingInitialHighlight = false
    this.activeItemId = null
  }

  highlight(id: string | null, enabledItemIds: readonly string[]): HighlightChange {
    if (id && !enabledItemIds.includes(id)) {
      return { changed: false, previous: this.activeItemId, current: this.activeItemId }
    }
    return this.applyHighlight(id)
  }

  moveFocus(delta: 1 | -1, enabledItemIds: readonly string[]): HighlightChange {
    if (!enabledItemIds.length) {
      return { changed: false, previous: this.activeItemId, current: this.activeItemId }
    }

    const currentIndex = this.activeItemId ? enabledItemIds.indexOf(this.activeItemId) : -1

    let nextIndex = currentIndex
    for (let i = 0; i < enabledItemIds.length; i += 1) {
      nextIndex = nextIndex + delta
      if (nextIndex >= enabledItemIds.length) {
        if (!this.options.loopFocus) {
          return { changed: false, previous: this.activeItemId, current: this.activeItemId }
        }
        nextIndex = 0
      }
      if (nextIndex < 0) {
        if (!this.options.loopFocus) {
          return { changed: false, previous: this.activeItemId, current: this.activeItemId }
        }
        nextIndex = enabledItemIds.length - 1
      }
      return this.applyHighlight(enabledItemIds[nextIndex])
    }

    return { changed: false, previous: this.activeItemId, current: this.activeItemId }
  }

  ensureInitialHighlight(enabledItemIds: readonly string[], isOpen: boolean): HighlightChange {
    if (!isOpen || this.activeItemId) {
      return { changed: false, previous: this.activeItemId, current: this.activeItemId }
    }
    if (!enabledItemIds.length) {
      this.pendingInitialHighlight = true
      return { changed: false, previous: this.activeItemId, current: this.activeItemId }
    }
    this.pendingInitialHighlight = false
    return this.applyHighlight(enabledItemIds[0])
  }

  handleItemsChanged(enabledItemIds: readonly string[], isOpen: boolean): HighlightChange {
    if (this.activeItemId && !enabledItemIds.includes(this.activeItemId)) {
      return this.applyHighlight(null)
    }
    if (this.pendingInitialHighlight) {
      return this.ensureInitialHighlight(enabledItemIds, isOpen)
    }
    return { changed: false, previous: this.activeItemId, current: this.activeItemId }
  }

  handleSelection(isOpen: boolean): { accepted: boolean; shouldClose: boolean } {
    if (!isOpen) {
      return { accepted: false, shouldClose: false }
    }
    return { accepted: true, shouldClose: this.options.closeOnSelect }
  }

  private applyHighlight(target: string | null): HighlightChange {
    if (this.activeItemId === target) {
      return { changed: false, previous: this.activeItemId, current: this.activeItemId }
    }
    const previous = this.activeItemId
    this.activeItemId = target
    return { changed: true, previous, current: target }
  }
}
