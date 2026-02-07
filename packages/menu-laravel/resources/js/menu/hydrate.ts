import { MenuCore, SubmenuCore, type PointerEventLike, type PointerMeta } from "@affino/menu-core"
import type { MenuOverlayTraits } from "@affino/menu-core"
import type { SurfaceReason } from "@affino/surface-core"
import {
  acquireDocumentScrollLock,
  getDocumentOverlayManager,
  releaseDocumentScrollLock,
  type OverlayManager,
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
const MENU_ID_ATTR = "data-affino-menu-id"
const MENU_ROOT_ID_ATTR = "data-affino-menu-root-id"
const MENU_PARENT_ID_ATTR = "data-affino-menu-parent-id"

function scheduleFrame(callback: FrameRequestCallback): number {
  if (typeof requestAnimationFrame === "function") {
    return requestAnimationFrame(callback)
  }
  return window.setTimeout(() => callback(0), 16)
}

function cancelFrame(id: number): void {
  if (typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(id)
    return
  }
  window.clearTimeout(id)
}

function debugMenu(...args: unknown[]): void {
  if (typeof window === "undefined") {
    return
  }
  const scope = window as unknown as { __affinoMenuDebug?: boolean }
  if (!scope.__affinoMenuDebug) {
    return
  }
  // eslint-disable-next-line no-console
  console.debug("[affino-menu]", ...args)
}

const registry = new Map<RootEl, MenuInstance>()
const menuById = new Map<string, MenuInstance>()
const submenuByParentItemId = new Map<string, MenuInstance>()
const structureRegistry = new WeakMap<RootEl, MenuStructureSnapshot>()
let mutationObserver: MutationObserver | null = null
let refreshScheduled = false
let fullRefreshRequested = false
const pendingRefreshScopes = new Set<ParentNode>()

type PointerLikeEvent = PointerEvent | MouseEvent

type MenuRelation = {
  kind: "panel" | "trigger" | null
  menuId: string | null
  rootId: string | null
  parentMenuId: string | null
}

type OverlayWindow = Window & { __affinoOverlayManager?: OverlayManager }

function resolveSharedOverlayManager(ownerDocument: Document): OverlayManager {
  const scope = ownerDocument.defaultView as OverlayWindow | null
  const existing = scope?.__affinoOverlayManager
  if (existing) {
    return existing
  }
  const manager = getDocumentOverlayManager(ownerDocument)
  if (scope) {
    scope.__affinoOverlayManager = manager
  }
  return manager
}

type MenuStructureSnapshot = {
  trigger: TriggerEl
  panel: PanelEl
  itemCount: number
  closeCount: number
  itemNodes: ItemEl[]
  closeNodes: HTMLElement[]
  configSignature: string
}

type ParentResolution = {
  core: MenuCore | null
  instance: MenuInstance | null
  root: RootEl | null
}

export function hydrateMenu(root: RootEl): void {
  const trigger = root.querySelector<TriggerEl>(MENU_TRIGGER_SELECTOR)
  let panel = root.querySelector<PanelEl>(MENU_PANEL_SELECTOR)
  if (!panel && root.dataset.affinoMenuPortal === "body" && typeof document !== "undefined") {
    const safeId = typeof CSS !== "undefined" && typeof CSS.escape === "function" && root.dataset.affinoMenuRoot
      ? CSS.escape(root.dataset.affinoMenuRoot)
      : root.dataset.affinoMenuRoot
    if (safeId) {
      const safePanelId = typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(`${safeId}-panel`)
        : `${safeId}-panel`
      panel = document.querySelector<PanelEl>(
        `${MENU_PANEL_SELECTOR}[${MENU_ROOT_ID_ATTR}='${safeId}'], ${MENU_PANEL_SELECTOR}[${MENU_ID_ATTR}='${safeId}'], ${MENU_PANEL_SELECTOR}#${safePanelId}`,
      )
      if (panel) {
        debugMenu("hydrate:resolved-portal-panel", { root: root.dataset.affinoMenuRoot })
      }
    }
  }
  if (!panel && root.dataset.affinoMenuPortal === "body") {
    debugMenu("hydrate:portal-missing-panel", { root: root.dataset.affinoMenuRoot })
    scheduleRefresh()
    return
  }
  if (!trigger || !panel) {
    debugMenu("hydrate:missing-structure", {
      root: root.dataset.affinoMenuRoot,
      hasTrigger: Boolean(trigger),
      hasPanel: Boolean(panel),
      portal: root.dataset.affinoMenuPortal,
    })
    tearDownInstance(root)
    structureRegistry.delete(root)
    return
  }
  const parentId = root.dataset.affinoMenuParent
  const parentItemId = root.dataset.affinoMenuParentItem
  if (parentId && parentItemId) {
    const parent = resolveParentResolution(parentId, parentItemId, root)
    const parentCore = parent.core
    if (!parentCore) {
      debugMenu("hydrate:parent-unresolved", {
        root: root.dataset.affinoMenuRoot,
        parentId,
        parentItemId,
      })
      root.dataset.affinoMenuParentResolved = "false"
      if (hasConnectedParentRoot(root)) {
        scheduleRefresh()
      }
      return
    }
  }
  const nextStructure = captureMenuStructure(root, trigger, panel)
  const previousStructure = structureRegistry.get(root)
  if (registry.has(root) && previousStructure && !didMenuStructureChange(previousStructure, nextStructure)) {
    const existing = registry.get(root)
    if (existing && parentId && parentItemId) {
      const parentInstance = resolveMenuInstanceById(parentId)
      const needsUpgrade = parentInstance && !(existing.getCore() instanceof SubmenuCore)
      if (!needsUpgrade) {
        return
      }
    } else {
      return
    }
  }
  tearDownInstance(root)
  const parent = resolveParentResolution(parentId, parentItemId, root)
  const parentInstance = parent.instance
  const parentCore = parent.core
  if (parentId && parentItemId) {
    root.dataset.affinoMenuParentResolved = parentCore ? "true" : "false"
  }
  const instance = new MenuInstance(root, trigger, panel, parentCore ?? null, parentItemId ?? null)
  registry.set(root, instance)
  if (root.dataset.affinoMenuRoot) {
    menuById.set(root.dataset.affinoMenuRoot, instance)
  }
  if (parentItemId) {
    submenuByParentItemId.set(parentItemId, instance)
    if (parentInstance) {
      parentInstance.bindSubmenuToItem(parentItemId, instance)
    } else if (parentCore) {
      bindSubmenuToParentElement(parentItemId, parentCore, instance)
    }
  }
  structureRegistry.set(root, nextStructure)
  root.affinoMenu = instance.getHandle()
}

export function scan(scope: ParentNode): void {
  const roots = collectMenuRoots(scope)
  if (!roots.length) {
    return
  }
  const rootMenus = roots.filter((node) => !isSubmenuRoot(node))
  const submenuRoots = roots.filter((node) => isSubmenuRoot(node))

  rootMenus.forEach((node) => hydrateMenu(node))

  if (!submenuRoots.length) {
    return
  }

  let unresolved = submenuRoots
  let previousCount = Number.POSITIVE_INFINITY
  while (unresolved.length && unresolved.length < previousCount) {
    previousCount = unresolved.length
    const nextUnresolved: RootEl[] = []
    unresolved.forEach((node) => {
      hydrateMenu(node)
      if (!registry.has(node)) {
        nextUnresolved.push(node)
      }
    })
    unresolved = nextUnresolved
  }

  if (unresolved.some((node) => hasConnectedParentRoot(node))) {
    scheduleRefresh()
  }
}

export function scheduleRefresh(): void {
  fullRefreshRequested = true
  pendingRefreshScopes.clear()
  scheduleRefreshInternal()
}

function scheduleRefreshScope(scope: ParentNode): void {
  if (fullRefreshRequested) {
    return
  }
  pendingRefreshScopes.add(scope)
  scheduleRefreshInternal()
}

function scheduleRefreshInternal(): void {
  if (refreshScheduled) {
    return
  }
  refreshScheduled = true
  const invoke = () => {
    refreshScheduled = false
    const scopes = fullRefreshRequested ? null : Array.from(pendingRefreshScopes)
    fullRefreshRequested = false
    pendingRefreshScopes.clear()
    refreshMenus(scopes)
  }
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(invoke)
  } else {
    setTimeout(invoke, 16)
  }
}

export function refreshMenusInScope(scope: ParentNode): void {
  if (typeof document === "undefined") {
    return
  }
  registry.forEach((_instance, root) => {
    if (!document.body.contains(root)) {
      tearDownInstance(root)
    }
  })
  scan(scope)
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

function refreshMenus(scopes: ParentNode[] | null): void {
  if (typeof document === "undefined") {
    return
  }
  registry.forEach((_instance, root) => {
    if (!document.body.contains(root)) {
      tearDownInstance(root)
    }
  })
  if (!scopes || scopes.length === 0) {
    scan(document)
    return
  }
  scopes.forEach((scope) => {
    if (scope instanceof Element && !scope.isConnected) {
      return
    }
    if (scope instanceof DocumentFragment && !scope.isConnected) {
      return
    }
    scan(scope)
  })
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
    let touched = false
    mutations.forEach((mutation) => {
      if (!mutationTouchesMenu(mutation)) {
        return
      }
      touched = true
      if (mutation.target instanceof Element || mutation.target instanceof Document || mutation.target instanceof DocumentFragment) {
        scheduleRefreshScope(mutation.target)
      }
      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element || node instanceof DocumentFragment) {
          scheduleRefreshScope(node)
        }
      })
    })
    if (touched && !pendingRefreshScopes.size) {
      scheduleRefresh()
    }
  })
  mutationObserver.observe(document.body, { childList: true, subtree: true })
}

function mutationTouchesMenu(mutation: MutationRecord): boolean {
  if (mutation.type !== "childList") {
    return false
  }
  if (isPortalMoveMutation(mutation)) {
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

function isPortalMoveMutation(mutation: MutationRecord): boolean {
  const nodes = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)]
  if (!nodes.length) {
    return false
  }
  let hasPanel = false
  for (const node of nodes) {
    if (node.nodeType === Node.COMMENT_NODE) {
      continue
    }
    if (!(node instanceof Element)) {
      return false
    }
    if (!isPortalManagedPanel(node)) {
      return false
    }
    hasPanel = true
  }
  return hasPanel
}

function isPortalManagedPanel(node: Element): boolean {
  return node instanceof HTMLElement
    && node.matches(MENU_PANEL_SELECTOR)
    && node.dataset.affinoMenuPortalManaged === "true"
}

function elementTouchesRegisteredMenu(node: Element): boolean {
  const owner = node.closest<RootEl>(MENU_ROOT_SELECTOR)
  if (owner && registry.has(owner)) {
    return true
  }
  if (node.matches(MENU_ROOT_SELECTOR) && registry.has(node as RootEl)) {
    return true
  }
  if (!node.querySelector) {
    return false
  }
  const descendants = node.querySelectorAll<RootEl>(MENU_ROOT_SELECTOR)
  for (let index = 0; index < descendants.length; index += 1) {
    const candidate = descendants[index]
    if (candidate && registry.has(candidate)) {
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
    structureRegistry.delete(root)
    if (root.dataset.affinoMenuRoot) {
      menuById.delete(root.dataset.affinoMenuRoot)
    }
    const parentItemId = instance.getParentItemId()
    if (parentItemId) {
      submenuByParentItemId.delete(parentItemId)
    }
    delete root.affinoMenu
  }
}

function collectMenuRoots(scope: ParentNode): RootEl[] {
  const unique = new Set<RootEl>()
  if (scope instanceof HTMLElement && scope.matches(MENU_ROOT_SELECTOR)) {
    unique.add(scope as RootEl)
  }
  Array.from(scope.querySelectorAll<RootEl>(MENU_ROOT_SELECTOR)).forEach((node) => {
    unique.add(node)
  })
  return Array.from(unique)
}

function isSubmenuRoot(root: RootEl): boolean {
  return Boolean(root.dataset.affinoMenuParent && root.dataset.affinoMenuParentItem)
}

function hasConnectedParentRoot(root: RootEl): boolean {
  const parentId = root.dataset.affinoMenuParent
  if (parentId) {
    const parentRoot = resolveRootByMenuId(parentId)
    if (parentRoot?.isConnected) {
      return true
    }
  }
  const parentItemId = root.dataset.affinoMenuParentItem
  if (!parentItemId || typeof document === "undefined") {
    return false
  }
  const parentItem = document.getElementById(parentItemId)
  return Boolean(parentItem?.isConnected)
}

function resolveRootByMenuId(id: string): RootEl | null {
  if (typeof document === "undefined") {
    return null
  }
  const safeId = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(id) : id
  return document.querySelector<RootEl>(`${MENU_ROOT_SELECTOR}[data-affino-menu-root='${safeId}']`)
}

function resolveParentResolution(
  parentId: string | undefined,
  parentItemId: string | undefined,
  childRoot: RootEl,
): ParentResolution {
  const directInstance = parentId ? resolveMenuInstanceById(parentId) : null
  const directCore = directInstance?.getCore() ?? (parentId ? resolveMenuCoreById(parentId) : null)
  const directRoot = parentId ? resolveRootByMenuId(parentId) : null
  if (directCore) {
    return {
      core: directCore,
      instance: directInstance,
      root: directRoot,
    }
  }
  if (!parentItemId || typeof document === "undefined") {
    return {
      core: null,
      instance: null,
      root: directRoot,
    }
  }
  const parentItem = document.getElementById(parentItemId)
  const inferredRoot = parentItem?.closest<RootEl>(MENU_ROOT_SELECTOR) ?? null
  if (!inferredRoot || inferredRoot === childRoot) {
    return {
      core: null,
      instance: null,
      root: directRoot,
    }
  }
  if (!registry.has(inferredRoot)) {
    hydrateMenu(inferredRoot)
  }
  const inferredInstance = registry.get(inferredRoot) ?? null
  const inferredCore = inferredInstance?.getCore() ?? inferredRoot.affinoMenuCore ?? null
  if (inferredCore && inferredRoot.dataset.affinoMenuRoot && childRoot.dataset.affinoMenuParent !== inferredRoot.dataset.affinoMenuRoot) {
    childRoot.dataset.affinoMenuParent = inferredRoot.dataset.affinoMenuRoot
  }
  return {
    core: inferredCore,
    instance: inferredInstance,
    root: inferredRoot,
  }
}

function resolveMenuInstanceById(id: string): MenuInstance | null {
  const cached = menuById.get(id)
  if (cached) {
    return cached
  }
  const root = resolveRootByMenuId(id)
  if (root) {
    if (!registry.has(root)) {
      hydrateMenu(root)
    }
    if (registry.has(root)) {
      return registry.get(root) ?? null
    }
  }
  return null
}

function resolveMenuCoreById(id: string): MenuCore | null {
  const instance = resolveMenuInstanceById(id)
  if (instance) {
    return instance.getCore()
  }
  const root = resolveRootByMenuId(id)
  return root?.affinoMenuCore ?? null
}

function bindSubmenuToParentElement(
  parentItemId: string,
  parentCore: MenuCore | null,
  submenuInstance: MenuInstance,
): void {
  if (typeof document === "undefined") {
    return
  }
  const node = document.getElementById(parentItemId)
  if (!node) {
    return
  }
  if (node.dataset.affinoMenuSubmenuBound === "true") {
    return
  }
  const openSubmenu = (reason: SurfaceReason) => {
    parentCore?.highlight(parentItemId)
    submenuInstance.getHandle().open(reason)
  }
  const onPointerEnter = () => openSubmenu("pointer")
  const onMouseEnter = () => openSubmenu("pointer")
  const onClick = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation?.()
    openSubmenu("pointer")
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowRight" || event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation?.()
      openSubmenu("keyboard")
    }
  }
  node.addEventListener("pointerenter", onPointerEnter)
  node.addEventListener("mouseenter", onMouseEnter)
  node.addEventListener("click", onClick, true)
  node.addEventListener("keydown", onKeyDown, true)
  node.dataset.affinoMenuSubmenuBound = "true"
}

function resolveSubmenuByParentItemId(id: string): MenuInstance | null {
  return submenuByParentItemId.get(id) ?? null
}

function captureMenuStructure(root: RootEl, trigger: TriggerEl, panel: PanelEl): MenuStructureSnapshot {
  const itemNodes = Array.from(panel.querySelectorAll(MENU_ITEM_SELECTOR))
    .filter((node): node is ItemEl => node instanceof HTMLElement)
    .filter((node) => isOwnedPanelNode(node, panel))
  const closeNodes = Array.from(root.querySelectorAll(MENU_CLOSE_SELECTOR))
    .filter((node): node is HTMLElement => node instanceof HTMLElement)
    .filter((node) => isOwnedPanelNode(node, panel))
  return {
    trigger,
    panel,
    itemCount: itemNodes.length,
    closeCount: closeNodes.length,
    itemNodes,
    closeNodes,
    configSignature: buildMenuConfigSignature(root),
  }
}

function didMenuStructureChange(previous: MenuStructureSnapshot, next: MenuStructureSnapshot): boolean {
  if (previous.trigger !== next.trigger || previous.panel !== next.panel) {
    return true
  }
  if (previous.itemCount !== next.itemCount || previous.closeCount !== next.closeCount) {
    return true
  }
  for (let index = 0; index < next.itemNodes.length; index += 1) {
    if (previous.itemNodes[index] !== next.itemNodes[index]) {
      return true
    }
  }
  for (let index = 0; index < next.closeNodes.length; index += 1) {
    if (previous.closeNodes[index] !== next.closeNodes[index]) {
      return true
    }
  }
  return previous.configSignature !== next.configSignature
}

function buildMenuConfigSignature(root: RootEl): string {
  const ignored = new Set(["data-affino-menu-state", "data-affino-menu-core-kind", "data-affino-menu-parent-resolved"])
  return root
    .getAttributeNames()
    .filter((name) => name.startsWith("data-affino-menu-") && !ignored.has(name))
    .sort()
    .map((name) => `${name}:${root.getAttribute(name) ?? ""}`)
    .join("|")
}

function resolveMenuRelation(element: HTMLElement | null): MenuRelation {
  if (!element) {
    return { kind: null, menuId: null, rootId: null, parentMenuId: null }
  }
  const panel = element.closest<HTMLElement>(MENU_PANEL_SELECTOR)
  if (panel) {
    return {
      kind: "panel",
      menuId: panel.dataset.affinoMenuId ?? null,
      rootId: panel.dataset.affinoMenuRootId ?? null,
      parentMenuId: panel.dataset.affinoMenuParentId ?? null,
    }
  }
  const trigger = element.closest<HTMLElement>(MENU_TRIGGER_SELECTOR)
  if (trigger) {
    return {
      kind: "trigger",
      menuId: trigger.dataset.affinoMenuId ?? null,
      rootId: trigger.dataset.affinoMenuRootId ?? null,
      parentMenuId: trigger.dataset.affinoMenuParentId ?? null,
    }
  }
  return { kind: null, menuId: null, rootId: null, parentMenuId: null }
}

function toPointerPayload(event: PointerLikeEvent, meta: PointerMeta = {}): PointerEventLike {
  return {
    clientX: event.clientX,
    clientY: event.clientY,
    meta,
    preventDefault: () => event.preventDefault(),
  }
}

class MenuInstance {
  private readonly root: RootEl
  private readonly trigger: TriggerEl
  private readonly panel: PanelEl
  private readonly rootMenuId: string
  private readonly parentMenuId: string | null
  private readonly parentItemId: string | null
  private readonly closeTargets: HTMLElement[]
  private readonly cleanup: Cleanup[] = []
  private readonly itemReleases: Cleanup[] = []
  private readonly itemsById = new Map<string, ItemEl>()
  private readonly submenuBindings = new Map<string, { cleanup: Cleanup[]; submenu: MenuInstance }>()
  private readonly submenuLazyBindings = new Map<string, Cleanup[]>()
  private submenuTriggerCleanup: Cleanup[] = []
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
  private pendingMeasureFrame: number | null = null
  private pendingPositionSync: number | null = null
  private restoreCloseGuard: (() => void) | null = null

  constructor(
    root: RootEl,
    trigger: TriggerEl,
    panel: PanelEl,
    parentCore: MenuCore | null,
    parentItemId: string | null,
  ) {
    this.root = root
    this.trigger = trigger
    this.panel = panel
    this.closeTargets = Array.from(root.querySelectorAll(MENU_CLOSE_SELECTOR))
      .filter((node): node is HTMLElement => node instanceof HTMLElement)
      .filter((node) => isOwnedPanelNode(node, panel))

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
    this.core = this.createMenuCore(parentCore, parentItemId)
    this.parentMenuId = parentCore?.id ?? null
    this.parentItemId = parentItemId
    this.rootMenuId = this.resolveRootMenuId()
    this.installHandle()
    this.installCloseGuard()
    this.initialize()
  }

  destroy(): void {
    this.cancelFocusRequest()
    if (this.pendingMeasureFrame !== null) {
      cancelFrame(this.pendingMeasureFrame)
      this.pendingMeasureFrame = null
    }
    if (this.pendingPositionSync !== null) {
      cancelFrame(this.pendingPositionSync)
      this.pendingPositionSync = null
    }
    if (this.restoreCloseGuard) {
      this.restoreCloseGuard()
      this.restoreCloseGuard = null
    }
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

  getCore(): MenuCore {
    return this.core
  }

  focusItem(itemId: string): void {
    const node = this.itemsById.get(itemId)
    if (node) {
      this.focusElement(node)
    }
  }

  getParentItemId(): string | null {
    return this.parentItemId
  }

  private installHandle(): void {
    this.root.affinoMenu = this.getHandle()
    this.root.affinoMenuCore = this.core
    this.root.dataset.affinoMenuCoreKind = this.core instanceof SubmenuCore ? "submenu" : "menu"
  }

  private attachSubmenuHandlers(
    itemId: string,
    itemProps: { onPointerEnter?: (event: PointerEventLike) => void; onClick?: (event: MouseEvent) => void; onKeyDown?: (event: KeyboardEvent) => void },
    submenuInstance: MenuInstance,
  ): void {
    const resolveSubmenu = () => resolveSubmenuByParentItemId(itemId) ?? submenuInstance
    const openSubmenu = (reason: SurfaceReason) => {
      this.openSubmenuAfterHighlight(itemId, resolveSubmenu(), reason)
    }
    const pointerEnter = itemProps.onPointerEnter
    itemProps.onPointerEnter = (event) => {
      pointerEnter?.(event)
      openSubmenu("pointer")
    }
    itemProps.onClick = (event) => {
      event.preventDefault?.()
      event.stopPropagation?.()
      openSubmenu("pointer")
    }
    const keydown = itemProps.onKeyDown
    itemProps.onKeyDown = (event) => {
      if (event.key === "ArrowRight" || event.key === "Enter" || event.key === " ") {
        event.preventDefault()
        event.stopPropagation()
        openSubmenu("keyboard")
        return
      }
      keydown?.(event)
    }
  }

  bindSubmenuToItem(itemId: string, submenuInstance: MenuInstance): void {
    this.teardownLazySubmenu(itemId)
    const node = this.itemsById.get(itemId)
      ?? (typeof document !== "undefined" ? document.getElementById(itemId) : null)
    const nextSubmenuId = submenuInstance.getCore().id
    const existing = this.submenuBindings.get(itemId)
    const existingSubmenuId = node?.dataset.affinoMenuSubmenuId
    if (existing && existing.submenu === submenuInstance && existingSubmenuId === nextSubmenuId) {
      return
    }
    if (existing) {
      existing.cleanup.forEach((fn) => fn())
      this.submenuBindings.delete(itemId)
    }
    debugMenu("bind-submenu", { itemId, menuId: this.core.id, submenuId: nextSubmenuId })
    if (!node) {
      return
    }
    const resolveSubmenu = () => resolveSubmenuByParentItemId(itemId) ?? submenuInstance
    const openSubmenu = (reason: SurfaceReason) => {
      this.openSubmenuAfterHighlight(itemId, resolveSubmenu(), reason)
    }
    const onPointerEnter = (_event: PointerEvent) => {
      this.inputIntent = "pointer"
      openSubmenu("pointer")
    }
    const onMouseEnter = (_event: MouseEvent) => {
      this.inputIntent = "pointer"
      openSubmenu("pointer")
    }
    const onClick = (event: MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation?.()
      openSubmenu("pointer")
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === "Enter" || event.key === " ") {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation?.()
        openSubmenu("keyboard")
      }
    }
    node.addEventListener("pointerenter", onPointerEnter)
    node.addEventListener("mouseenter", onMouseEnter)
    node.addEventListener("click", onClick, true)
    node.addEventListener("keydown", onKeyDown, true)
    const cleanup: Cleanup[] = [
      () => node.removeEventListener("pointerenter", onPointerEnter),
      () => node.removeEventListener("mouseenter", onMouseEnter),
      () => node.removeEventListener("click", onClick, true),
      () => node.removeEventListener("keydown", onKeyDown, true),
    ]
    node.dataset.affinoMenuSubmenuBound = "true"
    node.dataset.affinoMenuSubmenuId = nextSubmenuId
    cleanup.forEach((fn) => this.cleanup.push(fn))
    this.submenuBindings.set(itemId, { cleanup, submenu: submenuInstance })
  }

  private bindSubmenuLazyTrigger(itemId: string): void {
    if (this.submenuBindings.has(itemId) || this.submenuLazyBindings.has(itemId)) {
      return
    }
    debugMenu("bind-submenu-lazy", { itemId, menuId: this.core.id })
    const node = this.itemsById.get(itemId)
      ?? (typeof document !== "undefined" ? document.getElementById(itemId) : null)
    if (!node) {
      return
    }
    const resolveSubmenu = () => {
      const existing = resolveSubmenuByParentItemId(itemId)
      if (existing) {
        return existing
      }
      if (typeof document === "undefined") {
        return null
      }
      const safeId = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(itemId) : itemId
      const root = document.querySelector<RootEl>(`${MENU_ROOT_SELECTOR}[data-affino-menu-parent-item='${safeId}']`)
      if (!root) {
        debugMenu("lazy-submenu:root-not-found", { itemId })
        return null
      }
      hydrateMenu(root)
      return resolveSubmenuByParentItemId(itemId)
    }
    const openSubmenu = (reason: SurfaceReason) => {
      debugMenu("lazy-submenu:open", { itemId, reason })
      const submenuInstance = resolveSubmenu()
      if (!submenuInstance || submenuInstance === this) {
        debugMenu("lazy-submenu:missing", { itemId })
        return
      }
      if (!this.submenuBindings.has(itemId)) {
        this.bindSubmenuToItem(itemId, submenuInstance)
      }
      this.openSubmenuAfterHighlight(itemId, submenuInstance, reason)
    }
    const onPointerEnter = (_event: PointerEvent) => {
      this.inputIntent = "pointer"
      openSubmenu("pointer")
    }
    const onMouseEnter = (_event: MouseEvent) => {
      this.inputIntent = "pointer"
      openSubmenu("pointer")
    }
    const onClick = (event: MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation?.()
      openSubmenu("pointer")
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === "Enter" || event.key === " ") {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation?.()
        openSubmenu("keyboard")
      }
    }
    node.addEventListener("pointerenter", onPointerEnter)
    node.addEventListener("mouseenter", onMouseEnter)
    node.addEventListener("click", onClick, true)
    node.addEventListener("keydown", onKeyDown, true)
    const cleanup: Cleanup[] = [
      () => node.removeEventListener("pointerenter", onPointerEnter),
      () => node.removeEventListener("mouseenter", onMouseEnter),
      () => node.removeEventListener("click", onClick, true),
      () => node.removeEventListener("keydown", onKeyDown, true),
    ]
    this.submenuLazyBindings.set(itemId, cleanup)
    cleanup.forEach((fn) => this.cleanup.push(fn))
  }

  private teardownLazySubmenu(itemId: string): void {
    const cleanup = this.submenuLazyBindings.get(itemId)
    if (!cleanup) {
      return
    }
    cleanup.forEach((fn) => fn())
    this.submenuLazyBindings.delete(itemId)
  }

  private attachSubmenuPanelKeydown(panelProps: Record<string, unknown>): void {
    const keydown = panelProps.onKeyDown
    panelProps.onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "ArrowLeft") {
        event.preventDefault()
        event.stopPropagation()
        this.core.close("keyboard")
        if (this.parentItemId) {
          const parentInstance = this.parentMenuId ? resolveMenuInstanceById(this.parentMenuId) : null
          parentInstance?.getCore().highlight(this.parentItemId)
          parentInstance?.focusItem(this.parentItemId)
        }
        return
      }
      if (typeof keydown === "function") {
        keydown(event)
      }
    }
  }

  private openSubmenuAfterHighlight(
    itemId: string,
    submenuInstance: MenuInstance,
    reason: SurfaceReason,
    parentInstance?: MenuInstance,
  ): void {
    debugMenu("submenu:open", { itemId, reason, parent: parentInstance ? parentInstance.getCore().id : this.core.id, submenu: submenuInstance.getCore().id })
    const parent = parentInstance ?? this
    parent.getCore().highlight(itemId)
    if (typeof queueMicrotask === "function") {
      queueMicrotask(() => submenuInstance.getHandle().open(reason))
      return
    }
    scheduleFrame(() => submenuInstance.getHandle().open(reason))
  }

  private bindSubmenuTriggerFallback(): void {
    const openSubmenu = (reason: SurfaceReason) => {
      if (this.parentItemId && this.parentMenuId) {
        const parentInstance = resolveMenuInstanceById(this.parentMenuId)
        if (parentInstance) {
          this.openSubmenuAfterHighlight(this.parentItemId, this, reason, parentInstance)
          return
        }
      }
      this.core.open(reason)
    }
    const onPointerEnter = (_event: PointerEvent) => {
      this.inputIntent = "pointer"
      openSubmenu("pointer")
    }
    const onMouseEnter = (_event: MouseEvent) => {
      this.inputIntent = "pointer"
      openSubmenu("pointer")
    }
    const onClick = (event: MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation?.()
      openSubmenu("pointer")
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === "Enter" || event.key === " ") {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation?.()
        openSubmenu("keyboard")
      }
    }
    this.trigger.addEventListener("pointerenter", onPointerEnter)
    this.trigger.addEventListener("mouseenter", onMouseEnter)
    this.trigger.addEventListener("click", onClick, true)
    this.trigger.addEventListener("keydown", onKeyDown, true)
    this.trigger.dataset.affinoMenuSubmenuTriggerBound = "true"
    this.submenuTriggerCleanup = [
      () => this.trigger.removeEventListener("pointerenter", onPointerEnter),
      () => this.trigger.removeEventListener("mouseenter", onMouseEnter),
      () => this.trigger.removeEventListener("click", onClick, true),
      () => this.trigger.removeEventListener("keydown", onKeyDown, true),
    ]
    this.submenuTriggerCleanup.forEach((fn) => this.cleanup.push(fn))
  }

  private createMenuCore(parentCore: MenuCore | null, parentItemId: string | null): MenuCore {
    const overlayManager = resolveSharedOverlayManager(this.root.ownerDocument ?? document)
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
    const stateOpen = this.root.dataset.affinoMenuState === "open"
    const defaultOpen = stateOpen || readBoolean(this.root.dataset.affinoMenuDefaultOpen, false)
    const closeOnSelect = readBoolean(this.root.dataset.affinoMenuCloseSelect, true)

    const options = {
      id: this.root.dataset.affinoMenuRoot,
      openDelay,
      closeDelay,
      defaultOpen,
      closeOnSelect,
      loopFocus: this.loopFocus,
      overlayManager,
      overlayKind,
      overlayEntryTraits: Object.keys(overlayEntryTraits).length ? overlayEntryTraits : undefined,
    }
    if (parentCore && parentItemId) {
      return new SubmenuCore(parentCore, { ...options, parentItemId })
    }
    return new MenuCore(options)
  }

  private initialize(): void {
    this.panel.dataset.state = "closed"
    this.panel.hidden = true
    this.panel.setAttribute("aria-hidden", "true")
    this.panel.setAttribute("inert", "")
    this.applyRelationAttributes()
    const triggerProps = this.core instanceof SubmenuCore
      ? this.withPointerMeta(this.core.getTriggerProps())
      : this.withPointerMeta(this.stripHoverHandlers(this.core.getTriggerProps()))
    const panelProps = this.withPointerMeta(this.stripHoverDismiss(this.withDomKeydown(this.core.getPanelProps())))
    if (this.core instanceof SubmenuCore) {
      this.attachSubmenuPanelKeydown(panelProps)
    }
    this.normalizeTriggerBindings(triggerProps, panelProps)

    this.bindProps(this.trigger, triggerProps)
    this.bindProps(this.panel, panelProps)
    if (this.core instanceof SubmenuCore) {
      this.bindSubmenuTriggerFallback()
    }
    this.registerItems()
    this.registerCloseTargets()
    this.bindIntentListeners()
    this.bindOutsideGuards()
    this.bindViewportHandlers()

    const subscription = this.core.subscribe((snapshot) => this.syncState(snapshot))
    this.cleanup.push(() => subscription.unsubscribe())
    this.syncState(this.core.getSnapshot())
    this.observeDomState()
    this.syncOpenFromDomState()
  }

  private installCloseGuard(): void {
    const core = this.core
    const original = core.requestClose.bind(core)
    core.requestClose = (reason: SurfaceReason = "programmatic") => {
      if (reason === "pointer" && this.inputIntent === "keyboard" && this.isFocusWithinMenu()) {
        return
      }
      original(reason)
    }
    this.restoreCloseGuard = () => {
      core.requestClose = original
    }
  }

  private registerItems(): void {
    const nodes = this.collectItems(true)
    nodes.forEach((node, index) => {
      const id = node.id || `${this.core.id}-item-${index}`
      node.id = id
      const release = this.core.registerItem(id, { disabled: this.isDisabled(node) })
      this.itemReleases.push(release)
      const itemProps = this.withDomKeydown(this.core.getItemProps(id))
      const submenuInstance = resolveSubmenuByParentItemId(id)
      if (submenuInstance && submenuInstance !== this) {
        this.attachSubmenuHandlers(id, itemProps, submenuInstance)
        this.bindSubmenuToItem(id, submenuInstance)
      } else if (node.matches(MENU_TRIGGER_SELECTOR)) {
        this.bindSubmenuLazyTrigger(id)
      }
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
    debugMenu("sync-state", { menuId: this.core.id, state, prev })
    this.root.dataset.affinoMenuState = state
    this.trigger.setAttribute("data-state", state)
    this.trigger.setAttribute("aria-expanded", this.isOpen ? "true" : "false")
    this.panel.dataset.state = state

    if (this.isOpen) {
      this.panel.hidden = false
      this.panel.setAttribute("aria-hidden", "false")
      this.panel.removeAttribute("inert")
      this.panel.style.visibility = ""
      this.panel.style.pointerEvents = ""
      if (!this.scrollLockHeld && this.lockScroll) {
        acquireDocumentScrollLock(this.root.ownerDocument, "menu")
        this.scrollLockHeld = true
      }
      if (!prev) {
        const nestedRoots = Array.from(this.panel.querySelectorAll<RootEl>(MENU_ROOT_SELECTOR))
        nestedRoots.forEach((node) => hydrateMenu(node))
        this.syncNestedSubmenuBindings(nestedRoots)
        this.syncPanelPosition()
        this.focusOnOpen()
      }
      this.syncActiveItem(snapshot.activeItemId)
      return
    }

    if (this.scrollLockHeld) {
      releaseDocumentScrollLock(this.root.ownerDocument, "menu")
      this.scrollLockHeld = false
    }
    if (this.pendingMeasureFrame !== null) {
      cancelFrame(this.pendingMeasureFrame)
      this.pendingMeasureFrame = null
    }
    if (this.pendingPositionSync !== null) {
      cancelFrame(this.pendingPositionSync)
      this.pendingPositionSync = null
    }
    if (prev && this.shouldRestoreFocus()) {
      this.focusElement(this.trigger)
    }
    this.panel.setAttribute("aria-hidden", "true")
    this.panel.hidden = true
    this.panel.setAttribute("inert", "")
    this.panel.style.visibility = "hidden"
    this.panel.style.pointerEvents = "none"
    this.syncActiveItem(null)
    this.inputIntent = "pointer"
  }

  private syncActiveItem(itemId: string | null): void {
    if (!this.itemsById.size) {
      return
    }
    if (itemId && this.inputIntent === "pointer") {
      const submenuInstance = resolveSubmenuByParentItemId(itemId)
      if (submenuInstance && submenuInstance !== this) {
        submenuInstance.getHandle().open("pointer")
      }
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

  private syncNestedSubmenuBindings(nestedRoots?: RootEl[]): void {
    const roots = nestedRoots ?? Array.from(this.panel.querySelectorAll<RootEl>(MENU_ROOT_SELECTOR))
    roots.forEach((node) => {
      const parentItemId = node.dataset.affinoMenuParentItem
      if (!parentItemId) {
        return
      }
      const submenu = resolveSubmenuByParentItemId(parentItemId)
      if (submenu && submenu !== this) {
        this.bindSubmenuToItem(parentItemId, submenu)
      }
    })
  }

  private positionPanel(hideWhileMeasuring = true): void {
    const anchor = this.trigger.getBoundingClientRect()
    if (hideWhileMeasuring) {
      this.panel.style.visibility = "hidden"
      this.panel.style.pointerEvents = "none"
    }
    const surface = this.panel.getBoundingClientRect()
    if (surface.width === 0 || surface.height === 0) {
      if (this.pendingMeasureFrame === null) {
        this.pendingMeasureFrame = scheduleFrame(() => {
          this.pendingMeasureFrame = null
          if (this.isOpen && !this.panel.hidden) {
            this.positionPanel(hideWhileMeasuring)
          }
        })
      }
      return
    }
    const position = this.core.computePosition(anchor, surface, {
      placement: this.positioning.placement,
      align: this.positioning.align,
      gutter: this.positioning.gutter,
      viewportPadding: this.positioning.viewportPadding,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    })
    if (this.core instanceof SubmenuCore) {
      this.core.setTriggerRect(anchor)
      this.core.setPanelRect(surface)
    }
    this.panel.style.position = "fixed"
    this.panel.style.left = `${Math.round(position.left)}px`
    this.panel.style.top = `${Math.round(position.top)}px`
    this.panel.dataset.placement = position.placement
    this.panel.dataset.align = position.align
    if (hideWhileMeasuring) {
      this.panel.style.visibility = ""
      this.panel.style.pointerEvents = ""
    }
  }

  private syncPanelPosition(): void {
    this.positionPanel(false)
    if (this.pendingPositionSync !== null) {
      cancelFrame(this.pendingPositionSync)
    }
    this.pendingPositionSync = scheduleFrame(() => {
      this.pendingPositionSync = null
      if (this.isOpen && !this.panel.hidden) {
        this.positionPanel(false)
      }
    })
  }

  private observeDomState(): void {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.attributeName === "data-affino-menu-state") {
          this.syncOpenFromDomState()
          return
        }
      }
    })
    observer.observe(this.root, {
      attributes: true,
      attributeFilter: ["data-affino-menu-state"],
    })
    this.cleanup.push(() => observer.disconnect())
  }

  private syncOpenFromDomState(): void {
    const domOpen = this.root.dataset.affinoMenuState === "open"
    const snapshotOpen = this.core.getSnapshot().open
    if (domOpen && !snapshotOpen) {
      this.core.open("programmatic")
      return
    }
    if (!domOpen && snapshotOpen) {
      this.core.close("programmatic")
    }
  }

  private isFocusWithinPanel(): boolean {
    if (typeof document === "undefined") {
      return false
    }
    const active = document.activeElement
    if (!active) {
      return false
    }
    return active === this.panel || this.panel.contains(active)
  }

  private isFocusWithinMenu(): boolean {
    if (typeof document === "undefined") {
      return false
    }
    const active = document.activeElement
    if (!active) {
      return false
    }
    return this.root.contains(active) || this.panel.contains(active)
  }

  private collectItems(forceRefresh = false): ItemEl[] {
    if (!forceRefresh && this.orderedItems.length) {
      return this.orderedItems
    }
    const nodes = Array.from(this.panel.querySelectorAll<ItemEl>(MENU_ITEM_SELECTOR))
      .filter((node): node is ItemEl => node instanceof HTMLElement)
      .filter((node) => isOwnedPanelNode(node, this.panel))
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

  private normalizeTriggerBindings(
    triggerProps: Record<string, unknown>,
    panelProps: Record<string, unknown>,
  ): void {
    if (!this.trigger.id) {
      return
    }
    const nextId = triggerProps.id
    if (typeof nextId === "string" && nextId !== this.trigger.id) {
      triggerProps.id = this.trigger.id
      if (typeof panelProps["aria-labelledby"] === "string") {
        panelProps["aria-labelledby"] = this.trigger.id
      }
    }
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

  private withPointerMeta(props: unknown): Record<string, unknown> {
    if (!props) {
      return {}
    }
    const clone = { ...(props as Record<string, unknown>) }
    const onPointerEnter = clone.onPointerEnter
    const onPointerLeave = clone.onPointerLeave
    if (typeof onPointerEnter === "function") {
      clone.onPointerEnter = (event: PointerLikeEvent) => {
        ;(onPointerEnter as (event: PointerEventLike) => void)(toPointerPayload(event))
      }
    }
    if (typeof onPointerLeave === "function") {
      clone.onPointerLeave = (event: PointerLikeEvent) => {
        const meta = this.buildPointerMeta(event)
        ;(onPointerLeave as (event: PointerEventLike) => void)(toPointerPayload(event, meta))
      }
    }
    return clone
  }

  private buildPointerMeta(event: PointerLikeEvent): PointerMeta {
    let related = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null
    if (!related && typeof document !== "undefined" && typeof event.clientX === "number" && typeof event.clientY === "number") {
      const fromPoint = (document as Document & { elementFromPoint?: (x: number, y: number) => Element | null }).elementFromPoint
      if (typeof fromPoint === "function") {
        try {
          const fallback = fromPoint.call(document, event.clientX, event.clientY)
          related = fallback instanceof HTMLElement ? fallback : null
        } catch {
          related = null
        }
      }
    }
    if (!related) {
      return {
        isInsidePanel: false,
        enteredChildPanel: false,
        relatedTargetId: null,
        isWithinTree: false,
        relatedMenuId: null,
      }
    }
    const relation = resolveMenuRelation(related)
    const isSameTree = Boolean(relation.rootId && relation.rootId === this.rootMenuId)
    const relatedMenuId = relation.kind === "trigger"
      ? relation.parentMenuId ?? relation.menuId
      : relation.menuId
    return {
      isInsidePanel: this.panel.contains(related),
      enteredChildPanel: isSameTree ? this.isDescendant(relation.menuId) : false,
      relatedTargetId: related.id || null,
      isWithinTree: isSameTree,
      relatedMenuId,
    }
  }

  private isDescendant(menuId: string | null): boolean {
    if (!menuId) return false
    const path = this.core.getTree().snapshot.openPath
    const index = path.indexOf(this.core.id)
    if (index === -1) return false
    const targetIndex = path.indexOf(menuId)
    return targetIndex > index
  }

  private resolveRootMenuId(): string {
    const treeRoot = this.core.getTree().snapshot.openPath[0]
    if (treeRoot) {
      return treeRoot
    }
    if (this.root.dataset.affinoMenuRoot) {
      return this.root.dataset.affinoMenuRoot
    }
    return this.core.id
  }

  private applyRelationAttributes(): void {
    this.trigger.setAttribute(MENU_ID_ATTR, this.core.id)
    this.trigger.setAttribute(MENU_ROOT_ID_ATTR, this.rootMenuId)
    if (this.parentMenuId) {
      this.trigger.setAttribute(MENU_PARENT_ID_ATTR, this.parentMenuId)
    } else {
      this.trigger.removeAttribute(MENU_PARENT_ID_ATTR)
    }
    this.panel.setAttribute(MENU_ID_ATTR, this.core.id)
    this.panel.setAttribute(MENU_ROOT_ID_ATTR, this.rootMenuId)
    if (this.parentMenuId) {
      this.panel.setAttribute(MENU_PARENT_ID_ATTR, this.parentMenuId)
    } else {
      this.panel.removeAttribute(MENU_PARENT_ID_ATTR)
    }
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
    if (this.root.dataset.affinoMenuRoot) {
      this.panel.setAttribute(MENU_ROOT_ID_ATTR, this.root.dataset.affinoMenuRoot)
      this.panel.setAttribute(MENU_ID_ATTR, this.root.dataset.affinoMenuRoot)
    }
    this.panel.dataset.affinoMenuPortalManaged = "true"
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
    delete this.panel.dataset.affinoMenuPortalManaged
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
    this.focusRaf = scheduleFrame(() => {
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
    this.focusRaf = scheduleFrame(() => {
      this.focusElement(this.panel)
      this.focusRaf = null
    })
  }

  private cancelFocusRequest(): void {
    if (this.focusRaf !== null) {
      cancelFrame(this.focusRaf)
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

function isOwnedPanelNode(node: Element, panel: PanelEl): boolean {
  return node.closest(MENU_PANEL_SELECTOR) === panel
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
