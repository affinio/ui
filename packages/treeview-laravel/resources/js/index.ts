import {
  TreeviewCore,
  type TreeviewNode,
  type TreeviewSnapshot,
} from "@affino/treeview-core"

type TreeviewHandle = {
  select: (value: string) => void
  clearSelection: () => void
  focus: (value: string) => void
  focusFirst: () => void
  focusLast: () => void
  focusNext: () => void
  focusPrevious: () => void
  expand: (value: string) => void
  collapse: (value: string) => void
  toggle: (value: string) => void
  getSnapshot: () => TreeviewSnapshot<string>
}

type RootEl = HTMLElement & {
  dataset: DOMStringMap & {
    affinoTreeviewRoot?: string
    affinoTreeviewUid?: string
    affinoTreeviewLoop?: string
    affinoTreeviewDefaultExpanded?: string
    affinoTreeviewDefaultSelected?: string
    affinoTreeviewDefaultActive?: string
    affinoTreeviewState?: string
    affinoTreeviewSelected?: string
    affinoTreeviewActive?: string
  }
  affinoTreeview?: TreeviewHandle
}

type ItemEl = HTMLElement & {
  dataset: DOMStringMap & {
    affinoTreeviewItem?: string
    affinoTreeviewValue?: string
    affinoTreeviewParent?: string
    affinoTreeviewDisabled?: string
    affinoTreeviewExpanded?: string
    affinoTreeviewLevel?: string
    affinoTreeviewLast?: string
  }
}

type Cleanup = () => void

type TreeviewStructure = {
  items: ItemEl[]
}

type TreeviewItemModel = {
  element: ItemEl
  value: string
  parent: string | null
  disabled: boolean
  children: string[]
  level: number
  siblingIndex: number
  siblingCount: number
}

const TREEVIEW_ROOT_SELECTOR = "[data-affino-treeview-root]"
const TREEVIEW_ITEM_SELECTOR = "[data-affino-treeview-item]"
const TREEVIEW_TOGGLE_SELECTOR = "[data-affino-treeview-toggle]"
const TREEVIEW_GUIDES_SELECTOR = "[data-affino-treeview-guides]"
const registry = new WeakMap<RootEl, Cleanup>()
const structureRegistry = new WeakMap<RootEl, TreeviewStructure>()
const pendingScanScopes = new Set<ParentNode>()
const pendingRemovedRoots = new Set<RootEl>()
let scanFlushScheduled = false
let removedCleanupScheduled = false
let treeviewUidCounter = 0

export function bootstrapAffinoTreeviews(): void {
  if (typeof document === "undefined") {
    return
  }
  scan(document)
  setupMutationObserver()
}

export function hydrateTreeview(root: RootEl): void {
  const structure = collectTreeviewStructure(root)
  if (!structure) {
    registry.get(root)?.()
    structureRegistry.delete(root)
    root.dataset.affinoTreeviewState = "idle"
    root.dataset.affinoTreeviewSelected = ""
    root.dataset.affinoTreeviewActive = ""
    return
  }
  hydrateResolvedTreeview(root, structure)
}

function hydrateResolvedTreeview(root: RootEl, structure: TreeviewStructure): void {
  registry.get(root)?.()

  const uid = ensureTreeviewUid(root)
  const { models, byValue } = resolveModels(structure.items)
  if (!models.length) {
    root.dataset.affinoTreeviewState = "idle"
    root.dataset.affinoTreeviewSelected = ""
    root.dataset.affinoTreeviewActive = ""
    return
  }

  const nodes: TreeviewNode<string>[] = models.map((model) => ({
    value: model.value,
    parent: model.parent,
    disabled: model.disabled,
  }))
  const defaultSelected = root.dataset.affinoTreeviewDefaultSelected ?? null
  const defaultActive = resolveDefaultActive(
    root.dataset.affinoTreeviewDefaultActive ?? null,
    defaultSelected,
    models,
  )
  const core = new TreeviewCore<string>({
    nodes,
    defaultExpanded: parseCsv(root.dataset.affinoTreeviewDefaultExpanded),
    defaultSelected,
    defaultActive,
    loop: readBoolean(root.dataset.affinoTreeviewLoop, false),
  })

  root.setAttribute("role", "tree")

  const renderStatic = () => {
    models.forEach((model, index) => {
      if (!model.element.id) {
        model.element.id = `${uid}-item-${index + 1}`
      }

      model.element.setAttribute("role", "treeitem")
      model.element.setAttribute("aria-level", String(model.level))
      model.element.setAttribute("aria-setsize", String(model.siblingCount))
      model.element.setAttribute("aria-posinset", String(model.siblingIndex + 1))
      model.element.setAttribute("aria-disabled", model.disabled ? "true" : "false")
      model.element.dataset.affinoTreeviewLevel = String(model.level)
      model.element.dataset.affinoTreeviewLast =
        model.siblingIndex === model.siblingCount - 1 ? "true" : "false"
      model.element.style.setProperty("--affino-tree-level", String(model.level))
      syncGuideLayer(model, byValue)

      if (!model.children.length) {
        model.element.removeAttribute("aria-expanded")
        delete model.element.dataset.affinoTreeviewExpanded
      }
    })
  }

  let cachedExpanded: string[] | null = null
  let cachedVisibleSet = new Set<string>()

  const getVisibleSet = (state: TreeviewSnapshot<string>): Set<string> => {
    if (cachedExpanded && arrayEquals(cachedExpanded, state.expanded)) {
      return cachedVisibleSet
    }
    cachedExpanded = [...state.expanded]
    cachedVisibleSet = new Set(core.getVisibleValues())
    return cachedVisibleSet
  }

  const renderState = (state: TreeviewSnapshot<string>) => {
    const visibleSet = getVisibleSet(state)
    let activeElementId: string | null = null

    root.dataset.affinoTreeviewState = state.selected ? "selected" : "idle"
    root.dataset.affinoTreeviewSelected = state.selected ?? ""
    root.dataset.affinoTreeviewActive = state.active ?? ""

    models.forEach((model) => {
      const visible = visibleSet.has(model.value)
      const selected = state.selected === model.value
      const active = state.active === model.value
      const hasChildren = model.children.length > 0

      model.element.hidden = !visible
      model.element.setAttribute("aria-selected", selected ? "true" : "false")
      model.element.dataset.state = selected ? "selected" : "idle"
      model.element.tabIndex = active && visible && !model.disabled ? 0 : -1

      if (hasChildren) {
        const expanded = state.expanded.includes(model.value)
        model.element.setAttribute("aria-expanded", expanded ? "true" : "false")
        model.element.dataset.affinoTreeviewExpanded = expanded ? "true" : "false"
        const toggle = model.element.querySelector<HTMLElement>(TREEVIEW_TOGGLE_SELECTOR)
        if (toggle) {
          toggle.dataset.state = expanded ? "expanded" : "collapsed"
        }
      } else {
        model.element.removeAttribute("aria-expanded")
        delete model.element.dataset.affinoTreeviewExpanded
      }

      if (active && visible) {
        activeElementId = model.element.id
      }
    })

    if (activeElementId) {
      root.setAttribute("aria-activedescendant", activeElementId)
    } else {
      root.removeAttribute("aria-activedescendant")
    }
  }

  const focusActiveTreeItem = (): void => {
    const active = core.getSnapshot().active
    if (!active) {
      return
    }
    const activeModel = byValue.get(active)
    if (!activeModel || activeModel.disabled || activeModel.element.hidden) {
      return
    }
    const activeElement = activeModel.element.ownerDocument.activeElement
    if (activeElement === activeModel.element) {
      return
    }
    try {
      activeModel.element.focus({ preventScroll: true })
    } catch {
      activeModel.element.focus()
    }
  }

  renderStatic()
  const subscription = core.subscribe(renderState)
  const detachments: Cleanup[] = []

  models.forEach((model) => {
    const onClick = (event: MouseEvent) => {
      if (model.disabled) {
        return
      }
      const target = event.target
      const toggleTarget = target instanceof Element ? target.closest<HTMLElement>(TREEVIEW_TOGGLE_SELECTOR) : null
      if (toggleTarget && model.children.length > 0) {
        event.preventDefault()
        core.toggle(model.value)
        core.focus(model.value)
        focusActiveTreeItem()
        return
      }
      core.select(model.value)
      focusActiveTreeItem()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (model.disabled) {
        return
      }

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault()
          core.focusNext()
          focusActiveTreeItem()
          break
        case "ArrowUp":
          event.preventDefault()
          core.focusPrevious()
          focusActiveTreeItem()
          break
        case "Home":
          event.preventDefault()
          core.focusFirst()
          focusActiveTreeItem()
          break
        case "End":
          event.preventDefault()
          core.focusLast()
          focusActiveTreeItem()
          break
        case "Enter":
        case " ":
          event.preventDefault()
          core.select(model.value)
          focusActiveTreeItem()
          break
        case "ArrowRight": {
          if (!model.children.length) {
            return
          }
          event.preventDefault()
          if (!core.isExpanded(model.value)) {
            core.expand(model.value)
            focusActiveTreeItem()
            return
          }
          const nextChild = model.children.find((value) => !byValue.get(value)?.disabled)
          if (nextChild) {
            core.focus(nextChild)
            focusActiveTreeItem()
          }
          break
        }
        case "ArrowLeft":
          if (!model.children.length && model.parent === null) {
            return
          }
          event.preventDefault()
          if (model.children.length > 0 && core.isExpanded(model.value)) {
            core.collapse(model.value)
            focusActiveTreeItem()
            return
          }
          if (model.parent) {
            core.focus(model.parent)
            focusActiveTreeItem()
          }
          break
      }
    }

    model.element.addEventListener("click", onClick)
    model.element.addEventListener("keydown", onKeyDown)
    detachments.push(() => {
      model.element.removeEventListener("click", onClick)
      model.element.removeEventListener("keydown", onKeyDown)
    })
  })

  const handle: TreeviewHandle = {
    select: (value) => {
      core.select(value)
      focusActiveTreeItem()
    },
    clearSelection: () => core.clearSelection(),
    focus: (value) => {
      core.focus(value)
      focusActiveTreeItem()
    },
    focusFirst: () => {
      core.focusFirst()
      focusActiveTreeItem()
    },
    focusLast: () => {
      core.focusLast()
      focusActiveTreeItem()
    },
    focusNext: () => {
      core.focusNext()
      focusActiveTreeItem()
    },
    focusPrevious: () => {
      core.focusPrevious()
      focusActiveTreeItem()
    },
    expand: (value) => core.expand(value),
    collapse: (value) => core.collapse(value),
    toggle: (value) => core.toggle(value),
    getSnapshot: () => core.getSnapshot(),
  }

  root.affinoTreeview = handle
  registry.set(root, () => {
    detachments.forEach((cleanup) => cleanup())
    subscription.unsubscribe()
    core.destroy()
    if (root.affinoTreeview === handle) {
      delete root.affinoTreeview
    }
    registry.delete(root)
    structureRegistry.delete(root)
  })
  structureRegistry.set(root, structure)
}

function collectTreeviewStructure(root: RootEl): TreeviewStructure | null {
  const items = Array.from(root.querySelectorAll<ItemEl>(TREEVIEW_ITEM_SELECTOR))
  if (!items.length) {
    return null
  }
  return { items }
}

function resolveModels(items: ItemEl[]): {
  models: TreeviewItemModel[]
  byValue: Map<string, TreeviewItemModel>
} {
  const models: TreeviewItemModel[] = []
  const byValue = new Map<string, TreeviewItemModel>()

  items.forEach((element, index) => {
    const rawValue = element.dataset.affinoTreeviewValue?.trim()
    const value = rawValue && rawValue.length > 0 ? rawValue : `node-${index + 1}`
    if (byValue.has(value)) {
      return
    }
    const rawParent = element.dataset.affinoTreeviewParent?.trim() ?? null
    const model: TreeviewItemModel = {
      element,
      value,
      parent: rawParent && rawParent.length > 0 ? rawParent : null,
      disabled: element.dataset.affinoTreeviewDisabled === "true",
      children: [],
      level: 1,
      siblingIndex: 0,
      siblingCount: 1,
    }
    models.push(model)
    byValue.set(value, model)
  })

  models.forEach((model) => {
    if (model.parent === null) {
      return
    }
    if (model.parent === model.value || !byValue.has(model.parent)) {
      model.parent = null
      return
    }
    byValue.get(model.parent)?.children.push(model.value)
  })

  const siblingsByParent = new Map<string | null, TreeviewItemModel[]>()
  models.forEach((model) => {
    const siblings = siblingsByParent.get(model.parent) ?? []
    siblings.push(model)
    siblingsByParent.set(model.parent, siblings)
  })

  siblingsByParent.forEach((siblings) => {
    siblings.forEach((model, index) => {
      model.siblingIndex = index
      model.siblingCount = siblings.length
    })
  })

  models.forEach((model) => {
    model.level = resolveLevel(model, byValue)
  })

  return { models, byValue }
}

function resolveLevel(
  model: TreeviewItemModel,
  byValue: ReadonlyMap<string, TreeviewItemModel>,
): number {
  let level = 1
  let cursor = model.parent
  const visited = new Set<string>()
  while (cursor !== null) {
    if (visited.has(cursor)) {
      break
    }
    visited.add(cursor)
    const parent = byValue.get(cursor)
    if (!parent) {
      break
    }
    level += 1
    cursor = parent.parent
  }
  return level
}

function resolveDefaultActive(
  explicitActive: string | null,
  defaultSelected: string | null,
  models: TreeviewItemModel[],
): string | null {
  const byValue = new Set(models.map((model) => model.value))
  if (explicitActive && byValue.has(explicitActive)) {
    return explicitActive
  }
  if (defaultSelected && byValue.has(defaultSelected)) {
    return defaultSelected
  }
  return models[0]?.value ?? null
}

function ensureTreeviewUid(root: RootEl): string {
  const existing = root.dataset.affinoTreeviewUid
  if (existing) {
    return existing
  }
  treeviewUidCounter += 1
  const uid = `affino-treeview-${treeviewUidCounter}`
  root.dataset.affinoTreeviewUid = uid
  return uid
}

function scan(node: ParentNode): void {
  if (node instanceof HTMLElement && node.matches(TREEVIEW_ROOT_SELECTOR)) {
    maybeHydrateTreeview(node as RootEl)
  }
  node.querySelectorAll<RootEl>(TREEVIEW_ROOT_SELECTOR).forEach((root) => {
    maybeHydrateTreeview(root)
  })
}

function maybeHydrateTreeview(root: RootEl): void {
  const nextStructure = collectTreeviewStructure(root)
  if (!nextStructure) {
    registry.get(root)?.()
    structureRegistry.delete(root)
    return
  }
  const previousStructure = structureRegistry.get(root)
  if (
    previousStructure &&
    registry.has(root) &&
    isSameStructure(previousStructure, nextStructure)
  ) {
    return
  }
  hydrateResolvedTreeview(root, nextStructure)
}

function isSameStructure(previous: TreeviewStructure, next: TreeviewStructure): boolean {
  if (previous.items.length !== next.items.length) {
    return false
  }
  for (let index = 0; index < previous.items.length; index += 1) {
    if (previous.items[index] !== next.items[index]) {
      return false
    }
  }
  return true
}

function setupMutationObserver(): void {
  if (typeof window === "undefined") {
    return
  }
  const scope = window as unknown as Record<string, unknown>
  const key = "__affinoTreeviewObserver"
  if (scope[key]) {
    return
  }
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement || node instanceof DocumentFragment) {
          if (hasTreeviewRoot(node)) {
            scheduleScan(node)
          }
        }
      })
      mutation.removedNodes.forEach((node) => {
        scheduleRemovedCleanup(node)
      })
    })
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
  scope[key] = observer
}

function hasTreeviewRoot(scope: ParentNode): boolean {
  if (scope instanceof Element && scope.matches(TREEVIEW_ROOT_SELECTOR)) {
    return true
  }
  return scope.querySelector(TREEVIEW_ROOT_SELECTOR) !== null
}

function scheduleScan(scope: ParentNode): void {
  pendingScanScopes.add(scope)
  if (scanFlushScheduled) {
    return
  }
  scanFlushScheduled = true
  enqueueMicrotask(flushPendingScans)
}

function flushPendingScans(): void {
  scanFlushScheduled = false
  const scopes = Array.from(pendingScanScopes)
  pendingScanScopes.clear()
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

function scheduleRemovedCleanup(node: Node): void {
  const roots = collectTreeviewRoots(node)
  if (!roots.length) {
    return
  }
  roots.forEach((root) => pendingRemovedRoots.add(root))
  if (removedCleanupScheduled) {
    return
  }
  removedCleanupScheduled = true
  enqueueMicrotask(flushRemovedRoots)
}

function flushRemovedRoots(): void {
  removedCleanupScheduled = false
  const roots = Array.from(pendingRemovedRoots)
  pendingRemovedRoots.clear()
  roots.forEach((root) => {
    if (!root.isConnected) {
      registry.get(root)?.()
      structureRegistry.delete(root)
    }
  })
}

function collectTreeviewRoots(node: Node): RootEl[] {
  const roots: RootEl[] = []
  if (node instanceof HTMLElement && node.matches(TREEVIEW_ROOT_SELECTOR)) {
    roots.push(node as RootEl)
  }
  if (node instanceof HTMLElement || node instanceof DocumentFragment) {
    node.querySelectorAll<RootEl>(TREEVIEW_ROOT_SELECTOR).forEach((root) => roots.push(root))
  }
  return roots
}

function enqueueMicrotask(task: () => void): void {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(task)
    return
  }
  Promise.resolve().then(task)
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === "true") {
    return true
  }
  if (value === "false") {
    return false
  }
  return fallback
}

function parseCsv(value: string | undefined): string[] {
  if (!value) {
    return []
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

function syncGuideLayer(
  model: TreeviewItemModel,
  byValue: ReadonlyMap<string, TreeviewItemModel>,
): void {
  let guides = model.element.querySelector<HTMLElement>(TREEVIEW_GUIDES_SELECTOR)
  if (!guides) {
    guides = model.element.ownerDocument.createElement("span")
    guides.className = "treeview-node__guides"
    guides.setAttribute("data-affino-treeview-guides", "")
    guides.setAttribute("aria-hidden", "true")
    model.element.prepend(guides)
  }
  guides.innerHTML = ""
  const guideFlags = getAncestorGuideFlags(model, byValue)
  guideFlags.forEach((draw, index) => {
    const guide = model.element.ownerDocument.createElement("span")
    guide.className = "treeview-node__guide"
    guide.dataset.draw = draw ? "true" : "false"
    guide.style.setProperty("--guide-index", String(index))
    guides.append(guide)
  })
}

function getAncestorGuideFlags(
  model: TreeviewItemModel,
  byValue: ReadonlyMap<string, TreeviewItemModel>,
): boolean[] {
  const flags: boolean[] = []
  let cursor = model.parent
  const visited = new Set<string>()
  while (cursor !== null) {
    if (visited.has(cursor)) {
      break
    }
    visited.add(cursor)
    const parent = byValue.get(cursor)
    if (!parent) {
      break
    }
    flags.unshift(parent.siblingIndex < parent.siblingCount - 1)
    cursor = parent.parent
  }
  return flags
}

function arrayEquals<Value>(left: ReadonlyArray<Value>, right: ReadonlyArray<Value>): boolean {
  if (left.length !== right.length) {
    return false
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false
    }
  }
  return true
}
