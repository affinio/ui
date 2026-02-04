export type KnownOverlayKind =
  | "dialog"
  | "popover"
  | "tooltip"
  | "combobox"
  | "menu"
  | "context-menu"
  | "listbox"
  | "surface"

export type OverlayKind = KnownOverlayKind | (string & {})

export type OverlayPhase = "idle" | "opening" | "open" | "closing" | "closed"

export type OverlayOpenReason = "programmatic" | "user" | "owner-open" | (string & {})
export type OverlayCloseReason =
  | "programmatic"
  | "pointer-outside"
  | "escape-key"
  | "owner-close"
  | "focus-loss"
  | (string & {})

export interface OverlayEntryInit {
  id: string
  kind: OverlayKind
  root?: HTMLElement | null
  ownerId?: string | null
  modal?: boolean
  trapsFocus?: boolean
  blocksPointerOutside?: boolean
  inertSiblings?: boolean
  returnFocus?: boolean
  priority?: number
  state?: OverlayPhase
  data?: Record<string, unknown>
}

export interface OverlayEntry {
  id: string
  kind: OverlayKind
  root: HTMLElement | null
  ownerId: string | null
  modal: boolean
  trapsFocus: boolean
  blocksPointerOutside: boolean
  inertSiblings: boolean
  returnFocus: boolean
  priority: number
  state: OverlayPhase
  data?: Record<string, unknown>
  createdAt: number
}

export type OverlayEntryPatch = Partial<Omit<OverlayEntry, "id" | "kind" | "createdAt">>

export type OverlayKernelEvent =
  | { type: "stack-changed"; stack: readonly OverlayEntry[] }
  | { type: "close-requested"; entry: OverlayEntry | null; reason: OverlayCloseReason }
  | { type: "open-requested"; entry: OverlayEntry | null; reason: OverlayOpenReason }

export type OverlayKernelEventType = OverlayKernelEvent["type"]
export type OverlayKernelListener<Event extends OverlayKernelEvent = OverlayKernelEvent> = (event: Event) => void

export interface OverlayRegistrationHandle {
  getEntry(): OverlayEntry
  update(patch: OverlayEntryPatch): void
  unregister(): void
}

export interface StickyDependentsOptions {
  reopenReason?: OverlayOpenReason
  filter?(entry: OverlayEntry): boolean
}

export interface StickyDependentsController {
  snapshot(): void
  restore(): void
  clear(): void
  getSnapshot(): readonly string[]
}

export interface OverlayManagerOptions {
  document?: Document | null
  clock?: () => number
}

export interface OverlayManager {
  readonly document: Document | null
  register(init: OverlayEntryInit): OverlayRegistrationHandle
  unregister(id: string): void
  update(id: string, patch: OverlayEntryPatch): void
  requestClose(id: string, reason: OverlayCloseReason): void
  requestOpen(id: string, reason: OverlayOpenReason): void
  isTopMost(id: string): boolean
  getEntry(id: string): OverlayEntry | null
  getStack(): readonly OverlayEntry[]
  on<Event extends OverlayKernelEvent>(type: Event["type"], listener: OverlayKernelListener<Event>): () => void
  onStackChanged(listener: OverlayKernelListener<{ type: "stack-changed"; stack: readonly OverlayEntry[] }>): () => void
  onCloseRequested(
    listener: OverlayKernelListener<{ type: "close-requested"; entry: OverlayEntry | null; reason: OverlayCloseReason }>,
  ): () => void
  onOpenRequested(
    listener: OverlayKernelListener<{ type: "open-requested"; entry: OverlayEntry | null; reason: OverlayOpenReason }>,
  ): () => void
}

const ACTIVE_PHASES = new Set<OverlayPhase>(["opening", "open", "closing"])

const DEFAULT_KIND_PRIORITIES: Record<KnownOverlayKind, number> = {
  dialog: 100,
  combobox: 80,
  menu: 70,
  "context-menu": 70,
  listbox: 60,
  popover: 40,
  tooltip: 10,
  surface: 5,
}

const DEFAULT_PRIORITY = 1

export class DefaultOverlayManager implements OverlayManager {
  readonly document: Document | null

  private readonly clock: () => number
  private readonly entries = new Map<string, OverlayEntry>()
  private readonly stack: OverlayEntry[] = []
  private readonly listeners = new Map<OverlayKernelEventType, Set<OverlayKernelListener>>()

  constructor(options: OverlayManagerOptions = {}) {
    this.document = options.document ?? null
    this.clock = options.clock ?? Date.now
  }

  register(init: OverlayEntryInit): OverlayRegistrationHandle {
    if (this.entries.has(init.id)) {
      throw new Error(`[OverlayManager] Duplicate overlay id: ${init.id}`)
    }
    const entry = this.createEntry(init)
    this.entries.set(entry.id, entry)
    const stackChanged = this.isActiveEntry(entry) ? this.activateEntry(entry) : false
    if (stackChanged) {
      this.emitStackChanged()
    }
    return {
      getEntry: () => this.requireEntry(entry.id),
      update: (patch) => this.update(entry.id, patch),
      unregister: () => this.unregister(entry.id),
    }
  }

  unregister(id: string): void {
    const entry = this.entries.get(id)
    if (!entry) {
      return
    }
    const descendants = this.getDescendants(entry)
    this.entries.delete(entry.id)
    descendants.forEach((descendant) => this.entries.delete(descendant.id))
    let stackChanged = this.deactivateEntry(entry)
    descendants.forEach((descendant) => {
      stackChanged = this.deactivateEntry(descendant) || stackChanged
    })
    if (stackChanged) {
      this.emitStackChanged()
    }
  }

  update(id: string, patch: OverlayEntryPatch): void {
    const entry = this.entries.get(id)
    if (!entry) {
      return
    }
    const previousState = entry.state
    const previousPriority = entry.priority
    const previousOwner = entry.ownerId

    const nextPriority =
      patch.priority !== undefined ? resolvePriority(entry.kind, patch.priority) : entry.priority

    Object.assign(entry, patch)
    entry.priority = nextPriority

    let stackChanged = false

    if (patch.ownerId !== undefined && entry.ownerId !== previousOwner) {
      if (!this.canActivate(entry)) {
        stackChanged = this.deactivateEntry(entry) || stackChanged
      } else if (this.isActiveEntry(entry)) {
        stackChanged = this.activateEntry(entry) || stackChanged
      }
    }

    if (patch.state !== undefined && patch.state !== previousState) {
      if (this.isActiveEntry(entry)) {
        stackChanged = this.activateEntry(entry) || stackChanged
      } else {
        stackChanged = this.deactivateEntry(entry) || stackChanged
      }
    } else if (patch.priority !== undefined && patch.priority !== previousPriority && this.stack.includes(entry)) {
      this.resortStack()
      stackChanged = true
    }

    if (stackChanged) {
      this.emitStackChanged()
    }
  }

  requestClose(id: string, reason: OverlayCloseReason): void {
    const entry = this.entries.get(id)
    if (!entry) {
      this.emit({ type: "close-requested", entry: null, reason })
      return
    }
    if (!this.canClose(entry, reason)) {
      return
    }
    const descendants = this.getDescendants(entry)
    if (descendants.length) {
      const subtreeIds = new Set<string>([entry.id, ...descendants.map((descendant) => descendant.id)])
      for (let index = this.stack.length - 1; index >= 0; index -= 1) {
        const candidate = this.stack[index]
        if (!candidate || candidate.id === entry.id) {
          continue
        }
        if (subtreeIds.has(candidate.id)) {
          this.emit({ type: "close-requested", entry: candidate, reason: "owner-close" })
        }
      }
    }
    this.emit({ type: "close-requested", entry, reason })
  }

  requestOpen(id: string, reason: OverlayOpenReason): void {
    const entry = this.entries.get(id)
    if (!entry) {
      this.emit({ type: "open-requested", entry: null, reason })
      return
    }
    if (!this.canOpen(entry, reason)) {
      return
    }
    this.emit({ type: "open-requested", entry, reason })
  }

  isTopMost(id: string): boolean {
    const top = this.resolveTopMost()
    return top?.id === id
  }

  getEntry(id: string): OverlayEntry | null {
    return this.entries.get(id) ?? null
  }

  getStack(): readonly OverlayEntry[] {
    return [...this.stack]
  }

  on<Event extends OverlayKernelEvent>(type: Event["type"], listener: OverlayKernelListener<Event>): () => void {
    const bucket = this.listeners.get(type) ?? new Set<OverlayKernelListener>()
    bucket.add(listener as OverlayKernelListener)
    this.listeners.set(type, bucket)
    return () => {
      bucket.delete(listener as OverlayKernelListener)
      if (!bucket.size) {
        this.listeners.delete(type)
      }
    }
  }

  onStackChanged(listener: OverlayKernelListener<{ type: "stack-changed"; stack: readonly OverlayEntry[] }>): () => void {
    return this.on("stack-changed", listener)
  }

  onCloseRequested(
    listener: OverlayKernelListener<{ type: "close-requested"; entry: OverlayEntry | null; reason: OverlayCloseReason }>,
  ): () => void {
    return this.on("close-requested", listener)
  }

  onOpenRequested(
    listener: OverlayKernelListener<{ type: "open-requested"; entry: OverlayEntry | null; reason: OverlayOpenReason }>,
  ): () => void {
    return this.on("open-requested", listener)
  }

  private createEntry(init: OverlayEntryInit): OverlayEntry {
    return {
      id: init.id,
      kind: init.kind,
      root: init.root ?? null,
      ownerId: init.ownerId ?? null,
      modal: init.modal ?? false,
      trapsFocus: init.trapsFocus ?? false,
      blocksPointerOutside: init.blocksPointerOutside ?? Boolean(init.modal),
      inertSiblings: init.inertSiblings ?? false,
      returnFocus: init.returnFocus ?? true,
      priority: resolvePriority(init.kind, init.priority),
      state: init.state ?? "idle",
      data: init.data,
      createdAt: this.clock(),
    }
  }

  private activateEntry(entry: OverlayEntry): boolean {
    if (this.stack.includes(entry)) {
      return false
    }
    if (!this.canActivate(entry)) {
      return false
    }
    this.stack.push(entry)
    this.resortStack()
    this.activateDependents(entry)
    return true
  }

  private deactivateEntry(entry: OverlayEntry): boolean {
    let changed = false
    for (let index = this.stack.length - 1; index >= 0; index -= 1) {
      const candidate = this.stack[index]
      if (!candidate) {
        continue
      }
      if (candidate === entry || this.isAncestor(entry, candidate)) {
        this.stack.splice(index, 1)
        changed = true
      }
    }
    return changed
  }

  private canActivate(entry: OverlayEntry): boolean {
    if (!entry.ownerId) {
      return true
    }
    const owner = this.entries.get(entry.ownerId)
    return Boolean(owner && this.isActiveEntry(owner))
  }

  private canClose(entry: OverlayEntry, _reason: OverlayCloseReason): boolean {
    return this.isActiveEntry(entry)
  }

  private canOpen(entry: OverlayEntry, _reason: OverlayOpenReason): boolean {
    return this.canActivate(entry)
  }

  private isActiveEntry(entry: OverlayEntry): boolean {
    return isActivePhase(entry.state)
  }

  private resolveTopMost(): OverlayEntry | null {
    for (let index = this.stack.length - 1; index >= 0; index -= 1) {
      const entry = this.stack[index]
      if (!entry) {
        continue
      }
      if (!this.isActiveEntry(entry)) {
        continue
      }
      if (!this.canActivate(entry)) {
        continue
      }
      return entry
    }
    return null
  }

  private resortStack(): void {
    this.stack.sort((a, b) => this.compareEntries(a, b))
  }

  private compareEntries(a: OverlayEntry, b: OverlayEntry): number {
    if (a.id === b.id) {
      return 0
    }
    if (this.isAncestor(a, b)) {
      return -1
    }
    if (this.isAncestor(b, a)) {
      return 1
    }
    if (a.priority === b.priority) {
      return a.createdAt - b.createdAt
    }
    return a.priority - b.priority
  }

  private isAncestor(potentialAncestor: OverlayEntry, candidate: OverlayEntry): boolean {
    if (potentialAncestor.id === candidate.id) {
      return false
    }
    let cursor = candidate.ownerId ? this.entries.get(candidate.ownerId) ?? null : null
    while (cursor) {
      if (cursor.id === potentialAncestor.id) {
        return true
      }
      cursor = cursor.ownerId ? this.entries.get(cursor.ownerId) ?? null : null
    }
    return false
  }

  private getDescendants(entry: OverlayEntry): OverlayEntry[] {
    const result: OverlayEntry[] = []
    this.entries.forEach((candidate) => {
      if (candidate.id !== entry.id && this.isAncestor(entry, candidate)) {
        result.push(candidate)
      }
    })
    return result
  }

  private activateDependents(entry: OverlayEntry): void {
    this.entries.forEach((candidate) => {
      if (candidate.ownerId === entry.id && this.isActiveEntry(candidate)) {
        this.activateEntry(candidate)
      }
    })
  }

  private emitStackChanged(): void {
    const clonedStack = this.getStack().map((entry) => this.cloneEntry(entry))
    this.emit({ type: "stack-changed", stack: clonedStack })
  }

  private emit(event: OverlayKernelEvent): void {
    const listeners = this.listeners.get(event.type)
    if (!listeners?.size) {
      return
    }
    listeners.forEach((listener) => {
      listener(event)
    })
  }

  private cloneEntry(entry: OverlayEntry): OverlayEntry {
    return { ...entry }
  }

  private requireEntry(id: string): OverlayEntry {
    const entry = this.entries.get(id)
    if (!entry) {
      throw new Error(`[OverlayManager] Overlay not registered: ${id}`)
    }
    return entry
  }
}

const documentManagers = typeof WeakMap !== "undefined" ? new WeakMap<Document, OverlayManager>() : null

export function createOverlayManager(options?: OverlayManagerOptions): OverlayManager {
  return new DefaultOverlayManager(options)
}

export function getDocumentOverlayManager(doc?: Document | null): OverlayManager {
  if (!doc || !documentManagers) {
    return createOverlayManager()
  }
  const cached = documentManagers.get(doc)
  if (cached) {
    return cached
  }
  const manager = new DefaultOverlayManager({ document: doc })
  documentManagers.set(doc, manager)
  return manager
}

export function createStickyDependentsController(
  manager: OverlayManager,
  ownerId: string,
  options: StickyDependentsOptions = {},
): StickyDependentsController {
  const reopenReason = options.reopenReason ?? "owner-open"
  let snapshot: string[] = []

  function collectSnapshot(): string[] {
    return collectActiveDependents(manager, ownerId, options.filter).map((entry) => entry.id)
  }

  return {
    snapshot() {
      snapshot = collectSnapshot()
    },
    restore() {
      snapshot.forEach((dependentId) => {
        manager.requestOpen(dependentId, reopenReason)
      })
    },
    clear() {
      snapshot = []
    },
    getSnapshot() {
      return [...snapshot]
    },
  }
}

function resolvePriority(kind: OverlayKind, requested?: number): number {
  if (typeof requested === "number" && Number.isFinite(requested)) {
    return requested
  }
  const preset = (DEFAULT_KIND_PRIORITIES as Record<string, number>)[kind]
  return typeof preset === "number" ? preset : DEFAULT_PRIORITY
}

function isActivePhase(phase: OverlayPhase): boolean {
  return ACTIVE_PHASES.has(phase)
}

function collectActiveDependents(
  manager: OverlayManager,
  ownerId: string,
  filter?: (entry: OverlayEntry) => boolean,
): OverlayEntry[] {
  const stack = manager.getStack()
  return stack.filter((entry) => {
    if (entry.id === ownerId) {
      return false
    }
    if (!isActivePhase(entry.state)) {
      return false
    }
    if (!isDescendantOf(manager, ownerId, entry)) {
      return false
    }
    return filter ? Boolean(filter(entry)) : true
  })
}

function isDescendantOf(manager: OverlayManager, ownerId: string, candidate: OverlayEntry): boolean {
  let cursor: OverlayEntry | null = candidate
  while (cursor?.ownerId) {
    if (cursor.ownerId === ownerId) {
      return true
    }
    cursor = manager.getEntry(cursor.ownerId)
  }
  return false
}
