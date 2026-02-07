import {
  activateListboxIndex,
  createListboxState,
  moveListboxFocus,
  toggleActiveListboxOption,
  type ListboxContext,
  type ListboxState,
} from "@affino/listbox-core"
import {
  bindLivewireHooks,
  createOverlayIntegration,
  ensureDocumentObserver,
  getDocumentOverlayManager,
  type OverlayManager,
  type OverlayCloseReason,
  type OverlayKind,
} from "@affino/overlay-kernel"

export type ListboxMode = "single" | "multiple"

export type ListboxSnapshot = {
  open: boolean
  state: ListboxState
  values: string[]
}

type ListboxHandle = {
  open(): void
  close(): void
  toggle(): void
  selectIndex(index: number, options?: { extend?: boolean; toggle?: boolean }): void
  selectValue(value: string): void
  getSnapshot(): ListboxSnapshot
}

type CloseListboxOptions = {
  restoreFocus?: boolean
}

type RootEl = HTMLElement & {
  dataset: DOMStringMap & {
    affinoListboxRoot?: string
    affinoListboxMode?: string
    affinoListboxLoop?: string
    affinoListboxDisabled?: string
    affinoListboxPlaceholder?: string
    affinoListboxModel?: string
    affinoListboxState?: string
    affinoListboxOverlayKind?: OverlayKind
  }
  affinoListbox?: ListboxHandle
}

type OptionEl = HTMLElement & {
  dataset: DOMStringMap & {
    affinoListboxValue?: string
    affinoListboxLabel?: string
    affinoListboxDisabled?: string
    affinoListboxOptionSelected?: string
    affinoListboxOptionIndex?: string
  }
}

type Cleanup = () => void

type OptionSnapshot = {
  index: number
  value: string
  label: string
}

const LISTBOX_ROOT_SELECTOR = "[data-affino-listbox-root]"
const registry = new WeakMap<RootEl, Cleanup>()
const structureRegistry = new WeakMap<RootEl, { trigger: HTMLElement; surface: HTMLElement; optionCount: number }>()
const openStateRegistry = new Map<string, boolean>()
const overlayOwnersByDocument = new WeakMap<Document, Map<string, RootEl>>()
const pendingScanScopes = new Set<ParentNode>()
const pendingRemovedRoots = new Set<RootEl>()
let scanFlushScheduled = false
let removedCleanupScheduled = false

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

export function bootstrapAffinoListboxes(): void {
  if (typeof document === "undefined") {
    return
  }
  scan(document)
  setupMutationObserver()
  setupLivewireHooks()
}

export function hydrateListbox(root: RootEl): void {
  const trigger = root.querySelector<HTMLElement>("[data-affino-listbox-trigger]")
  const surface = root.querySelector<HTMLElement>("[data-affino-listbox-surface]")
  if (!trigger || !surface) {
    registry.get(root)?.()
    structureRegistry.delete(root)
    root.dataset.affinoListboxState = "closed"
    return
  }

  hydrateResolvedListbox(root, trigger, surface)
}

function hydrateResolvedListbox(root: RootEl, trigger: HTMLElement, surface: HTMLElement): void {
  const teardown = registry.get(root)
  teardown?.()

  const detachments: Cleanup[] = []
  let options = collectOptions(surface)
  const valueToIndex = new Map<string, number>()
  let context: ListboxContext = {
    optionCount: options.length,
    isDisabled: (index) => options[index]?.dataset.affinoListboxDisabled === "true",
  }

  const mode = resolveMode(root.dataset.affinoListboxMode)
  const loop = readBoolean(root.dataset.affinoListboxLoop, true)
  const placeholder = root.dataset.affinoListboxPlaceholder ?? "Select"
  const disabled = readBoolean(root.dataset.affinoListboxDisabled, false)
  const triggerControl = resolveTriggerControl(trigger)
  const triggerLabelEl = trigger.querySelector<HTMLElement>("[data-affino-listbox-display]")
  const hiddenInput = root.querySelector<HTMLInputElement>("[data-affino-listbox-input]")

  const rootId = root.dataset.affinoListboxRoot ?? ""
  const persistenceKey = rootId
  let state = primeStateFromDom(options, context)
  let open = readBoolean(root.dataset.affinoListboxState, false)
  if (persistenceKey) {
    const persistedOpen = openStateRegistry.get(persistenceKey)
    if (typeof persistedOpen === "boolean") {
      open = persistedOpen
    }
  }
  let outsideCleanup: Cleanup | null = null
  let livewireSyncCache: string | null = null
  let pendingStructureRehydrate = false

  surface.hidden = !open
  applyTriggerAria(triggerControl, surface, open, mode, disabled)
  const overlayId = rootId || surface.dataset.affinoListboxSurface || surface.id || generateListboxOverlayId()
  const ownerDocument = root.ownerDocument ?? document
  const staleRoot = claimOverlayOwner(ownerDocument, overlayId, root)
  if (staleRoot) {
    registry.get(staleRoot)?.()
  }
  const overlayKind = (root.dataset.affinoListboxOverlayKind as OverlayKind) ?? "listbox"
  const overlayIntegration = createOverlayIntegration({
    id: overlayId,
    kind: overlayKind,
    overlayManager: resolveSharedOverlayManager(ownerDocument),
    traits: {
      root: surface,
      returnFocus: true,
    },
    initialState: open ? "open" : "closed",
    releaseOnIdle: false,
    onCloseRequested: (reason) => handleKernelClose(reason),
  })
  const syncOverlayState = () => overlayIntegration.syncState(open ? "open" : "closed")
  const requestKernelClose = (reason: OverlayCloseReason, options?: CloseListboxOptions) => {
    if (overlayIntegration.requestClose(reason)) {
      return
    }
    handleKernelClose(reason, options)
  }
  syncOverlayState()
  syncSelectionAttributes()
  pushSelectionChanges({ silent: true })
  if (open) {
    attachOutsideGuards()
    requestAnimationFrame(() => focusActiveOption())
  }

  const openListbox = () => {
    if (open || disabled) {
      return
    }
    open = true
    rememberOpenState(true)
    root.dataset.affinoListboxState = "open"
    surface.hidden = false
    applyTriggerAria(triggerControl, surface, true, mode, disabled)
    syncOverlayState()
    attachOutsideGuards()
    requestAnimationFrame(() => focusActiveOption())
  }

  const closeListbox = (options: CloseListboxOptions = {}) => {
    const restoreFocus = options.restoreFocus === true
    if (!open) {
      if (restoreFocus) {
        focusTriggerControl()
      }
      return
    }
    moveFocusAwayFromSurface(restoreFocus)
    open = false
    rememberOpenState(false)
    root.dataset.affinoListboxState = "closed"
    surface.hidden = true
    applyTriggerAria(triggerControl, surface, false, mode, disabled)
    syncOverlayState()
    detachOutsideGuards()
    if (restoreFocus) {
      focusTriggerControl()
    }
  }

  const focusTriggerControl = () => {
    if (!triggerControl.isConnected) {
      return false
    }
    try {
      triggerControl.focus({ preventScroll: true })
    } catch {
      return false
    }
    const activeElement = ownerDocument.activeElement
    return activeElement === triggerControl || (activeElement instanceof Node && triggerControl.contains(activeElement))
  }

  const moveFocusAwayFromSurface = (restoreToTrigger: boolean) => {
    const activeElement = ownerDocument.activeElement
    if (!(activeElement instanceof HTMLElement) || !surface.contains(activeElement)) {
      return
    }
    if (restoreToTrigger && !disabled && focusTriggerControl()) {
      return
    }
    activeElement.blur()
  }

  function handleKernelClose(reason: OverlayCloseReason, options?: CloseListboxOptions) {
    const restoreFocus = options?.restoreFocus ?? (reason === "escape-key")
    closeListbox({ restoreFocus })
  }

  const toggleListbox = () => {
    if (open) {
      closeListbox({ restoreFocus: true })
    } else {
      openListbox()
    }
  }

  const selectIndex = (index: number, options?: { extend?: boolean; toggle?: boolean }) => {
    const toggle = mode === "multiple" && (options?.toggle ?? false)
    const extend = mode === "multiple" && (options?.extend ?? false)
    const next = activateListboxIndex({
      state,
      context,
      index,
      toggle,
      extend,
    })
    applyState(next)
    if (mode === "single") {
      closeListbox({ restoreFocus: true })
    }
  }

  const moveActiveIndex = (delta: number, options?: { extend?: boolean }) => {
    const shouldExtendSelection = mode === "multiple" && (options?.extend ?? false)

    const next = moveListboxFocus({
      state,
      context,
      delta,
      extend: shouldExtendSelection,
      loop,
    })

    if (next.activeIndex === state.activeIndex) {
      return
    }

    // Keyboard navigation should move active option without committing selection.
    // Selection is committed explicitly via Enter/Space/click (or shift-extend in multiple mode).
    if (!shouldExtendSelection) {
      applyState({
        selection: state.selection,
        activeIndex: next.activeIndex,
      })
      return
    }

    applyState(next)
  }

  const toggleActive = () => {
    if (mode !== "multiple") {
      return
    }
    const next = toggleActiveListboxOption({ state })
    applyState(next)
  }

  const handleTriggerClick = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    if (disabled) {
      return
    }
    toggleListbox()
  }
  trigger.addEventListener("click", handleTriggerClick)
  detachments.push(() => trigger.removeEventListener("click", handleTriggerClick))

  const handleTriggerKeydown = (event: KeyboardEvent) => {
    if (disabled) {
      return
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault()
        if (!open) {
          openListbox()
        }
        moveActiveIndex(event.altKey ? Infinity : 1, { extend: event.shiftKey })
        break
      case "ArrowUp":
        event.preventDefault()
        if (!open) {
          openListbox()
        }
        moveActiveIndex(event.altKey ? -Infinity : -1, { extend: event.shiftKey })
        break
      case "Enter":
      case " ":
        event.preventDefault()
        if (!open) {
          openListbox()
        } else if (state.activeIndex >= 0) {
          selectIndex(state.activeIndex, {
            extend: mode === "multiple" && event.shiftKey,
            toggle: mode === "multiple" && (event.metaKey || event.ctrlKey),
          })
        }
        break
      case "Home":
        event.preventDefault()
        moveActiveIndex(-Infinity, { extend: event.shiftKey })
        if (!open) {
          openListbox()
        }
        break
      case "End":
        event.preventDefault()
        moveActiveIndex(Infinity, { extend: event.shiftKey })
        if (!open) {
          openListbox()
        }
        break
      case "Escape":
        if (open) {
          event.preventDefault()
          requestKernelClose("escape-key")
        }
        break
    }
  }
  trigger.addEventListener("keydown", handleTriggerKeydown)
  detachments.push(() => trigger.removeEventListener("keydown", handleTriggerKeydown))

  const handleSurfaceKeydown = (event: KeyboardEvent) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault()
        moveActiveIndex(event.altKey ? Infinity : 1, { extend: event.shiftKey })
        break
      case "ArrowUp":
        event.preventDefault()
        moveActiveIndex(event.altKey ? -Infinity : -1, { extend: event.shiftKey })
        break
      case "Home":
        event.preventDefault()
        moveActiveIndex(-Infinity, { extend: event.shiftKey })
        break
      case "End":
        event.preventDefault()
        moveActiveIndex(Infinity, { extend: event.shiftKey })
        break
      case "PageUp":
        event.preventDefault()
        moveActiveIndex(-5)
        break
      case "PageDown":
        event.preventDefault()
        moveActiveIndex(5)
        break
      case "Enter":
      case " ":
        event.preventDefault()
        if (state.activeIndex >= 0) {
          selectIndex(state.activeIndex, {
            extend: mode === "multiple" && event.shiftKey,
            toggle: mode === "multiple" && (event.metaKey || event.ctrlKey),
          })
        }
        break
      case "Escape":
        event.preventDefault()
        requestKernelClose("escape-key")
        break
      case "Tab":
        requestKernelClose("focus-loss", { restoreFocus: false })
        break
      case "a":
      case "A":
        if (mode === "multiple" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          selectAllOptions()
        }
        break
    }
  }
  surface.addEventListener("keydown", handleSurfaceKeydown)
  detachments.push(() => surface.removeEventListener("keydown", handleSurfaceKeydown))

  const handleSurfaceClick = (event: MouseEvent) => {
    const option = (event.target instanceof HTMLElement ? event.target.closest<OptionEl>("[data-affino-listbox-option]") : null)
    if (!option) {
      return
    }
    const index = resolveOptionIndex(option)
    if (index === -1) {
      return
    }
    // Prevent label default activation from re-triggering the listbox button click.
    event.preventDefault()
    const toggle = mode === "multiple" && (event.metaKey || event.ctrlKey)
    const extend = mode === "multiple" && event.shiftKey
    selectIndex(index, { toggle, extend })
  }
  surface.addEventListener("click", handleSurfaceClick)
  detachments.push(() => surface.removeEventListener("click", handleSurfaceClick))

  const handleSurfaceMouseDown = (event: MouseEvent) => {
    const option = (event.target instanceof HTMLElement ? event.target.closest<OptionEl>("[data-affino-listbox-option]") : null)
    if (!option) {
      return
    }
    // Prevent focus/label default activation from bouncing click back to the trigger.
    event.preventDefault()
  }
  surface.addEventListener("mousedown", handleSurfaceMouseDown)
  detachments.push(() => surface.removeEventListener("mousedown", handleSurfaceMouseDown))

  const handleSurfacePointerMove = (event: PointerEvent) => {
    const option = (event.target instanceof HTMLElement ? event.target.closest<OptionEl>("[data-affino-listbox-option]") : null)
    if (!option) {
      return
    }
    const index = resolveOptionIndex(option)
    if (index === -1 || index === state.activeIndex) {
      return
    }
    const next: ListboxState = {
      selection: state.selection,
      activeIndex: index,
    }
    applyState(next)
  }
  surface.addEventListener("pointermove", handleSurfacePointerMove)
  detachments.push(() => surface.removeEventListener("pointermove", handleSurfacePointerMove))

  const structureObserver = new MutationObserver(() => {
    if (pendingStructureRehydrate) {
      return
    }
    pendingStructureRehydrate = true
    Promise.resolve().then(() => {
      pendingStructureRehydrate = false
      if (!root.isConnected) {
        return
      }
      if (!shouldHydrateStructure()) {
        return
      }
      hydrateListbox(root)
    })
  })
  structureObserver.observe(root, { childList: true, subtree: true })
  detachments.push(() => structureObserver.disconnect())

  function shouldHydrateStructure(): boolean {
    const nextTrigger = root.querySelector<HTMLElement>("[data-affino-listbox-trigger]")
    const nextSurface = root.querySelector<HTMLElement>("[data-affino-listbox-surface]")
    if (!nextTrigger || !nextSurface) {
      return true
    }
    if (nextTrigger !== trigger || nextSurface !== surface) {
      return true
    }
    const nextOptionCount = nextSurface.querySelectorAll("[data-affino-listbox-option]").length
    return nextOptionCount !== options.length
  }

  function focusActiveOption() {
    if (!open || state.activeIndex < 0) {
      surface.focus({ preventScroll: true })
      return
    }
    const option = options[state.activeIndex]
    if (option) {
      option.focus({ preventScroll: true })
    } else {
      surface.focus({ preventScroll: true })
    }
  }

  function attachOutsideGuards() {
    if (outsideCleanup) {
      return
    }
    const onPointerDown = (event: Event) => {
      const target = event.target as Node | null
      if (root.contains(target as Node) || shouldIgnoreOutsideEvent(target)) {
        return
      }
      requestKernelClose("pointer-outside", { restoreFocus: false })
    }
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as Node | null
      if (root.contains(target as Node) || shouldIgnoreOutsideEvent(target)) {
        return
      }
      requestKernelClose("focus-loss", { restoreFocus: false })
    }
    ownerDocument.addEventListener("pointerdown", onPointerDown, true)
    ownerDocument.addEventListener("focusin", onFocusIn, true)
    outsideCleanup = () => {
      ownerDocument.removeEventListener("pointerdown", onPointerDown, true)
      ownerDocument.removeEventListener("focusin", onFocusIn, true)
      outsideCleanup = null
    }
  }

  function detachOutsideGuards() {
    outsideCleanup?.()
  }

  function rememberOpenState(value: boolean) {
    if (!persistenceKey) {
      return
    }
    if (value) {
      openStateRegistry.set(persistenceKey, true)
    } else {
      openStateRegistry.delete(persistenceKey)
    }
  }

  function shouldIgnoreOutsideEvent(target: EventTarget | null): boolean {
    if (!target || !(target instanceof Element)) {
      return false
    }
    const sticky = target instanceof Element ? target.closest<HTMLElement>("[data-affino-listbox-sticky]") : null
    if (!sticky) {
      return false
    }
    const attr = sticky.getAttribute("data-affino-listbox-sticky")?.trim()
    if (!attr) {
      return true
    }
    const candidates = attr
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
    if (candidates.length === 0) {
      return true
    }
    if (!rootId) {
      return false
    }
    return candidates.includes(rootId)
  }

  function selectAllOptions() {
    context = {
      optionCount: options.length,
      isDisabled: (index) => options[index]?.dataset.affinoListboxDisabled === "true",
    }
    let next = createListboxState()
    for (let index = 0; index < options.length; index += 1) {
      const option = options[index]
      if (!option || option.dataset.affinoListboxDisabled === "true") {
        continue
      }
      next = activateListboxIndex({
        state: next,
        context,
        index,
        toggle: true,
      })
    }
    applyState(next)
  }

  function applyState(next: ListboxState) {
    if (listboxStatesEqual(state, next)) {
      return
    }
    const selectionChanged = !linearSelectionsEqual(state.selection, next.selection)
    state = cloneListboxState(next)
    context = {
      optionCount: options.length,
      isDisabled: (index) => options[index]?.dataset.affinoListboxDisabled === "true",
    }
    syncSelectionAttributes()
    if (selectionChanged) {
      pushSelectionChanges()
    }
  }

  function syncSelectionAttributes() {
    valueToIndex.clear()
    const optionIdPrefix = surface.id || rootId || "affino-listbox"
    let activeOptionId: string | null = null
    options.forEach((option, index) => {
      option.tabIndex = -1
      option.setAttribute("role", "option")
      option.dataset.affinoListboxOptionIndex = String(index)
      if (!option.id) {
        option.id = `${optionIdPrefix}-option-${index + 1}`
      }
      const value = option.dataset.affinoListboxValue
      if (value !== undefined && !valueToIndex.has(value)) {
        valueToIndex.set(value, index)
      }
      const optionDisabled = option.dataset.affinoListboxDisabled === "true"
      option.setAttribute("aria-disabled", optionDisabled ? "true" : "false")
      const selected = isIndexSelected(state.selection, index)
      option.dataset.affinoListboxOptionSelected = selected ? "true" : "false"
      option.setAttribute("aria-selected", selected ? "true" : "false")
      if (selected) {
        option.dataset.state = "selected"
      } else {
        delete option.dataset.state
      }
      if (index === state.activeIndex) {
        option.dataset.active = "true"
        activeOptionId = option.id
      } else {
        delete option.dataset.active
      }
    })
    if (activeOptionId) {
      surface.setAttribute("aria-activedescendant", activeOptionId)
    } else {
      surface.removeAttribute("aria-activedescendant")
    }
    updateDisplay()
  }

  function updateDisplay() {
    if (!triggerLabelEl) {
      return
    }
    const selections = getSelectedOptionSnapshots()
    const text = selections.length
      ? selections.map((item) => item.label).join(mode === "multiple" ? ", " : "")
      : placeholder
    triggerLabelEl.textContent = text
    triggerLabelEl.dataset.placeholderVisible = selections.length ? "false" : "true"
  }

  function pushSelectionChanges(options?: { silent?: boolean }) {
    const selections = getSelectedOptionSnapshots()
    const values = selections.map((item) => item.value)
    const serialized = mode === "multiple" ? JSON.stringify(values) : values[0] ?? ""
    if (hiddenInput && hiddenInput.value !== serialized) {
      hiddenInput.value = serialized
      hiddenInput.dispatchEvent(new Event("input", { bubbles: true }))
      hiddenInput.dispatchEvent(new Event("change", { bubbles: true }))
    }
    const snapshotPayload = mode === "multiple" ? values : values[0] ?? null
    const serializedLivewire = JSON.stringify(snapshotPayload)
    const pendingLivewireSync = serializedLivewire !== livewireSyncCache
    livewireSyncCache = serializedLivewire
    if (pendingLivewireSync && !options?.silent) {
      syncLivewireModel(root, snapshotPayload)
    }
    if (!options?.silent) {
      root.dispatchEvent(
        new CustomEvent("affino-listbox:change", {
          detail: {
            values,
            indexes: selections.map((item) => item.index),
          },
          bubbles: true,
          composed: true,
        }),
      )
    }
  }

  function getSelectedOptionSnapshots(): OptionSnapshot[] {
    const indexes = expandSelection(state.selection)
    const snapshots: OptionSnapshot[] = []
    indexes.forEach((index) => {
      const option = options[index]
      if (!option) {
        return
      }
      snapshots.push({
        index,
        value: option.dataset.affinoListboxValue ?? String(index),
        label: option.dataset.affinoListboxLabel ?? option.textContent?.trim() ?? String(index),
      })
    })
    return snapshots
  }

  const handle: ListboxHandle = {
    open: openListbox,
    close: () => closeListbox({ restoreFocus: true }),
    toggle: toggleListbox,
    selectIndex: (index, opts) => selectIndex(index, opts),
    selectValue: (value: string) => {
      const targetIndex = valueToIndex.get(value) ?? -1
      if (targetIndex >= 0) {
        selectIndex(targetIndex)
      }
    },
    getSnapshot: () => ({
      open,
      state: cloneListboxState(state),
      values: expandSelection(state.selection).map(
        (index) => options[index]?.dataset.affinoListboxValue ?? String(index),
      ),
    }),
  }

  structureRegistry.set(root, { trigger, surface, optionCount: options.length })
  root.affinoListbox = handle

  detachments.push(() => overlayIntegration.destroy())
  detachments.push(() => {
    if (root.affinoListbox === handle) {
      delete root.affinoListbox
    }
    detachOutsideGuards()
  })

  registry.set(root, () => {
    releaseOverlayOwner(ownerDocument, overlayId, root)
    detachments.forEach((cleanup) => cleanup())
    registry.delete(root)
    structureRegistry.delete(root)
  })

  function resolveOptionIndex(option: OptionEl): number {
    const parsed = Number.parseInt(option.dataset.affinoListboxOptionIndex ?? "", 10)
    if (Number.isInteger(parsed) && parsed >= 0 && parsed < options.length && options[parsed] === option) {
      return parsed
    }
    return options.indexOf(option)
  }
}

function collectOptions(scope: ParentNode): OptionEl[] {
  return Array.from(scope.querySelectorAll<OptionEl>("[data-affino-listbox-option]"))
}

function applyTriggerAria(
  trigger: HTMLElement,
  surface: HTMLElement,
  open: boolean,
  mode: ListboxMode,
  disabled: boolean,
): void {
  if (!isNativeButtonControl(trigger) && !trigger.hasAttribute("role")) {
    trigger.setAttribute("role", "button")
  }
  if (trigger.tabIndex < 0 && !disabled) {
    trigger.tabIndex = 0
  }
  trigger.setAttribute("aria-disabled", disabled ? "true" : "false")
  trigger.setAttribute("aria-haspopup", "listbox")
  trigger.setAttribute("aria-expanded", open ? "true" : "false")
  surface.setAttribute("role", "listbox")
  setElementInert(surface, !open)
  surface.setAttribute("aria-hidden", open ? "false" : "true")
  if (mode === "multiple") {
    surface.setAttribute("aria-multiselectable", "true")
  } else {
    surface.removeAttribute("aria-multiselectable")
  }
  if (!surface.id) {
    const fallbackId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `affino-listbox-surface-${Math.random().toString(36).slice(2)}`
    surface.id = trigger.id || surface.dataset.affinoListboxSurface || fallbackId
  }
  surface.dataset.affinoListboxSurface = surface.id
  trigger.setAttribute("aria-controls", surface.id)
  if (!surface.hasAttribute("tabindex")) {
    surface.tabIndex = -1
  }
}

function resolveTriggerControl(trigger: HTMLElement): HTMLElement {
  const explicitControl = trigger.querySelector<HTMLElement>("[data-affino-listbox-trigger-control]")
  if (explicitControl) {
    return explicitControl
  }
  if (isFocusableCandidate(trigger)) {
    return trigger
  }
  return trigger.querySelector<HTMLElement>(
    "button, [href], input, select, textarea, [tabindex], [contenteditable='true']",
  ) ?? trigger
}

function isNativeButtonControl(element: HTMLElement): boolean {
  return element.tagName === "BUTTON"
}

function isFocusableCandidate(element: HTMLElement): boolean {
  if (element.hasAttribute("tabindex")) {
    return true
  }
  if (element.hasAttribute("contenteditable")) {
    return true
  }
  switch (element.tagName) {
    case "BUTTON":
    case "INPUT":
    case "SELECT":
    case "TEXTAREA":
      return true
    case "A":
      return element.hasAttribute("href")
    default:
      return false
  }
}

function setElementInert(element: HTMLElement, inert: boolean): void {
  const inertTarget = element as HTMLElement & { inert?: boolean }
  if (typeof inertTarget.inert === "boolean") {
    inertTarget.inert = inert
    return
  }
  if (inert) {
    element.setAttribute("inert", "")
    return
  }
  element.removeAttribute("inert")
}

function generateListboxOverlayId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `affino-listbox-${Math.random().toString(36).slice(2)}`
}

function primeStateFromDom(options: OptionEl[], context: ListboxContext): ListboxState {
  let state = createListboxState()
  options.forEach((option, index) => {
    if (option.dataset.affinoListboxOptionSelected === "true") {
      state = activateListboxIndex({
        state,
        context,
        index,
        toggle: state.selection.ranges.length > 0,
      })
    }
  })
  return state
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

function resolveMode(value?: string): ListboxMode {
  if (value === "multiple") {
    return "multiple"
  }
  return "single"
}

function expandSelection(selection: ListboxState["selection"]): number[] {
  const indexes: number[] = []
  selection.ranges.forEach((range) => {
    for (let index = range.start; index <= range.end; index += 1) {
      indexes.push(index)
    }
  })
  return indexes
}

function isIndexSelected(selection: ListboxState["selection"], index: number): boolean {
  return selection.ranges.some((range) => index >= range.start && index <= range.end)
}

function cloneListboxState(state: ListboxState): ListboxState {
  return {
    activeIndex: state.activeIndex,
    selection: {
      ranges: state.selection.ranges.map((range) => ({ start: range.start, end: range.end })),
      activeRangeIndex: state.selection.activeRangeIndex,
      anchor: state.selection.anchor,
      focus: state.selection.focus,
    },
  }
}

function listboxStatesEqual(a: ListboxState, b: ListboxState): boolean {
  if (a === b) {
    return true
  }
  if (a.activeIndex !== b.activeIndex) {
    return false
  }
  return linearSelectionsEqual(a.selection, b.selection)
}

function linearSelectionsEqual(a: ListboxState["selection"], b: ListboxState["selection"]): boolean {
  if (a === b) {
    return true
  }
  if (a.activeRangeIndex !== b.activeRangeIndex) {
    return false
  }
  if (a.anchor !== b.anchor || a.focus !== b.focus) {
    return false
  }
  if (a.ranges.length !== b.ranges.length) {
    return false
  }
  for (let index = 0; index < a.ranges.length; index += 1) {
    const rangeA = a.ranges[index]
    const rangeB = b.ranges[index]
    if (!rangeA || !rangeB) {
      continue
    }
    if (rangeA.start !== rangeB.start || rangeA.end !== rangeB.end) {
      return false
    }
  }
  return true
}

function syncLivewireModel(root: RootEl, value: unknown): void {
  const model = root.dataset.affinoListboxModel
  if (!model) {
    return
  }
  const livewire = (window as any).Livewire
  if (!livewire || typeof livewire.find !== "function") {
    return
  }
  const owner = root.closest<HTMLElement>("[wire\\:id]")
  const componentId = owner?.getAttribute("wire:id")
  if (!componentId) {
    return
  }
  const component = livewire.find(componentId)
  component?.set(model, value)
}

function scan(root: ParentNode, options: { force?: boolean } = {}): void {
  if (root instanceof HTMLElement && root.matches(LISTBOX_ROOT_SELECTOR)) {
    maybeHydrateListbox(root as RootEl, options.force)
  }
  const nodes = root.querySelectorAll<RootEl>(LISTBOX_ROOT_SELECTOR)
  nodes.forEach((node) => maybeHydrateListbox(node, options.force))
}

function setupMutationObserver(): void {
  if (typeof document === "undefined") {
    return
  }
  ensureDocumentObserver({
    globalKey: "__affinoListboxObserver",
    target: document.documentElement,
    callback: (mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (nodeContainsListbox(node)) {
            scheduleScan(node)
          }
        })
        mutation.removedNodes.forEach((node) => {
          scheduleRemovedCleanup(node)
        })
      })
    },
  })
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
  const roots = collectListboxRoots(node)
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
    }
  })
}

function enqueueMicrotask(task: () => void): void {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(task)
    return
  }
  Promise.resolve().then(task)
}

function collectListboxRoots(node: Node): RootEl[] {
  const roots: RootEl[] = []
  if (node instanceof HTMLElement && node.matches(LISTBOX_ROOT_SELECTOR)) {
    roots.push(node as RootEl)
  }
  if (node instanceof HTMLElement || node instanceof DocumentFragment) {
    node.querySelectorAll<RootEl>(LISTBOX_ROOT_SELECTOR).forEach((root) => roots.push(root))
  }
  return roots
}

function nodeContainsListbox(node: Node): node is HTMLElement | DocumentFragment {
  if (node instanceof HTMLElement) {
    if (node.matches(LISTBOX_ROOT_SELECTOR)) {
      return true
    }
    return Boolean(node.querySelector(LISTBOX_ROOT_SELECTOR))
  }
  if (node instanceof DocumentFragment) {
    return Boolean(node.querySelector(LISTBOX_ROOT_SELECTOR))
  }
  return false
}

function maybeHydrateListbox(root: RootEl, force = false): void {
  const trigger = root.querySelector<HTMLElement>("[data-affino-listbox-trigger]")
  const surface = root.querySelector<HTMLElement>("[data-affino-listbox-surface]")
  if (!trigger || !surface) {
    return
  }
  if (force) {
    hydrateListbox(root)
    return
  }
  const hasBinding = registry.has(root)
  const previous = structureRegistry.get(root)
  if (
    hasBinding &&
    previous &&
    previous.trigger === trigger &&
    previous.surface === surface &&
    previous.optionCount === surface.querySelectorAll("[data-affino-listbox-option]").length
  ) {
    return
  }
  hydrateListbox(root)
}

function claimOverlayOwner(ownerDocument: Document, overlayId: string, nextRoot: RootEl): RootEl | null {
  if (!overlayId) {
    return null
  }
  const owners = getOverlayOwners(ownerDocument)
  const existing = owners.get(overlayId) ?? null
  owners.set(overlayId, nextRoot)
  return existing && existing !== nextRoot ? existing : null
}

function releaseOverlayOwner(ownerDocument: Document, overlayId: string, root: RootEl): void {
  if (!overlayId) {
    return
  }
  const owners = overlayOwnersByDocument.get(ownerDocument)
  if (!owners) {
    return
  }
  if (owners.get(overlayId) === root) {
    owners.delete(overlayId)
  }
  if (!owners.size) {
    overlayOwnersByDocument.delete(ownerDocument)
  }
}

function getOverlayOwners(ownerDocument: Document): Map<string, RootEl> {
  const existing = overlayOwnersByDocument.get(ownerDocument)
  if (existing) {
    return existing
  }
  const created = new Map<string, RootEl>()
  overlayOwnersByDocument.set(ownerDocument, created)
  return created
}

function setupLivewireHooks(): void {
  if (typeof window === "undefined") {
    return
  }
  bindLivewireHooks({
    globalKey: "__affinoListboxLivewireHooked",
    hooks: [
      {
        name: "morph.added",
        handler: ({ el }: { el: Element }) => {
          if (nodeContainsListbox(el)) {
            scan(el)
          }
        },
      },
    ],
    onNavigated: () => {
      scan(document, { force: true })
    },
  })
}
