import {
  activateComboboxIndex,
  clearComboboxSelection,
  cloneListboxState,
  createComboboxState,
  getSelectedIndexes,
  isIndexSelected,
  moveComboboxFocus,
  setComboboxFilter,
  setComboboxOpen,
  type ComboboxContext,
  type ComboboxState,
} from "@affino/combobox-core"
import {
  createOverlayIntegration,
  ensureDocumentObserver,
  getDocumentOverlayManager,
  type OverlayManager,
  type OverlayCloseReason,
} from "@affino/overlay-kernel"
import {
  applyInputAria,
  collectOptions,
  ensureOptionId,
  generateComboboxOverlayId,
  hasStructureChanged,
  isOptionDisabled,
  linearSelectionsEqual,
  normalizeFilter,
  optionMatches,
  primeStateFromDom,
  readBoolean,
  resolveMode,
  shouldIgnoreOutsideEvent,
} from "./helpers"
import type {
  Cleanup,
  CloseComboboxOptions,
  ComboboxHandle,
  InputEl,
  OptionEl,
  OptionSnapshot,
  RootEl,
  SurfaceEl,
} from "./types"

const COMBOBOX_ROOT_SELECTOR = "[data-affino-combobox-root]"
const registry = new WeakMap<RootEl, Cleanup>()
const pinnedOpenRegistry = new Map<string, boolean>()
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

export function hydrateCombobox(root: RootEl): void {
  const input = root.querySelector<InputEl>("[data-affino-combobox-input]")
  const surface = root.querySelector<SurfaceEl>("[data-affino-combobox-surface]")
  if (!input || !surface) {
    return
  }
  hydrateResolvedCombobox(root, input, surface)
}

function hydrateResolvedCombobox(root: RootEl, input: InputEl, surface: SurfaceEl): void {
  const teardown = registry.get(root)
  teardown?.()

  const detachments: Cleanup[] = []
  let options = collectOptions(root)

  const mode = resolveMode(root.dataset.affinoComboboxMode)
  const loop = readBoolean(root.dataset.affinoComboboxLoop, true)
  const disabled = readBoolean(root.dataset.affinoComboboxDisabled, false)
  const placeholder = root.dataset.affinoComboboxPlaceholder ?? input.placeholder ?? ""
  const pinned = readBoolean(root.dataset.affinoComboboxPinned, false)
  const rootId = root.dataset.affinoComboboxRoot ?? ""
  const persistenceKey = pinned && rootId ? rootId : null
  const openOnPointerDown = readBoolean(root.dataset.affinoComboboxOpenPointer, true)

  let context: ComboboxContext = {
    mode,
    loop,
    disabled,
    optionCount: options.length,
    isDisabled: (index) => isOptionDisabled(options[index]),
  }
  let hasNavigableOptions = options.some((option) => !isOptionDisabled(option))

  let state = createComboboxState({
    listbox: primeStateFromDom(options, context),
  })
  let committedInputValue = input.value
  let livewireSyncCache: string | null = null
  const hiddenInput = root.querySelector<HTMLInputElement>("[data-affino-combobox-value]")
  let outsideCleanup: Cleanup | null = null
  let pendingStructureRehydrate = false
  let optionsDirty = false
  let overlayIntegration: ReturnType<typeof createOverlayIntegration> | null = null

  let openState = readBoolean(root.dataset.affinoComboboxState, false)
  if (persistenceKey && pinnedOpenRegistry.has(persistenceKey)) {
    openState = true
  }
  state = setComboboxOpen(state, openState)
  reflectOpenState()
  const overlayId = rootId || surface.dataset.affinoComboboxSurface || surface.id || generateComboboxOverlayId()
  const overlayKind = root.dataset.affinoComboboxOverlayKind ?? "combobox"
  overlayIntegration = createOverlayIntegration({
    id: overlayId,
    kind: overlayKind,
    overlayManager: resolveSharedOverlayManager(root.ownerDocument ?? document),
    traits: {
      root: surface,
      returnFocus: true,
    },
    initialState: state.open ? "open" : "closed",
    releaseOnIdle: false,
    onCloseRequested: (reason) => handleKernelClose(reason),
  })
  syncOverlayState()
  syncSelectionAttributes()
  setFilterValue("")
  primeInputDisplay()
  pushSelectionChanges({ silent: true })

  if (state.open) {
    attachOutsideGuards()
  }

  function reflectOpenState() {
    root.dataset.affinoComboboxState = state.open ? "true" : "false"
    surface.dataset.state = state.open ? "open" : "closed"
    surface.hidden = !state.open
    applyInputAria(input, surface, state.open, mode)
    syncOverlayState()
  }

  function syncOverlayState() {
    overlayIntegration?.syncState(state.open ? "open" : "closed")
  }

  function requestKernelClose(reason: OverlayCloseReason, options?: CloseComboboxOptions) {
    if (overlayIntegration && overlayIntegration.requestClose(reason)) {
      return
    }
    handleKernelClose(reason, options)
  }

  function handleKernelClose(reason: OverlayCloseReason, options?: CloseComboboxOptions) {
    const defaultRestore = reason === "escape-key" || reason === "pointer-outside" || reason === "focus-loss"
    const shouldRestore = options?.restoreInput ?? defaultRestore
    closeCombobox({
      restoreInput: shouldRestore,
      silentFilterReset: options?.silentFilterReset,
    })
  }

  function primeInputDisplay() {
    const selectionText = getSelectionDisplayValue()
    const filterActive = (input.dataset.affinoComboboxFilter ?? "") !== ""
    if (!filterActive) {
      if (selectionText) {
        input.value = selectionText
      } else if (input.value.trim() !== "" && !selectionText) {
        input.value = ""
      }
    }
    const effectiveValue = input.value.trim() !== "" ? input.value : selectionText ?? ""
    committedInputValue = effectiveValue
  }

  function openCombobox() {
    if (state.open || disabled) {
      return
    }
    state = setComboboxOpen(state, true)
    rememberOpenState(true)
    reflectOpenState()
    attachOutsideGuards()
    scrollActiveOptionIntoView()
  }

  function openFromNavigation() {
    if (!state.open) {
      openCombobox()
    }
    if (state.filter !== "") {
      setFilterValue("")
    }
  }

  function closeCombobox(options: CloseComboboxOptions = {}) {
    if (!state.open) {
      if (options?.restoreInput) {
        restoreInputFromSelection()
      }
      return
    }
    state = setComboboxOpen(state, false)
    rememberOpenState(false)
    reflectOpenState()
    detachOutsideGuards()
    if (!options?.silentFilterReset) {
      resetFilterFromSelection()
    }
    if (options?.restoreInput) {
      restoreInputFromSelection()
    }
    requestAnimationFrame(() => {
      if (input.isConnected) {
        input.focus({ preventScroll: true })
        input.setSelectionRange(input.value.length, input.value.length)
      }
    })
  }

  function toggleCombobox() {
    if (state.open) {
      closeCombobox({ restoreInput: true })
    } else {
      openFromNavigation()
    }
  }

  function clearSelection() {
    const next = clearComboboxSelection(state)
    applyComboboxState(next)
    committedInputValue = ""
    input.value = ""
    setFilterValue("")
    closeCombobox({ silentFilterReset: true })
  }

  function moveActiveIndex(delta: number, options?: { extend?: boolean }) {
    if (!hasNavigableOptions) {
      return
    }
    const shouldExtendSelection = mode === "multiple" && (options?.extend ?? false)
    const next = moveComboboxFocus({
      state,
      context,
      delta,
      extend: shouldExtendSelection,
    })

    if (next.listbox.activeIndex === state.listbox.activeIndex) {
      return
    }

    // Arrow navigation should only move the active option.
    // Selection is committed explicitly via Enter/Space/click (or shift-extend in multiple mode).
    if (!shouldExtendSelection) {
      const nextListbox = cloneListboxState(state.listbox)
      nextListbox.activeIndex = next.listbox.activeIndex
      applyComboboxState(
        {
          ...state,
          listbox: nextListbox,
        },
        { silentSelection: true },
      )
      return
    }

    applyComboboxState(next)
  }

  function selectIndex(index: number, options?: { extend?: boolean; toggle?: boolean }) {
    const option = optionsList()[index]
    if (isOptionDisabled(option)) {
      return
    }
    const toggle = mode === "multiple" && (options?.toggle ?? false)
    const extend = mode === "multiple" && (options?.extend ?? false)
    const next = activateComboboxIndex({ state, context, index, toggle, extend })
    applyComboboxState(next)
    commitSelectionDisplay()
    if (mode === "single") {
      closeCombobox({ restoreInput: true })
    }
  }

  function selectValue(value: string) {
    const index = optionsList().findIndex((option) => option.dataset.affinoListboxValue === value)
    if (index >= 0) {
      selectIndex(index)
    }
  }

  function selectAllVisible() {
    if (mode !== "multiple") {
      return
    }
    let next = state
    optionsList().forEach((option, index) => {
      if (isOptionDisabled(option)) {
        return
      }
      next = activateComboboxIndex({ state: next, context, index, toggle: true })
    })
    applyComboboxState(next)
    commitSelectionDisplay()
  }

  function handleInputEvent() {
    if (disabled) {
      return
    }
    const query = input.value
    committedInputValue = query
    setFilterValue(query)
    if (query.trim() !== "" || !state.open) {
      openCombobox()
    }
  }

  function handleInputPointerDown(event: PointerEvent) {
    if (disabled || event.button !== 0) {
      return
    }
    if (!openOnPointerDown) {
      return
    }
    if (!state.open) {
      openFromNavigation()
    }
  }

  function handleInputKeydown(event: KeyboardEvent) {
    if (disabled) {
      return
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault()
        if (!state.open) {
          openFromNavigation()
        }
        moveActiveIndex(event.altKey ? Infinity : 1, { extend: event.shiftKey })
        break
      case "ArrowUp":
        event.preventDefault()
        if (!state.open) {
          openFromNavigation()
        }
        moveActiveIndex(event.altKey ? -Infinity : -1, { extend: event.shiftKey })
        break
      case "Enter":
        event.preventDefault()
        if (!state.open) {
          openFromNavigation()
        }
        if (state.listbox.activeIndex >= 0) {
          selectIndex(state.listbox.activeIndex, {
            extend: mode === "multiple" && event.shiftKey,
            toggle: mode === "multiple" && (event.metaKey || event.ctrlKey),
          })
        }
        break
      case "Escape":
        event.preventDefault()
        requestKernelClose("escape-key", { restoreInput: true })
        break
      case "Tab":
        requestKernelClose("focus-loss", { restoreInput: true })
        break
      case "a":
      case "A":
        if (mode === "multiple" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          selectAllVisible()
        }
        break
    }
  }


  function handleSurfacePointerOver(event: PointerEvent) {
    const option = event.target instanceof HTMLElement ? event.target.closest<OptionEl>("[data-affino-listbox-option]") : null
    const index = getOptionIndex(option)
    if (!option || index === -1 || index === state.listbox.activeIndex || isOptionDisabled(option)) {
      return
    }
    const nextListbox = cloneListboxState(state.listbox)
    nextListbox.activeIndex = index
    applyComboboxState(
      {
        ...state,
        listbox: nextListbox,
      },
      { silentSelection: true },
    )
  }

  function handleSurfaceClick(event: MouseEvent) {
    const option = event.target instanceof HTMLElement ? event.target.closest<OptionEl>("[data-affino-listbox-option]") : null
    const index = getOptionIndex(option)
    if (index === -1 || !option || isOptionDisabled(option)) {
      return
    }
    const toggle = mode === "multiple" && (event.metaKey || event.ctrlKey)
    const extend = mode === "multiple" && event.shiftKey
    selectIndex(index, { toggle, extend })
  }

  function handleSurfacePointerDown(event: PointerEvent) {
    const option = event.target instanceof HTMLElement ? event.target.closest<OptionEl>("[data-affino-listbox-option]") : null
    if (!option || event.button !== 0) {
      return
    }
    const interactiveTarget = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>("button,a,input,textarea,select,[role='button'],[contenteditable='true']") : null
    if (interactiveTarget && option.contains(interactiveTarget)) {
      return
    }
    event.preventDefault()
  }

  input.addEventListener("input", handleInputEvent)
  detachments.push(() => input.removeEventListener("input", handleInputEvent))

  input.addEventListener("keydown", handleInputKeydown)
  detachments.push(() => input.removeEventListener("keydown", handleInputKeydown))

  input.addEventListener("pointerdown", handleInputPointerDown)
  detachments.push(() => input.removeEventListener("pointerdown", handleInputPointerDown))

  surface.addEventListener("pointerover", handleSurfacePointerOver)
  detachments.push(() => surface.removeEventListener("pointerover", handleSurfacePointerOver))

  surface.addEventListener("pointerdown", handleSurfacePointerDown)
  detachments.push(() => surface.removeEventListener("pointerdown", handleSurfacePointerDown))

  surface.addEventListener("click", handleSurfaceClick)
  detachments.push(() => surface.removeEventListener("click", handleSurfaceClick))

  const structureObserver = new MutationObserver((mutations) => {
    if (mutations.length > 0) {
      optionsDirty = true
    }
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
      hydrateCombobox(root)
    })
  })
  structureObserver.observe(root, { childList: true, subtree: true })
  detachments.push(() => structureObserver.disconnect())

  const syncOpenFromDomState = () => {
    const domOpen = readBoolean(root.dataset.affinoComboboxState, false)
    if (domOpen && !state.open) {
      openCombobox()
      return
    }
    if (!domOpen && state.open) {
      closeCombobox({ restoreInput: true })
    }
  }

  const stateObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes" && mutation.attributeName === "data-affino-combobox-state") {
        syncOpenFromDomState()
        return
      }
    }
  })
  stateObserver.observe(root, {
    attributes: true,
    attributeFilter: ["data-affino-combobox-state"],
  })
  detachments.push(() => stateObserver.disconnect())
  syncOpenFromDomState()

  function applyComboboxState(next: ComboboxState, options?: { silentSelection?: boolean }) {
    if (next === state) {
      return
    }
    const activeChanged = state.listbox.activeIndex !== next.listbox.activeIndex
    const selectionChanged = !linearSelectionsEqual(state.listbox.selection, next.listbox.selection)
    if (!activeChanged && !selectionChanged) {
      state = {
        ...next,
        listbox: state.listbox,
      }
      return
    }
    state = {
      ...next,
      listbox: cloneListboxState(next.listbox),
    }
    syncSelectionAttributes()
    if (selectionChanged && !options?.silentSelection) {
      pushSelectionChanges()
    }
  }

  function syncSelectionAttributes() {
    maybeRefreshOptionsFromDom()
    context = {
      mode,
      loop,
      disabled,
      optionCount: options.length,
      isDisabled: (index) => isOptionDisabled(options[index]),
    }
    options.forEach((option, index) => {
      option.tabIndex = -1
      option.setAttribute("role", "option")
      option.dataset.affinoComboboxOptionId = ensureOptionId(option, rootId)
      option.dataset.affinoComboboxIndex = String(index)
      const selected = isIndexSelected(state.listbox.selection, index)
      option.dataset.affinoListboxOptionSelected = selected ? "true" : "false"
      option.setAttribute("aria-selected", selected ? "true" : "false")
      if (selected) {
        option.dataset.state = "selected"
      } else {
        delete option.dataset.state
      }
      if (index === state.listbox.activeIndex) {
        option.dataset.active = "true"
      } else {
        delete option.dataset.active
      }
      if (option.dataset.affinoComboboxHidden === "true") {
        option.hidden = true
      } else {
        option.hidden = false
      }
    })
    hasNavigableOptions = options.some((option) => !isOptionDisabled(option))
    const activeOption = options[state.listbox.activeIndex]
    if (state.open && activeOption) {
      input.setAttribute("aria-activedescendant", activeOption.dataset.affinoComboboxOptionId ?? ensureOptionId(activeOption, rootId))
    } else {
      input.removeAttribute("aria-activedescendant")
    }
    scrollActiveOptionIntoView()
  }

  function pushSelectionChanges(options?: { silent?: boolean }) {
    const snapshots = getSelectedOptionSnapshots()
    const values = snapshots.map((snapshot) => snapshot.value)
    const payload = mode === "multiple" ? values : values[0] ?? null
    const serialized = JSON.stringify(payload)
    const hasLivewireModel = Boolean(root.dataset.affinoComboboxModel)

    if (hiddenInput) {
      const formValue = mode === "multiple" ? JSON.stringify(values) : values[0] ?? ""
      if (hiddenInput.value !== formValue) {
        hiddenInput.value = formValue
        if (!hasLivewireModel) {
          hiddenInput.dispatchEvent(new Event("input", { bubbles: true }))
          hiddenInput.dispatchEvent(new Event("change", { bubbles: true }))
        }
      }
    }

    if (serialized === livewireSyncCache) {
      return
    }
    livewireSyncCache = serialized
    if (options?.silent) {
      return
    }
    if (hasLivewireModel) {
      syncLivewireModel(root, payload)
    }
    root.dispatchEvent(
      new CustomEvent("affino-combobox:change", {
        detail: {
          values,
          indexes: snapshots.map((snapshot) => snapshot.index),
          labels: snapshots.map((snapshot) => snapshot.label),
        },
        bubbles: true,
        composed: true,
      }),
    )
  }

  function getSelectedOptionSnapshots(): OptionSnapshot[] {
    const indexes = getSelectedIndexes(state.listbox.selection)
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

  function commitSelectionDisplay() {
    const text = getSelectionDisplayValue()
    committedInputValue = text
    input.value = text
    setFilterValue("")
  }

  function getSelectionDisplayValue(): string {
    const snapshots = getSelectedOptionSnapshots()
    if (!snapshots.length) {
      return ""
    }
    if (mode === "multiple") {
      return `${snapshots.length} selected`
    }
    return snapshots[0]?.label ?? ""
  }

  function restoreInputFromSelection() {
    const text = committedInputValue || getSelectionDisplayValue()
    input.value = text
    if (!text && placeholder) {
      input.placeholder = placeholder
    }
  }

  function resetFilterFromSelection() {
    setFilterValue("")
  }

  function setFilterValue(value: string) {
    state = setComboboxFilter(state, value)
    input.dataset.affinoComboboxFilter = state.filter
    filterOptions(value)
  }

  function filterOptions(value: string) {
    maybeRefreshOptionsFromDom()
    const normalized = normalizeFilter(value)
    let firstVisibleIndex: number | null = null
    let navigableCount = 0
    options.forEach((option, index) => {
      const matches = normalized === "" ? true : optionMatches(option, normalized)
      if (matches) {
        option.hidden = false
        delete option.dataset.affinoComboboxHidden
        if (firstVisibleIndex === null && !isOptionDisabled(option)) {
          firstVisibleIndex = index
        }
        if (!isOptionDisabled(option)) {
          navigableCount += 1
        }
      } else {
        option.hidden = true
        option.dataset.affinoComboboxHidden = "true"
      }
    })
    context = {
      mode,
      loop,
      disabled,
      optionCount: options.length,
      isDisabled: (index) => isOptionDisabled(options[index]),
    }
    hasNavigableOptions = navigableCount > 0
    const needsRealign = state.listbox.activeIndex < 0 || isOptionDisabled(options[state.listbox.activeIndex])
    if (needsRealign) {
      const target = firstVisibleIndex ?? -1
      const nextListbox = cloneListboxState(state.listbox)
      nextListbox.activeIndex = target
      applyComboboxState(
        {
          ...state,
          listbox: nextListbox,
        },
        { silentSelection: true },
      )
    } else {
      syncSelectionAttributes()
    }
  }

  function getOptionIndex(option: OptionEl | null): number {
    if (!option) {
      return -1
    }
    const stored = option.dataset.affinoComboboxIndex
    if (stored !== undefined) {
      // Dataset index is an optimization, not identity; DOM reorders can invalidate it.
      const parsed = Number.parseInt(stored, 10)
      return Number.isFinite(parsed) ? parsed : -1
    }
    return options.indexOf(option)
  }

  function optionsList(): OptionEl[] {
    return options
  }

  function maybeRefreshOptionsFromDom() {
    if (!optionsDirty) {
      return
    }
    optionsDirty = false
    options = collectOptions(root)
  }

  function scrollActiveOptionIntoView() {
    if (!state.open) {
      return
    }
    const activeOption = options[state.listbox.activeIndex]
    if (!activeOption || activeOption.hidden) {
      return
    }
    requestAnimationFrame(() => {
      if (!activeOption.isConnected) {
        return
      }
      if (!shouldScrollOptionIntoView(activeOption)) {
        return
      }
      activeOption.scrollIntoView({ block: "nearest", inline: "nearest" })
    })
  }

  function shouldScrollOptionIntoView(option: OptionEl): boolean {
    const scrollContainer = option.closest<HTMLElement>("[data-affino-combobox-surface]") ?? surface
    if (!scrollContainer) {
      return true
    }
    if (scrollContainer.scrollHeight <= scrollContainer.clientHeight + 1) {
      return false
    }
    const optionRect = option.getBoundingClientRect()
    const containerRect = scrollContainer.getBoundingClientRect()
    return optionRect.top < containerRect.top || optionRect.bottom > containerRect.bottom
  }

  function attachOutsideGuards() {
    if (outsideCleanup) {
      return
    }
    const onPointerDown = (event: Event) => {
      const target = event.target as Node | null
      if (root.contains(target as Node)) {
        return
      }
      if (shouldIgnoreOutsideEvent(rootId, target)) {
        return
      }
      requestKernelClose("pointer-outside", { restoreInput: true })
    }
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as Node | null
      if (root.contains(target as Node)) {
        return
      }
      if (shouldIgnoreOutsideEvent(rootId, target)) {
        return
      }
      requestKernelClose("focus-loss", { restoreInput: true })
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    document.addEventListener("focusin", onFocusIn, true)
    outsideCleanup = () => {
      document.removeEventListener("pointerdown", onPointerDown, true)
      document.removeEventListener("focusin", onFocusIn, true)
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
      pinnedOpenRegistry.set(persistenceKey, true)
    } else {
      pinnedOpenRegistry.delete(persistenceKey)
    }
  }

  function shouldHydrateStructure(): boolean {
    if (!root.querySelector("[data-affino-listbox-option]")) {
      return false
    }
    return hasStructureChanged(root, {
      input,
      surface,
      optionCount: options.length,
    })
  }

  const handle: ComboboxHandle = {
    open: openCombobox,
    close: () => closeCombobox({ restoreInput: true }),
    toggle: toggleCombobox,
    selectIndex: (index, opts) => selectIndex(index, opts),
    selectValue,
    clear: clearSelection,
    getSnapshot: () => ({
      open: state.open,
      filter: state.filter,
      state: cloneListboxState(state.listbox),
      values: getSelectedIndexes(state.listbox.selection).map((index) => options[index]?.dataset.affinoListboxValue ?? String(index)),
    }),
  }

  root.affinoCombobox = handle
  detachments.push(() => overlayIntegration?.destroy())
  detachments.push(() => {
    if (root.affinoCombobox === handle) {
      delete root.affinoCombobox
    }
    detachOutsideGuards()
  })

  registry.set(root, () => {
    detachments.forEach((cleanup) => cleanup())
    registry.delete(root)
  })
}

function syncLivewireModel(root: RootEl, value: unknown): void {
  const model = root.dataset.affinoComboboxModel
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

export function scan(root: ParentNode): void {
  if (root instanceof HTMLElement && root.matches(COMBOBOX_ROOT_SELECTOR)) {
    hydrateCombobox(root as RootEl)
  }
  const nodes = root.querySelectorAll<RootEl>(COMBOBOX_ROOT_SELECTOR)
  nodes.forEach((node) => hydrateCombobox(node))
}

export function setupMutationObserver(): void {
  if (typeof document === "undefined") {
    return
  }
  ensureDocumentObserver({
    globalKey: "__affinoComboboxObserver",
    target: document.documentElement,
    callback: (mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement || node instanceof DocumentFragment) {
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
  const roots = collectComboboxRoots(node)
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

function collectComboboxRoots(node: Node): RootEl[] {
  const roots: RootEl[] = []
  if (node instanceof HTMLElement && node.matches(COMBOBOX_ROOT_SELECTOR)) {
    roots.push(node as RootEl)
  }
  if (node instanceof HTMLElement || node instanceof DocumentFragment) {
    node.querySelectorAll<RootEl>(COMBOBOX_ROOT_SELECTOR).forEach((root) => roots.push(root))
  }
  return roots
}
