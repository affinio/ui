<script setup lang="ts" generic="T extends string | number">
import { computed, nextTick, onScopeDispose, ref, watch } from "vue"
import { createListboxState, moveListboxFocus } from "@affino/listbox-core"
import { useFloatingPopover, usePopoverController } from "@affino/popover-vue"
import type { SelectOption } from "./types"

defineOptions({ inheritAttrs: false })
const props = withDefaults(defineProps<{
  modelValue?: T | null
  options: SelectOption<T>[]
  disabled?: boolean
  placeholder?: string
  ariaLabel?: string
  ariaLabelledby?: string
  size?: "default" | "compact"
  open?: boolean
}>(), { disabled: false, placeholder: "Select an option", size: "default" })
const emit = defineEmits<{
  "update:modelValue": [value: T | null]
  "update:open": [open: boolean]
}>()

const id = `affino-select-${Math.random().toString(36).slice(2)}`
const triggerRef = ref<HTMLElement | null>(null)
const contentRef = ref<HTMLElement | null>(null)
const activeIndex = ref(-1)
const typeahead = ref("")
let typeaheadTimer: ReturnType<typeof setTimeout> | undefined
const controller = usePopoverController({ role: "listbox", closeOnEscape: true, closeOnInteractOutside: true, overlayKind: "popover" }, {
  onOpen() { if (props.open !== true) emit("update:open", true) },
  onClose() { if (props.open !== false) emit("update:open", false) },
})
const floating = useFloatingPopover(controller, { placement: "bottom", align: "start", gutter: 4, zIndex: 3000, closeOnInteractOutside: true, returnFocus: false, lockScroll: false })
const popupStyle = computed(() => ({ ...floating.contentStyle.value, minWidth: `${triggerRef.value?.getBoundingClientRect().width ?? 0}px` }))
watch(triggerRef, value => { floating.triggerRef.value = value })
watch(contentRef, value => { floating.contentRef.value = value })
watch(() => props.open, value => { if (value !== undefined && value !== controller.state.value.open) value ? controller.open("programmatic") : controller.close("programmatic") }, { immediate: true })
watch(() => props.disabled, value => { if (value && controller.state.value.open) controller.close("programmatic") })
const selectedIndex = computed(() => props.options.findIndex(option => option.value === props.modelValue))
const selectedOption = computed(() => selectedIndex.value < 0 ? undefined : props.options[selectedIndex.value])
const popoverId = `${id}-options`
const activeDescendant = computed(() => controller.state.value.open && activeIndex.value >= 0 ? `${id}-option-${activeIndex.value}` : undefined)

function initializeActive() {
  const selected = selectedIndex.value
  if (selected >= 0 && !props.options[selected]?.disabled) { activeIndex.value = selected; return }
  activeIndex.value = props.options.findIndex(option => !option.disabled)
}
function open() { if (props.disabled) return; initializeActive(); controller.open("pointer") }
function close() { controller.close("pointer") }
function move(delta: number) {
  const state = moveListboxFocus({ state: createListboxState({ activeIndex: activeIndex.value }), context: { optionCount: props.options.length, isDisabled: index => props.options[index]?.disabled ?? false }, delta })
  activeIndex.value = state.activeIndex
}
function edge(index: number) {
  if (index === props.options.length - 1) {
    for (let i = props.options.length - 1; i >= 0; i -= 1) if (!props.options[i]?.disabled) { activeIndex.value = i; return }
  } else {
    activeIndex.value = props.options.findIndex(option => !option.disabled)
  }
}
function commit(index: number) {
  const option = props.options[index]
  if (props.disabled || !option || option.disabled) return
  if (option.value !== props.modelValue) emit("update:modelValue", option.value)
  close()
  void nextTick(() => triggerRef.value?.focus({ preventScroll: true }))
}
function onKeydown(event: KeyboardEvent) {
  if (props.disabled) return
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault()
    if (!controller.state.value.open) open()
    else move(event.key === "ArrowDown" ? 1 : -1)
  } else if (event.key === "Home" && controller.state.value.open) { event.preventDefault(); edge(0) }
  else if (event.key === "End" && controller.state.value.open) { event.preventDefault(); edge(props.options.length - 1) }
  else if ((event.key === "Enter" || event.key === " ") && controller.state.value.open) { event.preventDefault(); commit(activeIndex.value) }
  else if ((event.key === "Enter" || event.key === " ") && !controller.state.value.open) { event.preventDefault(); open() }
  else if (event.key === "Escape" && controller.state.value.open) { event.preventDefault(); close() }
  else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
    typeahead.value += event.key.toLocaleLowerCase()
    if (typeaheadTimer) clearTimeout(typeaheadTimer)
    typeaheadTimer = setTimeout(() => { typeahead.value = "" }, 700)
    const start = controller.state.value.open ? activeIndex.value + 1 : 0
    const ordered = [...props.options.slice(start), ...props.options.slice(0, start)]
    const match = ordered.find(option => !option.disabled && option.label.toLocaleLowerCase().startsWith(typeahead.value))
    if (match) {
      const index = props.options.indexOf(match)
      if (!controller.state.value.open) open()
      activeIndex.value = index
    }
  }
}
watch(() => props.options, () => { if (activeIndex.value >= props.options.length || props.options[activeIndex.value]?.disabled) initializeActive() }, { deep: true })
onScopeDispose(() => { if (typeaheadTimer) clearTimeout(typeaheadTimer) })
</script>

<template>
  <button
    ref="triggerRef"
    v-bind="$attrs"
    :id="id"
    type="button"
    role="combobox"
    aria-haspopup="listbox"
    :aria-label="ariaLabel"
    :aria-labelledby="ariaLabelledby"
    :aria-expanded="controller.state.value.open"
    :aria-controls="popoverId"
    :aria-activedescendant="activeDescendant"
    :disabled="disabled"
    :data-state="controller.state.value.open ? 'open' : 'closed'"
    :data-size="size"
    class="affino-select__trigger"
    @click="controller.state.value.open ? close() : open()"
    @keydown="onKeydown"
  >
    <span class="affino-select__value" :data-placeholder="!selectedOption || undefined">{{ selectedOption?.label ?? placeholder }}</span>
    <span class="affino-select__chevron" aria-hidden="true">▾</span>
  </button>
  <Teleport :to="floating.teleportTarget.value || 'body'">
    <div
      v-if="controller.state.value.open"
      :id="popoverId"
      ref="contentRef"
      role="listbox"
      :aria-labelledby="ariaLabelledby || undefined"
      :aria-label="ariaLabelledby ? undefined : ariaLabel"
      :style="popupStyle"
      class="affino-select__popup"
      data-affino-select-popup
    >
      <div
        v-for="(option, index) in options"
        :id="`${id}-option-${index}`"
        :key="index"
        role="option"
        :aria-selected="option.value === modelValue"
        :aria-disabled="option.disabled || undefined"
        :data-active="index === activeIndex || undefined"
        :data-selected="option.value === modelValue || undefined"
        class="affino-select__option"
        @pointermove="!option.disabled && (activeIndex = index)"
        @click="commit(index)"
      >{{ option.label }}</div>
    </div>
  </Teleport>
</template>
