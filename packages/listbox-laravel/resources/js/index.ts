import {
  activateListboxIndex,
  createListboxState,
  moveListboxFocus,
  toggleActiveListboxOption,
  type ListboxContext,
  type ListboxState,
} from "@affino/listbox-core"

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

type RootEl = HTMLElement & {
  dataset: DOMStringMap & {
    affinoListboxRoot?: string
    affinoListboxMode?: string
    affinoListboxLoop?: string
    affinoListboxDisabled?: string
    affinoListboxPlaceholder?: string
    affinoListboxModel?: string
    affinoListboxState?: string
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

const registry = new WeakMap<RootEl, Cleanup>()

export function bootstrapAffinoListboxes(): void {
  scan(document)
  setupMutationObserver()
  setupLivewireHooks()
}

export function hydrateListbox(root: RootEl): void {
  const trigger = root.querySelector<HTMLElement>("[data-affino-listbox-trigger]")
  const surface = root.querySelector<HTMLElement>("[data-affino-listbox-surface]")
  if (!trigger || !surface) {
    return
  }

  hydrateResolvedListbox(root, trigger, surface)
}

function hydrateResolvedListbox(root: RootEl, trigger: HTMLElement, surface: HTMLElement): void {
  const teardown = registry.get(root)
  teardown?.()

  const detachments: Cleanup[] = []
  let options = collectOptions(root)
  let context: ListboxContext = {
    optionCount: options.length,
    isDisabled: (index) => options[index]?.dataset.affinoListboxDisabled === "true",
  }

  const mode = resolveMode(root.dataset.affinoListboxMode)
  const loop = readBoolean(root.dataset.affinoListboxLoop, true)
  const placeholder = root.dataset.affinoListboxPlaceholder ?? "Select"
  const disabled = readBoolean(root.dataset.affinoListboxDisabled, false)
  const triggerLabelEl = trigger.querySelector<HTMLElement>("[data-affino-listbox-display]")
  const hiddenInput = root.querySelector<HTMLInputElement>("[data-affino-listbox-input]")

  let state = primeStateFromDom(options, context)
  let open = readBoolean(root.dataset.affinoListboxState, false)
  let outsideCleanup: Cleanup | null = null
  let livewireSyncCache: string | null = null
  let pendingStructureRehydrate = false

  surface.hidden = !open
  applyTriggerAria(trigger, surface, open)
  syncSelectionAttributes()
  pushSelectionChanges({ silent: true })

  const openListbox = () => {
    if (open || disabled) {
      return
    }
    open = true
    root.dataset.affinoListboxState = "open"
    surface.hidden = false
    applyTriggerAria(trigger, surface, true)
    attachOutsideGuards()
    requestAnimationFrame(() => focusActiveOption())
  }

  const closeListbox = () => {
    if (!open) {
      return
    }
    open = false
    root.dataset.affinoListboxState = "closed"
    surface.hidden = true
    applyTriggerAria(trigger, surface, false)
    detachOutsideGuards()
    requestAnimationFrame(() => {
      if (trigger.isConnected) {
        trigger.focus({ preventScroll: true })
      }
    })
  }

  const toggleListbox = () => {
    if (open) {
      closeListbox()
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
      closeListbox()
    }
  }

  const moveActiveIndex = (delta: number, options?: { extend?: boolean }) => {
    const next = moveListboxFocus({
      state,
      context,
      delta,
      extend: mode === "multiple" && (options?.extend ?? false),
      loop,
    })
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
          closeListbox()
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
        closeListbox()
        break
      case "Tab":
        closeListbox()
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
    const index = options.indexOf(option)
    if (index === -1) {
      return
    }
    const toggle = mode === "multiple" && (event.metaKey || event.ctrlKey)
    const extend = mode === "multiple" && event.shiftKey
    selectIndex(index, { toggle, extend })
  }
  surface.addEventListener("click", handleSurfaceClick)
  detachments.push(() => surface.removeEventListener("click", handleSurfaceClick))

  const handleSurfacePointerMove = (event: PointerEvent) => {
    const option = (event.target instanceof HTMLElement ? event.target.closest<OptionEl>("[data-affino-listbox-option]") : null)
    if (!option) {
      return
    }
    const index = options.indexOf(option)
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
      hydrateListbox(root)
    })
  })
  structureObserver.observe(root, { childList: true, subtree: true })
  detachments.push(() => structureObserver.disconnect())

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
      if (root.contains(event.target as Node)) {
        return
      }
      closeListbox()
    }
    const onFocusIn = (event: FocusEvent) => {
      if (root.contains(event.target as Node)) {
        return
      }
      closeListbox()
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
    options = collectOptions(root)
    context.optionCount = options.length
    options.forEach((option, index) => {
      option.tabIndex = -1
      option.setAttribute("role", "option")
      option.dataset.affinoListboxOptionIndex = String(index)
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
      } else {
        delete option.dataset.active
      }
    })
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
    close: closeListbox,
    toggle: toggleListbox,
    selectIndex: (index, opts) => selectIndex(index, opts),
    selectValue: (value: string) => {
      const currentOptions = options
      const targetIndex = currentOptions.findIndex((option) => option.dataset.affinoListboxValue === value)
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

  root.affinoListbox = handle

  detachments.push(() => {
    if (root.affinoListbox === handle) {
      delete root.affinoListbox
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

function applyTriggerAria(trigger: HTMLElement, surface: HTMLElement, open: boolean): void {
  trigger.setAttribute("aria-haspopup", "listbox")
  trigger.setAttribute("aria-expanded", open ? "true" : "false")
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

function scan(root: ParentNode): void {
  if (root instanceof HTMLElement && root.matches("[data-affino-listbox-root]")) {
    hydrateListbox(root as RootEl)
  }
  const nodes = root.querySelectorAll<RootEl>("[data-affino-listbox-root]")
  nodes.forEach((node) => hydrateListbox(node))
}

function setupMutationObserver(): void {
  if ((window as any).__affinoListboxObserver) {
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
  ;(window as any).__affinoListboxObserver = observer
}

function setupLivewireHooks(): void {
  const livewire = (window as any).Livewire
  if (!livewire || (window as any).__affinoListboxLivewireHooked) {
    return
  }
  if (typeof livewire.hook === "function") {
    livewire.hook("morph.added", ({ el }: { el: Element }) => {
      if (el instanceof HTMLElement || el instanceof DocumentFragment) {
        scan(el)
      }
    })
  }
  document.addEventListener("livewire:navigated", () => {
    scan(document)
  })
  ;(window as any).__affinoListboxLivewireHooked = true
}
