<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue"
import {
  createComboboxStore,
  useComboboxStore,
  type ComboboxContext,
} from "@affino/combobox-vue"
import { useFloatingPopover, usePopoverController } from "@affino/popover-vue"
import { accountOptions } from "@/data/comboboxOptions"

const query = ref(accountOptions[0]?.name ?? "")
const selectedAccountId = ref<string | null>(accountOptions[0]?.id ?? null)
const inputRef = ref<HTMLInputElement | null>(null)
const humanOwner = computed(() => accountOptions.find((option) => option.id === selectedAccountId.value)?.owner ?? "-")

const filteredOptions = computed(() => {
  const term = query.value.trim().toLowerCase()
  if (!term) {
    return accountOptions
  }
  return accountOptions.filter((option) => {
    const haystack = `${option.name} ${option.owner} ${option.region} ${option.plan}`.toLowerCase()
    return haystack.includes(term)
  })
})

const context = computed<ComboboxContext>(() => ({
  optionCount: filteredOptions.value.length,
  mode: "single",
  loop: true,
  disabled: false,
  isDisabled: () => false,
}))

const comboboxStore = createComboboxStore({
  context: context.value,
})
const { state: comboboxState } = useComboboxStore(comboboxStore)

const controller = usePopoverController({
  id: "account-combobox",
  role: "listbox",
  modal: false,
  closeOnEscape: true,
  closeOnInteractOutside: true,
  overlayKind: "combobox",
  overlayEntryTraits: {
    ownerId: "vue-combobox",
    priority: 80,
    returnFocus: false,
  },
})

const { triggerRef, contentRef, contentStyle, teleportTarget, updatePosition } = useFloatingPopover(controller, {
  placement: "bottom",
  align: "start",
  gutter: 10,
  lockScroll: false,
  returnFocus: false,
})

const listId = "account-combobox-list"
const activeIndex = computed(() => comboboxState.value.listbox.activeIndex)
const activeOptionId = computed(() => filteredOptions.value[activeIndex.value]?.id ?? null)

watch(
  () => controller.state.value.open,
  (open) => {
    comboboxStore.setOpen(open)
    if (open) {
      nextTick(() => {
        updatePosition()
        if (filteredOptions.value.length && comboboxState.value.listbox.activeIndex === -1) {
          comboboxStore.setState({
            ...comboboxState.value,
            listbox: { ...comboboxState.value.listbox, activeIndex: 0 },
          })
        }
      })
    }
  },
)

watch(
  context,
  (value) => {
    comboboxStore.setContext(value)
  },
  { immediate: true },
)

watch(
  () => filteredOptions.value.length,
  (count) => {
    if (!count) {
      comboboxStore.setState({
        ...comboboxState.value,
        listbox: { ...comboboxState.value.listbox, activeIndex: -1 },
      })
      return
    }
    if (comboboxState.value.listbox.activeIndex >= count) {
      comboboxStore.setState({
        ...comboboxState.value,
        listbox: { ...comboboxState.value.listbox, activeIndex: count - 1 },
      })
    }
  },
)

watch(
  () => query.value,
  (value) => {
    comboboxStore.setFilter(value)
  },
  { immediate: true },
)

function openCombobox(reason: "pointer" | "keyboard") {
  if (!controller.state.value.open) {
    controller.open(reason)
  }
}

function closeCombobox(reason: "pointer" | "keyboard" | "programmatic") {
  if (controller.state.value.open) {
    controller.close(reason)
  }
}

function moveFocus(delta: number) {
  comboboxStore.move(delta)
  nextTick(scrollActiveIntoView)
}

function scrollActiveIntoView() {
  const listEl = contentRef.value
  if (!listEl) return
  const optionId = activeOptionDomId()
  if (!optionId) return
  const target = listEl.querySelector(`[data-option-id="${optionId}"]`)
  if (target instanceof HTMLElement) {
    target.scrollIntoView({ block: "nearest" })
  }
}

function activeOptionDomId(): string | null {
  if (!activeOptionId.value) {
    return null
  }
  return `account-option-${activeOptionId.value}`
}

function handleInputFocus() {
  openCombobox("pointer")
  nextTick(() => inputRef.value?.select())
}

function handleInputKeydown(event: KeyboardEvent) {
  switch (event.key) {
    case "ArrowDown":
      event.preventDefault()
      openCombobox("keyboard")
      moveFocus(1)
      break
    case "ArrowUp":
      event.preventDefault()
      openCombobox("keyboard")
      moveFocus(-1)
      break
    case "Enter":
      if (!controller.state.value.open) {
        openCombobox("keyboard")
        break
      }
      event.preventDefault()
      commitSelection(activeIndex.value)
      break
    case "Escape":
      if (controller.state.value.open) {
        event.preventDefault()
        closeCombobox("keyboard")
      }
      break
    default:
      break
  }
}

function handleOptionPointer(index: number) {
  comboboxStore.setState({
    ...comboboxState.value,
    listbox: { ...comboboxState.value.listbox, activeIndex: index },
  })
}

function handleOptionClick(index: number) {
  commitSelection(index)
}

function commitSelection(index: number) {
  const option = filteredOptions.value[index]
  if (!option) return
  comboboxStore.activate(index)
  selectedAccountId.value = option.id
  query.value = option.name
  closeCombobox("programmatic")
}

function clearSelection() {
  comboboxStore.clearSelection()
  selectedAccountId.value = null
  query.value = ""
  openCombobox("pointer")
}

const selectedAccount = computed(() => accountOptions.find((option) => option.id === selectedAccountId.value) ?? null)

const statusCopy = computed(() => {
  if (!selectedAccount.value) {
    return "No account selected"
  }
  return `${selectedAccount.value.plan} plan - ${selectedAccount.value.region}`
})

const overlaySummary = computed(() => `${controller.state.value.open ? "Open" : "Closed"} - kernel priority 80`)
</script>

<template>
  <article class="combobox-card ui-demo-shell">
    <header class="combobox-card__header">
      <div>
        <p class="combobox-eyebrow">Account lookup</p>
        <h3>Filter 15K+ workspaces without repainting the UI.</h3>
      </div>
      <p class="combobox-status">{{ overlaySummary }}</p>
    </header>

    <div class="combobox-field">
      <label class="combobox-label" for="account-combobox-input">Customer</label>
      <div class="combobox-input-shell" ref="triggerRef">
        <input
          id="account-combobox-input"
          ref="inputRef"
          v-model="query"
          type="text"
          autocomplete="off"
          spellcheck="false"
          role="combobox"
          :aria-controls="listId"
          :aria-expanded="controller.state.value.open ? 'true' : 'false'"
          :aria-activedescendant="activeOptionDomId() ?? undefined"
          class="combobox-input"
          placeholder="Search by workspace, owner, or region"
          @focus="handleInputFocus"
          @keydown="handleInputKeydown"
        />
        <button type="button" class="combobox-clear" @click="clearSelection">Clear</button>
      </div>
      <p class="combobox-hint">{{ statusCopy }}</p>
    </div>

    <Teleport :to="teleportTarget">
      <transition name="combobox-fade">
        <div
          v-if="controller.state.value.open"
          ref="contentRef"
          :style="contentStyle"
          class="combobox-list"
          role="listbox"
          :id="listId"
        >
          <ul>
            <li
              v-for="(option, index) in filteredOptions"
              :key="option.id"
              :id="`account-option-${option.id}`"
              :data-option-id="`account-option-${option.id}`"
              class="combobox-option"
              :class="{
                'combobox-option--active': index === activeIndex,
                'combobox-option--selected': option.id === selectedAccountId,
              }"
              role="option"
              :aria-selected="option.id === selectedAccountId"
              @pointerenter="handleOptionPointer(index)"
              @click="handleOptionClick(index)"
            >
              <div>
                <p class="combobox-option__label">{{ option.name }}</p>
                <p class="combobox-option__meta">{{ option.owner }} / {{ option.region }}</p>
              </div>
              <span class="combobox-option__tag">{{ option.plan }}</span>
            </li>
            <li v-if="!filteredOptions.length" class="combobox-empty">No matches. Try another term.</li>
          </ul>
        </div>
      </transition>
    </Teleport>

    <footer class="combobox-footer">
      <p><strong>Owner</strong> {{ humanOwner }}</p>
      <p><strong>Status</strong> {{ selectedAccount?.status ?? 'n/a' }}</p>
    </footer>
  </article>
</template>

<style scoped>
.combobox-card {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.combobox-card__header {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.combobox-eyebrow {
  margin: 0;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  font-size: 0.75rem;
  color: var(--text-soft);
}

.combobox-card__header h3 {
  margin: 0;
  font-size: 1.4rem;
}

.combobox-status {
  margin: 0;
  font-size: 0.8rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.combobox-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.combobox-label {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-soft);
}

.combobox-input-shell {
  position: relative;
}

.combobox-input {
  width: 100%;
  border-radius: 1rem;
  border: 1px solid var(--glass-border);
  background: rgba(255, 255, 255, 0.82);
  color: var(--text-primary);
  padding: 0.85rem 3.5rem 0.85rem 1rem;
  font-size: 0.95rem;
}

.combobox-input:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent);
}

.combobox-clear {
  position: absolute;
  top: 50%;
  right: 0.5rem;
  transform: translateY(-50%);
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.72);
  color: var(--text-primary);
  border-radius: 999px;
  font-size: 0.72rem;
  padding: 0.25rem 0.75rem;
  cursor: pointer;
}

.combobox-hint {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.combobox-list {
  min-width: min(440px, calc(100vw - 2rem));
  max-height: 320px;
  border-radius: 1rem;
  border: 1px solid var(--glass-border);
  background: rgba(255, 253, 248, 0.98);
  box-shadow: 0 25px 60px rgba(102, 72, 43, 0.18);
  overflow-y: auto;
  padding: 0.35rem 0;
}

.combobox-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0.65rem 1rem;
  cursor: pointer;
}

.combobox-option__label {
  margin: 0;
  font-weight: 600;
}

.combobox-option__meta {
  margin: 0.2rem 0 0;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.combobox-option__tag {
  border-radius: 999px;
  padding: 0.25rem 0.65rem;
  font-size: 0.75rem;
  border: 1px solid rgba(139, 92, 46, 0.16);
  color: var(--text-soft);
}

.combobox-option--active {
  background: rgba(245, 158, 11, 0.12);
}

.combobox-option--selected .combobox-option__label {
  color: var(--accent-strong);
}

.combobox-empty {
  margin: 0;
  padding: 1rem;
  color: var(--text-muted);
  text-align: center;
}

.combobox-footer {
  display: flex;
  gap: 1.25rem;
  font-size: 0.9rem;
  color: var(--text-muted);
}

.combobox-footer p {
  margin: 0;
}

.combobox-footer strong {
  color: var(--text-primary);
  margin-right: 0.5rem;
}

.combobox-fade-enter-active,
.combobox-fade-leave-active {
  transition: opacity 120ms ease, transform 120ms ease;
}

.combobox-fade-enter-from,
.combobox-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
