import {
  activateListboxIndex,
  createListboxState,
  type ListboxContext,
  type ListboxState,
} from "@affino/listbox-core"
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

export type ComboboxMode = "single" | "multiple"

type Cleanup = () => void

type ComboboxSnapshot = {
  open: boolean
  filter: string
  state: ListboxState
  values: string[]
}

type ComboboxHandle = {
  open(): void
  close(): void
  toggle(): void
  selectIndex(index: number, options?: { extend?: boolean; toggle?: boolean }): void
  selectValue(value: string): void
  clear(): void
  getSnapshot(): ComboboxSnapshot
}

type RootEl = HTMLElement & {
  dataset: DOMStringMap & {
    affinoComboboxRoot?: string
    affinoComboboxMode?: string
    affinoComboboxLoop?: string
    affinoComboboxDisabled?: string
    affinoComboboxPlaceholder?: string
    affinoComboboxModel?: string
    affinoComboboxState?: string
    affinoComboboxPinned?: string
    affinoComboboxOpenPointer?: string
  }
  affinoCombobox?: ComboboxHandle
}

type InputEl = HTMLInputElement & {
  dataset: DOMStringMap & {
    affinoComboboxInput?: string
    affinoComboboxFilter?: string
  }
}

type SurfaceEl = HTMLElement & {
  dataset: DOMStringMap & {
    affinoComboboxSurface?: string
  }
}

type OptionEl = HTMLElement & {
  dataset: DOMStringMap & {
    affinoListboxValue?: string
    affinoListboxLabel?: string
    affinoListboxOptionSelected?: string
    affinoListboxDisabled?: string
    affinoComboboxHidden?: string
    affinoComboboxOptionId?: string
    affinoComboboxIndex?: string
  }
}

type OptionSnapshot = {
  index: number
  value: string
  label: string
}

const registry = new WeakMap<RootEl, Cleanup>()
const pinnedOpenRegistry = new Map<string, boolean>()

export function bootstrapAffinoComboboxes(): void {
  scan(document)
  setupMutationObserver()
  setupLivewireHooks()
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

  let openState = readBoolean(root.dataset.affinoComboboxState, false)
  if (persistenceKey && pinnedOpenRegistry.has(persistenceKey)) {
    openState = true
  }
  state = setComboboxOpen(state, openState)
  reflectOpenState()
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

  function closeCombobox(options?: { restoreInput?: boolean; silentFilterReset?: boolean }) {
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
    const next = moveComboboxFocus({
      state,
      context,
      delta,
      extend: mode === "multiple" && (options?.extend ?? false),
    })
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
        restoreInputFromSelection()
        closeCombobox()
        break
      case "Tab":
        restoreInputFromSelection()
        closeCombobox()
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
      hydrateCombobox(root)
    })
  })
  structureObserver.observe(root, { childList: true, subtree: true })
  detachments.push(() => structureObserver.disconnect())

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
      if (!options?.silentSelection) {
        syncSelectionAttributes()
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
    options = collectOptions(root)
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
    options = collectOptions(root)
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
      activeOption.scrollIntoView({ block: "nearest", inline: "nearest" })
    })
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
      closeCombobox({ restoreInput: true })
    }
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as Node | null
      if (root.contains(target as Node)) {
        return
      }
      if (shouldIgnoreOutsideEvent(rootId, target)) {
        return
      }
      closeCombobox({ restoreInput: true })
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

function collectOptions(root: RootEl): OptionEl[] {
  return Array.from(root.querySelectorAll<OptionEl>("[data-affino-listbox-option]"))
}

function applyInputAria(input: InputEl, surface: SurfaceEl, open: boolean, mode: ComboboxMode): void {
  input.setAttribute("role", "combobox")
  input.setAttribute("aria-autocomplete", "list")
  input.setAttribute("aria-haspopup", "listbox")
  input.setAttribute("aria-expanded", open ? "true" : "false")
  if (!surface.id) {
    surface.id = generateId("affino-combobox-surface")
  }
  surface.dataset.affinoComboboxSurface = surface.id
  input.setAttribute("aria-controls", surface.id)
  surface.setAttribute("role", "listbox")
  if (!surface.hasAttribute("tabindex")) {
    surface.tabIndex = -1
  }
  if (mode === "multiple") {
    surface.setAttribute("aria-multiselectable", "true")
  } else {
    surface.removeAttribute("aria-multiselectable")
  }
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

function resolveMode(value?: string): ComboboxMode {
  return value === "multiple" ? "multiple" : "single"
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

function normalizeFilter(value: string): string {
  return value.trim().toLowerCase()
}

function optionMatches(option: OptionEl, normalizedQuery: string): boolean {
  const label = option.dataset.affinoListboxLabel ?? option.textContent ?? ""
  return label.toLowerCase().includes(normalizedQuery)
}

function isOptionDisabled(option?: OptionEl): boolean {
  if (!option) {
    return true
  }
  if (option.hidden) {
    return true
  }
  if (option.dataset.affinoListboxDisabled === "true") {
    return true
  }
  if (option.dataset.affinoComboboxHidden === "true") {
    return true
  }
  return false
}

function ensureOptionId(option: OptionEl, rootId?: string): string {
  if (option.id) {
    return option.id
  }
  const value = option.dataset.affinoListboxValue
  if (value && rootId) {
    const escaped = escapeIdentifier(value)
    const stableId = `affino-combobox-option-${escapeIdentifier(rootId)}-${escaped}`
    option.id = stableId
    return stableId
  }
  const generated = generateId("affino-combobox-option")
  option.id = generated
  return generated
}

function escapeIdentifier(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, (char) => `-${char.charCodeAt(0).toString(16)}-`)
}

function shouldIgnoreOutsideEvent(rootId: string, target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) {
    return false
  }
  const sticky = target.closest<HTMLElement>("[data-affino-combobox-sticky]")
  if (!sticky) {
    return false
  }
  const attr = sticky.getAttribute("data-affino-combobox-sticky")?.trim()
  if (!attr) {
    return true
  }
  if (!rootId) {
    return false
  }
  const candidates = attr
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
  return candidates.includes(rootId)
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

function scan(root: ParentNode): void {
  if (root instanceof HTMLElement && root.matches("[data-affino-combobox-root]")) {
    hydrateCombobox(root as RootEl)
  }
  const nodes = root.querySelectorAll<RootEl>("[data-affino-combobox-root]")
  nodes.forEach((node) => hydrateCombobox(node))
}

function setupMutationObserver(): void {
  if ((window as any).__affinoComboboxObserver) {
    return
  }
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement || node instanceof DocumentFragment) {
          scan(node)
        }
      })
    })
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
  ;(window as any).__affinoComboboxObserver = observer
}

function setupLivewireHooks(): void {
  const livewire = (window as any).Livewire
  if (!livewire || (window as any).__affinoComboboxLivewireHooked) {
    return
  }
  if (typeof livewire.hook === "function") {
    livewire.hook("morph.added", ({ el }: { el: Element }) => {
      if (el instanceof HTMLElement || el instanceof DocumentFragment) {
        scan(el)
      }
    })
    livewire.hook("message.processed", (_message: unknown, component: { el?: Element }) => {
      const scope = component?.el
      if (scope instanceof HTMLElement || scope instanceof DocumentFragment) {
        scan(scope)
        return
      }
      scan(document)
    })
  }
  document.addEventListener("livewire:navigated", () => {
    scan(document)
  })
  ;(window as any).__affinoComboboxLivewireHooked = true
}

function generateId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Math.random().toString(36).slice(2)}`
}
