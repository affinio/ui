import { MenuCore } from "@affino/menu-core"
import type { MenuOverlayTraits } from "@affino/menu-core"
import type { SurfaceReason } from "@affino/surface-core"
import {
  acquireDocumentScrollLock,
  getDocumentOverlayManager,
  releaseDocumentScrollLock,
  type OverlayKind,
} from "@affino/overlay-kernel"

import type {
  AutofocusTarget,
  Cleanup,
  ItemEl,
  MenuHandle,
  MenuSnapshot,
  PanelEl,
  PointerIntent,
  PositioningOptions,
  RootEl,
  TriggerEl,
} from "./types"

export const MENU_ROOT_SELECTOR = "[data-affino-menu-root]"
const MENU_ROOT_ATTR = "data-affino-menu-root"
const MENU_TRIGGER_SELECTOR = "[data-affino-menu-trigger]"
const MENU_PANEL_SELECTOR = "[data-affino-menu-panel]"
const MENU_ITEM_SELECTOR = "[data-affino-menu-item]"
const MENU_CLOSE_SELECTOR = "[data-affino-menu-close]"

const registry = new Map<RootEl, MenuInstance>()
let mutationObserver: MutationObserver | null = null
let refreshScheduled = false

export function hydrateMenu(root: RootEl): void {
  tearDownInstance(root)
  const trigger = root.querySelector<TriggerEl>(MENU_TRIGGER_SELECTOR)
  const panel = root.querySelector<PanelEl>(MENU_PANEL_SELECTOR)
  if (!trigger || !panel) {
    return
  }
  const instance = new MenuInstance(root, trigger, panel)
  registry.set(root, instance)
  root.affinoMenu = instance.getHandle()
}

export function scan(scope: ParentNode): void {
  const nodes = Array.from(scope.querySelectorAll<RootEl>(MENU_ROOT_SELECTOR))
  nodes.forEach((node) => hydrateMenu(node))
}

export function scheduleRefresh(): void {
  if (refreshScheduled) {
    return
  }
  refreshScheduled = true
  const invoke = () => {
    refreshScheduled = false
    refreshMenus()
  }
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(invoke)
  } else {
    setTimeout(invoke, 16)
  }
}

export function setupMutationObserver(): void {
  observeDocument()
}

export function restartMutationObserver(): void {
  observeDocument()
}

export function disconnectMutationObserver(): void {
  mutationObserver?.disconnect()
}

function refreshMenus(): void {
  if (typeof document === "undefined") {
    return
  }
  registry.forEach((instance, root) => {
    if (!document.body.contains(root)) {
      instance.destroy()
      registry.delete(root)
    }
  })
  scan(document)
}

function observeDocument(): void {
  if (typeof MutationObserver === "undefined" || typeof document === "undefined") {
    return
  }
  if (!document.body) {
    const retry = () => observeDocument()
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(retry)
    } else {
      setTimeout(retry, 16)
    }
    return
  }
  if (mutationObserver) {
    mutationObserver.disconnect()
  }
  mutationObserver = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutationTouchesMenu(mutation))) {
      scheduleRefresh()
    }
  })
  mutationObserver.observe(document.body, { childList: true, subtree: true })
}

function mutationTouchesMenu(mutation: MutationRecord): boolean {
  if (mutation.type !== "childList") {
    return false
  }
  if (mutation.target instanceof Element && elementTouchesRegisteredMenu(mutation.target)) {
    return true
  }
  const nodes = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)]
  return nodes.some((node) => {
    if (!(node instanceof Element)) {
      return false
    }
    if (node.hasAttribute(MENU_ROOT_ATTR) || elementTouchesRegisteredMenu(node)) {
      return true
    }
    if (node.childElementCount === 0) {
      return false
    }
    return Boolean(node.querySelector?.(MENU_ROOT_SELECTOR))
  })
}

function elementTouchesRegisteredMenu(node: Element): boolean {
  for (const root of registry.keys()) {
    if (root === node || root.contains(node) || node.contains(root)) {
      return true
    }
  }
  return false
}

function tearDownInstance(root: RootEl): void {
  const instance = registry.get(root)
  if (instance) {
    instance.destroy()
    registry.delete(root)
    delete root.affinoMenu
  }
}

class MenuInstance {
  private readonly root: RootEl
  private readonly trigger: TriggerEl
  private readonly panel: PanelEl
  private readonly closeTargets: HTMLElement[]
  private readonly cleanup: Cleanup[] = []
  private readonly itemReleases: Cleanup[] = []
  private readonly itemsById = new Map<string, ItemEl>()
  private readonly positioning: PositioningOptions
  private readonly loopFocus: boolean
  private readonly autofocusTarget: AutofocusTarget
  private orderedItems: ItemEl[] = []
  private readonly pinned: boolean
  private readonly lockScroll: boolean
  private readonly portalMode: "inline" | "body"
  private placeholder: Comment | null = null
  private panelHost: HTMLElement | null = null
  private focusRaf: number | null = null
  private inputIntent: PointerIntent = "pointer"
  private isOpen = false
  private core: MenuCore
  private viewportHandler: (() => void) | null = null
  private docPointerHandler: ((event: PointerEvent) => void) | null = null
  private scrollLockHeld = false

  constructor(root: RootEl, trigger: TriggerEl, panel: PanelEl) {
    this.root = root
    this.trigger = trigger
    this.panel = panel
    this.closeTargets = Array.from(root.querySelectorAll(MENU_CLOSE_SELECTOR))

    this.positioning = {
      placement: (root.dataset.affinoMenuPlacement as PositioningOptions["placement"]) ?? "bottom",
      align: (root.dataset.affinoMenuAlign as PositioningOptions["align"]) ?? "end",
      gutter: readNumber(root.dataset.affinoMenuGutter, 8),
      viewportPadding: readNumber(root.dataset.affinoMenuViewportPadding, 12),
    }
    this.loopFocus = readBoolean(root.dataset.affinoMenuLoop, true)
    this.autofocusTarget = resolveAutofocusTarget(root.dataset.affinoMenuAutofocus)
    this.pinned = readBoolean(root.dataset.affinoMenuPinned, false)
    this.lockScroll = readBoolean(
      root.dataset.affinoMenuLockScroll,
      readBoolean(root.dataset.affinoMenuOverlayModal, false),
    )
    this.portalMode = root.dataset.affinoMenuPortal === "inline" ? "inline" : "body"

    this.mountPortal()
    this.core = this.createMenuCore()
    this.installHandle()
    this.initialize()
  }

  destroy(): void {
    this.cancelFocusRequest()
    this.cleanup.forEach((dispose) => dispose())
    this.itemReleases.forEach((release) => release?.())
    this.itemsById.clear()
    this.orderedItems = []
    if (this.scrollLockHeld) {
      releaseDocumentScrollLock(this.root.ownerDocument, "menu")
      this.scrollLockHeld = false
    }
    this.core.destroy()
    this.restorePanel()
    if (this.viewportHandler) {
      window.removeEventListener("scroll", this.viewportHandler, true)
      window.removeEventListener("resize", this.viewportHandler, true)
      this.viewportHandler = null
    }
    if (this.docPointerHandler) {
      document.removeEventListener("pointerdown", this.docPointerHandler, true)
      this.docPointerHandler = null
    }
  }

  getHandle(): MenuHandle {
    return {
      open: (reason?: SurfaceReason) => this.core.open(reason),
      close: (reason?: SurfaceReason) => this.core.close(reason),
      toggle: () => this.core.toggle(),
      highlight: (itemId: string | null) => this.core.highlight(itemId),
      getSnapshot: () => this.core.getSnapshot(),
    }
  }

  private installHandle(): void {
    this.root.affinoMenu = this.getHandle()
  }

  private createMenuCore(): MenuCore {
    const overlayManager = getDocumentOverlayManager(this.root.ownerDocument ?? document)
    const overlayKind = (this.root.dataset.affinoMenuOverlayKind as OverlayKind | undefined) ?? "menu"
    const overlayEntryTraits: Partial<MenuOverlayTraits> = {}
    if (this.root.dataset.affinoMenuOverlayOwner) {
      overlayEntryTraits.ownerId = this.root.dataset.affinoMenuOverlayOwner
    }
    if (this.root.dataset.affinoMenuOverlayPriority) {
      overlayEntryTraits.priority = readNumber(this.root.dataset.affinoMenuOverlayPriority, 70)
    }
    if (this.root.dataset.affinoMenuOverlayReturnFocus) {
      overlayEntryTraits.returnFocus = readBoolean(this.root.dataset.affinoMenuOverlayReturnFocus, true)
    }
    if (this.root.dataset.affinoMenuOverlayModal) {
      overlayEntryTraits.modal = readBoolean(this.root.dataset.affinoMenuOverlayModal, false)
    }
    const openDelay = readNumber(this.root.dataset.affinoMenuOpenDelay, 80)
    const closeDelay = readNumber(this.root.dataset.affinoMenuCloseDelay, 120)
    const defaultOpen = readBoolean(this.root.dataset.affinoMenuDefaultOpen, false)
    const closeOnSelect = readBoolean(this.root.dataset.affinoMenuCloseSelect, true)

    return new MenuCore({
      id: this.root.dataset.affinoMenuRoot,
      openDelay,
      closeDelay,
      defaultOpen,
      closeOnSelect,
      loopFocus: this.loopFocus,
      overlayManager,
      overlayKind,
      overlayEntryTraits: Object.keys(overlayEntryTraits).length ? overlayEntryTraits : undefined,
    })
  }

  private initialize(): void {
    this.panel.dataset.state = "closed"
    this.panel.hidden = true
    this.panel.setAttribute("aria-hidden", "true")
    const triggerProps = this.stripHoverHandlers(this.core.getTriggerProps())
    const panelProps = this.stripHoverDismiss(this.withDomKeydown(this.core.getPanelProps()))

    this.bindProps(this.trigger, triggerProps)
    this.bindProps(this.panel, panelProps)
    this.registerItems()
    this.registerCloseTargets()
    this.bindIntentListeners()
    this.bindOutsideGuards()
    this.bindViewportHandlers()

    const subscription = this.core.subscribe((snapshot) => this.syncState(snapshot))
    this.cleanup.push(() => subscription.unsubscribe())
    this.syncState(this.core.getSnapshot())
  }

  private registerItems(): void {
    const nodes = this.collectItems(true)
    nodes.forEach((node, index) => {
      const id = node.id || `${this.core.id}-item-${index}`
      node.id = id
      const release = this.core.registerItem(id, { disabled: this.isDisabled(node) })
      this.itemReleases.push(release)
      const itemProps = this.withDomKeydown(this.core.getItemProps(id))
      this.bindProps(node, itemProps)
      node.dataset.state = "idle"
      node.tabIndex = -1
      this.itemsById.set(id, node)
    })
  }

  private registerCloseTargets(): void {
    this.closeTargets.forEach((target) => {
      const handler = () => this.core.close("programmatic")
      target.addEventListener("click", handler)
      this.cleanup.push(() => target.removeEventListener("click", handler))
    })
  }

  private bindIntentListeners(): void {
    const pointerIntent = () => {
      this.inputIntent = "pointer"
    }
    const keyboardIntent = () => {
      this.inputIntent = "keyboard"
    }
    this.trigger.addEventListener("pointerdown", pointerIntent, true)
    this.trigger.addEventListener("keydown", keyboardIntent, true)
    this.panel.addEventListener("pointerdown", pointerIntent, true)
    this.panel.addEventListener("pointermove", pointerIntent, true)
    this.panel.addEventListener("keydown", keyboardIntent, true)
    this.cleanup.push(() => {
      this.trigger.removeEventListener("pointerdown", pointerIntent, true)
      this.trigger.removeEventListener("keydown", keyboardIntent, true)
      this.panel.removeEventListener("pointerdown", pointerIntent, true)
      this.panel.removeEventListener("pointermove", pointerIntent, true)
      this.panel.removeEventListener("keydown", keyboardIntent, true)
    })
  }

  private bindOutsideGuards(): void {
    if (typeof document === "undefined") {
      return
    }
    this.docPointerHandler = (event: PointerEvent) => {
      if (!this.isOpen) {
        return
      }
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }
      if (this.root.contains(target) || this.panel.contains(target)) {
        return
      }
      if (this.pinned) {
        return
      }
      this.core.close("pointer")
    }
    document.addEventListener("pointerdown", this.docPointerHandler, true)
    this.cleanup.push(() => {
      if (this.docPointerHandler) {
        document.removeEventListener("pointerdown", this.docPointerHandler, true)
        this.docPointerHandler = null
      }
    })
  }

  private bindViewportHandlers(): void {
    const handler = () => {
      if (!this.isOpen) {
        return
      }
      this.positionPanel()
    }
    window.addEventListener("scroll", handler, true)
    window.addEventListener("resize", handler, true)
    this.viewportHandler = handler
    this.cleanup.push(() => {
      window.removeEventListener("scroll", handler, true)
      window.removeEventListener("resize", handler, true)
      if (this.viewportHandler === handler) {
        this.viewportHandler = null
      }
    })
  }

  private syncState(snapshot: MenuSnapshot): void {
    const prev = this.isOpen
    this.isOpen = snapshot.open
    const state = this.isOpen ? "open" : "closed"
    this.root.dataset.affinoMenuState = state
    this.trigger.setAttribute("data-state", state)
    this.trigger.setAttribute("aria-expanded", this.isOpen ? "true" : "false")
    this.panel.dataset.state = state
    this.panel.setAttribute("aria-hidden", this.isOpen ? "false" : "true")
    this.panel.hidden = !this.isOpen

    if (this.isOpen) {
      if (!this.scrollLockHeld && this.lockScroll) {
        acquireDocumentScrollLock(this.root.ownerDocument, "menu")
        this.scrollLockHeld = true
      }
      if (!prev) {
        this.positionPanel()
        this.focusOnOpen()
      }
      this.syncActiveItem(snapshot.activeItemId)
      return
    }

    if (this.scrollLockHeld) {
      releaseDocumentScrollLock(this.root.ownerDocument, "menu")
      this.scrollLockHeld = false
    }
    this.panel.style.visibility = "hidden"
    this.panel.style.pointerEvents = "none"
    if (prev && this.shouldRestoreFocus()) {
      this.focusElement(this.trigger)
    }
    this.syncActiveItem(null)
    this.inputIntent = "pointer"
  }

  private syncActiveItem(itemId: string | null): void {
    if (!this.itemsById.size) {
      return
    }
    this.itemsById.forEach((node, id) => {
      const highlighted = id === itemId
      node.dataset.state = highlighted ? "highlighted" : "idle"
      node.tabIndex = highlighted ? 0 : -1
    })
    if (itemId && this.inputIntent === "keyboard") {
      const target = this.itemsById.get(itemId)
      if (target) {
        this.focusElement(target)
      }
    }
  }

  private positionPanel(): void {
    const anchor = this.trigger.getBoundingClientRect()
    this.panel.style.visibility = "hidden"
    this.panel.style.pointerEvents = "none"
    const surface = this.panel.getBoundingClientRect()
    const position = this.core.computePosition(anchor, surface, {
      placement: this.positioning.placement,
      align: this.positioning.align,
      gutter: this.positioning.gutter,
      viewportPadding: this.positioning.viewportPadding,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    })
    this.panel.style.position = "fixed"
    this.panel.style.left = `${Math.round(position.left)}px`
    this.panel.style.top = `${Math.round(position.top)}px`
    this.panel.dataset.placement = position.placement
    this.panel.dataset.align = position.align
    this.panel.style.visibility = ""
    this.panel.style.pointerEvents = ""
  }

  private collectItems(forceRefresh = false): ItemEl[] {
    if (!forceRefresh && this.orderedItems.length) {
      return this.orderedItems
    }
    const nodes = Array.from(this.panel.querySelectorAll<ItemEl>(MENU_ITEM_SELECTOR))
    if (typeof Node === "undefined") {
      this.orderedItems = nodes
      return this.orderedItems
    }
    this.orderedItems = nodes.sort((a, b) => {
      if (a === b) {
        return 0
      }
      const position = a.compareDocumentPosition(b)
      if (position & Node.DOCUMENT_POSITION_PRECEDING) {
        return 1
      }
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
        return -1
      }
      return 0
    })
    return this.orderedItems
  }

  private bindProps(element: HTMLElement, props?: unknown): void {
    if (!element || !props) {
      return
    }
    const entries = Object.entries(props as Record<string, unknown>)
    entries.forEach(([key, value]) => {
      if (key.startsWith("on") && typeof value === "function") {
        const eventName = key.slice(2).toLowerCase()
        const handler = (event: Event) => (value as (event: Event) => void)(event)
        element.addEventListener(eventName, handler)
        this.cleanup.push(() => element.removeEventListener(eventName, handler))
        return
      }
      if (key === "tabIndex") {
        element.tabIndex = Number(value)
        return
      }
      if (value === undefined || value === null) {
        element.removeAttribute(key)
        return
      }
      element.setAttribute(key, String(value))
    })
  }

  private withDomKeydown<T extends { onKeyDown?: (event: KeyboardEvent) => void }>(props: T): T {
    if (!props?.onKeyDown) {
      return props
    }
    const original = props.onKeyDown
    return {
      ...props,
      onKeyDown: (event: KeyboardEvent) => {
        if (this.handleDomNavigation(event)) {
          return
        }
        if (this.handleKeyboardActivation(event)) {
          return
        }
        original(event)
      },
    }
  }

  private handleDomNavigation(event: KeyboardEvent): boolean {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return false
    }
    event.preventDefault()
    event.stopPropagation()
    this.inputIntent = "keyboard"
    const direction = event.key === "ArrowDown" ? 1 : -1
    const enabled = this.collectItems().filter((node) => !this.isDisabled(node))
    if (!enabled.length) {
      return true
    }
    const currentIndex = enabled.findIndex((node) => node.id === this.core.getSnapshot().activeItemId)
    let nextIndex = currentIndex + direction
    if (currentIndex === -1) {
      nextIndex = direction > 0 ? 0 : enabled.length - 1
    }
    if (nextIndex >= enabled.length) {
      nextIndex = this.loopFocus ? 0 : enabled.length - 1
    }
    if (nextIndex < 0) {
      nextIndex = this.loopFocus ? enabled.length - 1 : 0
    }
    const target = enabled[nextIndex]
    if (target) {
      this.core.highlight(target.id)
    }
    return true
  }

  private handleKeyboardActivation(event: KeyboardEvent): boolean {
    if (event.key !== "Enter" && event.key !== " ") {
      return false
    }
    event.preventDefault()
    event.stopPropagation()
    const active = this.resolveActivationTarget(event.target as Element | null)
    if (!active || this.isDisabled(active)) {
      return true
    }
    active.click()
    return true
  }

  private resolveActivationTarget(target: Element | null): ItemEl | null {
    if (target && this.itemsById.has(target.id)) {
      return this.itemsById.get(target.id) ?? null
    }
    const snapshot = this.core.getSnapshot()
    if (!snapshot.activeItemId) {
      return null
    }
    return this.itemsById.get(snapshot.activeItemId) ?? null
  }

  private stripHoverHandlers(props: unknown): Record<string, unknown> {
    if (!props) {
      return {}
    }
    const clone = { ...(props as Record<string, unknown>) }
    delete clone.onPointerEnter
    delete clone.onPointerLeave
    return clone
  }

  private stripHoverDismiss(props: unknown): Record<string, unknown> {
    if (!props) {
      return {}
    }
    const clone = { ...(props as Record<string, unknown>) }
    delete clone.onPointerLeave
    return clone
  }

  private isDisabled(node: Element): boolean {
    if ("disabled" in node && typeof (node as HTMLButtonElement).disabled === "boolean") {
      return Boolean((node as HTMLButtonElement).disabled)
    }
    return node.getAttribute("aria-disabled") === "true"
  }

  private mountPortal(): void {
    if (this.portalMode === "inline" || typeof document === "undefined") {
      return
    }
    this.panelHost = this.panel.parentElement
    if (!this.panelHost) {
      return
    }
    this.placeholder = document.createComment("affino-menu-panel")
    this.panelHost.replaceChild(this.placeholder, this.panel)
    document.body.appendChild(this.panel)
  }

  private restorePanel(): void {
    if (this.portalMode === "inline") {
      return
    }
    if (this.panel && this.placeholder && this.panelHost && this.placeholder.parentNode === this.panelHost) {
      this.panelHost.replaceChild(this.panel, this.placeholder)
    } else if (this.panel?.parentElement) {
      this.panel.parentElement.removeChild(this.panel)
    }
    if (this.placeholder?.parentNode) {
      this.placeholder.parentNode.removeChild(this.placeholder)
    }
    this.placeholder = null
    this.panelHost = null
  }

  private focusOnOpen(): void {
    if (this.autofocusTarget === "none") {
      this.cancelFocusRequest()
      return
    }
    if (this.autofocusTarget === "item") {
      this.focusFirstItemSoon()
      return
    }
    this.focusPanelSoon()
  }

  private focusFirstItemSoon(): void {
    this.cancelFocusRequest()
    this.focusRaf = window.requestAnimationFrame(() => {
      const first = this.collectItems().find((node) => !this.isDisabled(node))
      this.focusRaf = null
      if (first) {
        this.core.highlight(first.id)
        this.focusElement(first)
        return
      }
      this.focusPanelSoon()
    })
  }

  private focusPanelSoon(): void {
    this.cancelFocusRequest()
    this.focusRaf = window.requestAnimationFrame(() => {
      this.focusElement(this.panel)
      this.focusRaf = null
    })
  }

  private cancelFocusRequest(): void {
    if (this.focusRaf !== null && typeof window.cancelAnimationFrame === "function") {
      window.cancelAnimationFrame(this.focusRaf)
    }
    this.focusRaf = null
  }

  private shouldRestoreFocus(): boolean {
    if (typeof document === "undefined") {
      return false
    }
    const active = document.activeElement
    return Boolean(active && (active === this.panel || this.panel.contains(active)))
  }

  private focusElement(target: HTMLElement | null): void {
    if (!target || typeof target.focus !== "function") {
      return
    }
    try {
      target.focus({ preventScroll: true })
    } catch {
      target.focus()
    }
  }
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback
  }
  if (value === "true") {
    return true
  }
  if (value === "false") {
    return false
  }
  return fallback
}

function readNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function resolveAutofocusTarget(value: string | undefined): AutofocusTarget {
  if (value === "item" || value === "none") {
    return value
  }
  return "panel"
}
