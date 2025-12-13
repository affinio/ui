<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue"
import type { ComponentPublicInstance } from "vue"
import type { MenuController } from "../useMenuController"
import { useMenuProvider, useOptionalSubmenuProvider } from "../context"
import { uid } from "../id"
import AsChildRenderer from "../useAsChild"

const stopPropagationKeys = new Set(["ArrowDown", "ArrowUp", "Home", "End", "Enter", " ", "Space"])

const props = defineProps<{ id?: string; disabled?: boolean; danger?: boolean; asChild?: boolean }>()
const emit = defineEmits<{ (e: "select", payload: { id: string; controller: MenuController }): void }>()

const provider = useMenuProvider()
const submenuBridge = useOptionalSubmenuProvider()
const itemId = props.id ?? uid("ui-menu-item")
const unregister = provider.controller.core.registerItem(itemId, { disabled: props.disabled })

watch(
  () => props.disabled,
  (value) => {
    provider.controller.core.registerItem(itemId, { disabled: value })
  }
)

const bindings = computed(() => {
  void provider.controller.state.value
  return provider.controller.core.getItemProps(itemId)
})

const el = ref<HTMLElement | null>(null)

function bindElement(element: Element | ComponentPublicInstance | null) {
  const target = resolveElement(element)
  el.value = target
}

function resolveElement(element: Element | ComponentPublicInstance | null) {
  if (!element) return null
  if (element instanceof HTMLElement) return element
  if ((element as ComponentPublicInstance).$el instanceof HTMLElement) {
    return (element as ComponentPublicInstance).$el as HTMLElement
  }
  return null
}

function handleFocus() {
  el.value?.scrollIntoView({ block: "nearest" })
}

const isDisabled = computed(() => Boolean(bindings.value["aria-disabled"]))

watch(
  () => provider.controller.state.value.activeItemId,
  (activeId) => {
    if (activeId === itemId && !isDisabled.value) {
      el.value?.focus({ preventScroll: true })
    }
  },
  { flush: "sync" }
)

function emitSelect() {
  emit("select", { id: itemId, controller: provider.controller })
}

function handleClick(event: MouseEvent) {
  if (isDisabled.value) {
    event.preventDefault()
    return
  }
  emitSelect()
  bindings.value.onClick?.(event)
}

function handlePointerEnter(event: PointerEvent) {
  bindings.value.onPointerEnter?.(event)
}

function handleKeydown(event: KeyboardEvent) {
  if (!isDisabled.value && (event.key === "Enter" || event.key === " " || event.key === "Space")) {
    emitSelect()
    bindings.value.onKeyDown?.(event)
    event.preventDefault()
    return
  }
  if (submenuBridge && event.key === "ArrowLeft") {
    event.preventDefault()
    event.stopPropagation()
    submenuBridge.child.controller.close("keyboard")
    submenuBridge.parent.controller.highlight(submenuBridge.child.submenuItemId ?? null)
    submenuBridge.child.controller.triggerRef.value?.focus({ preventScroll: true })
    return
  }
  if (stopPropagationKeys.has(event.key)) {
    event.stopPropagation()
  }
  bindings.value.onKeyDown?.(event)
}

onBeforeUnmount(() => {
  unregister()
})

const itemProps = computed(() => ({
  class: ["ui-menu-item", { "is-danger": props.danger }],
  id: bindings.value.id,
  role: bindings.value.role,
  tabindex: bindings.value.tabIndex,
  "data-state": bindings.value["data-state"],
  "aria-disabled": bindings.value["aria-disabled"],
  onFocus: handleFocus,
  onPointerenter: handlePointerEnter,
  onClick: handleClick,
  onKeydown: handleKeydown,
}))

const asChildItemProps = computed(() => ({
  ...itemProps.value,
  ref: bindElement,
}))
</script>

<template>
  <AsChildRenderer
    v-if="props.asChild"
    component-label="UiMenuItem"
    :forwarded-props="asChildItemProps"
  >
    <slot />
  </AsChildRenderer>
  <div v-else :ref="bindElement" v-bind="itemProps">
    <slot />
  </div>
</template>
