import type { MenuState } from "../types"

export interface HighlightChange {
  changed: boolean
  previous: string | null
  current: string | null
}

export interface StateChange {
  changed: boolean
  state: MenuState
}

/**
 * Pure state machine that encapsulates the rules for opening, closing, highlighting and moving
 * focus inside a menu. The class never touches timers, callbacks or DOM — calling code provides
 * the necessary context (enabled item ids, command reason, etc.) and receives immutable snapshots
 * describing the new state.
 */
export class MenuStateMachine {
  private state: MenuState = { open: false, activeItemId: null }
  private pendingInitialHighlight = false

  constructor(private readonly options: { loopFocus: boolean; closeOnSelect: boolean }) {}

  get snapshot(): MenuState {
    return { ...this.state }
  }

  open(): StateChange {
    if (this.state.open) {
      return { changed: false, state: this.snapshot }
    }
    this.state = { ...this.state, open: true }
    return { changed: true, state: this.snapshot }
  }

  close(): StateChange {
    if (!this.state.open && this.state.activeItemId === null) {
      return { changed: false, state: this.snapshot }
    }
    this.pendingInitialHighlight = false
    this.state = { open: false, activeItemId: null }
    return { changed: true, state: this.snapshot }
  }

  toggle(): StateChange {
    return this.state.open ? this.close() : this.open()
  }

  highlight(id: string | null, enabledItemIds: readonly string[]): HighlightChange {
    if (id && !enabledItemIds.includes(id)) {
      return { changed: false, previous: this.state.activeItemId, current: this.state.activeItemId }
    }
    return this.applyHighlight(id)
  }

  moveFocus(delta: 1 | -1, enabledItemIds: readonly string[]): HighlightChange {
    if (!enabledItemIds.length) {
      return { changed: false, previous: this.state.activeItemId, current: this.state.activeItemId }
    }

    const currentIndex = this.state.activeItemId
      ? enabledItemIds.indexOf(this.state.activeItemId)
      : -1

    let nextIndex = currentIndex
    for (let i = 0; i < enabledItemIds.length; i += 1) {
      nextIndex = nextIndex + delta
      if (nextIndex >= enabledItemIds.length) {
        if (!this.options.loopFocus) {
          return { changed: false, previous: this.state.activeItemId, current: this.state.activeItemId }
        }
        nextIndex = 0
      }
      if (nextIndex < 0) {
        if (!this.options.loopFocus) {
          return { changed: false, previous: this.state.activeItemId, current: this.state.activeItemId }
        }
        nextIndex = enabledItemIds.length - 1
      }
      return this.applyHighlight(enabledItemIds[nextIndex])
    }

    return { changed: false, previous: this.state.activeItemId, current: this.state.activeItemId }
  }

  ensureInitialHighlight(enabledItemIds: readonly string[]): HighlightChange {
    if (!this.state.open || this.state.activeItemId) {
      return { changed: false, previous: this.state.activeItemId, current: this.state.activeItemId }
    }
    if (!enabledItemIds.length) {
      this.pendingInitialHighlight = true
      return { changed: false, previous: this.state.activeItemId, current: this.state.activeItemId }
    }
    this.pendingInitialHighlight = false
    return this.applyHighlight(enabledItemIds[0])
  }

  handleItemsChanged(enabledItemIds: readonly string[]): HighlightChange {
    if (this.state.activeItemId && !enabledItemIds.includes(this.state.activeItemId)) {
      return this.applyHighlight(null)
    }
    if (this.pendingInitialHighlight) {
      return this.ensureInitialHighlight(enabledItemIds)
    }
    return { changed: false, previous: this.state.activeItemId, current: this.state.activeItemId }
  }

  handleSelection(): { accepted: boolean; shouldClose: boolean } {
    if (!this.state.open) {
      return { accepted: false, shouldClose: false }
    }
    return { accepted: true, shouldClose: this.options.closeOnSelect }
  }

  private applyHighlight(target: string | null): HighlightChange {
    if (this.state.activeItemId === target) {
      return { changed: false, previous: this.state.activeItemId, current: this.state.activeItemId }
    }
    const previous = this.state.activeItemId
    this.state = { ...this.state, activeItemId: target }
    return { changed: true, previous, current: target }
  }
}
