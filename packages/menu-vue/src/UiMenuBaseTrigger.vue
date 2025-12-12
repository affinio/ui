<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue"
import type { ComponentPublicInstance, ComputedRef } from "vue"
import type { ItemProps, TriggerProps } from "@affino/menu-core"
import type { MenuController } from "./useMenuController"
import type { MenuProviderValue, SubmenuProviderValue } from "./context"
import AsChildRenderer from "./useAsChild"
import { useMenuPointerHandlers } from "./useMenuPointerHandlers"
import { useSubmenuBridge } from "./useSubmenuBridge"

const stopPropagationKeys = new Set(["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End", "Enter", " ", "Space"])

type TriggerMode = "click" | "contextmenu" | "both"

const props = defineProps<{
  provider: MenuProviderValue
  variant: "menu" | "submenu"
  asChild?: boolean
  triggerMode?: TriggerMode
  showArrow?: boolean
  componentLabel: string
}>()

const el = ref<HTMLElement | null>(null)
const triggerMode = computed<TriggerMode>(() => {
  if (props.triggerMode) return props.triggerMode
  return props.variant === "menu" ? "click" : "both"
})
const openOnClick = computed(() => triggerMode.value === "click" || triggerMode.value === "both")
const openOnContext = computed(() => triggerMode.value === "contextmenu" || triggerMode.value === "both")

const submenuBridge = useSubmenuBridge(props.variant)
const targetController = submenuBridge ? submenuBridge.child.controller : props.provider.controller
const parentController = submenuBridge?.parent.controller ?? props.provider.parentController
const submenuItemId = submenuBridge?.child.submenuItemId ?? props.provider.submenuItemId ?? null

const triggerBindings = computed(() => targetController.core.getTriggerProps())
const parentBindings = computed(() => {
  if (props.variant !== "submenu" || !parentController || !submenuItemId) {
    return null
  }
  void parentController.state.value
  return parentController.core.getItemProps(submenuItemId)
})

const pointerHandlers = useMenuPointerHandlers(props.provider)
const triggerPointer = pointerHandlers.makeTriggerHandlers({ bindings: triggerBindings, bridge: submenuBridge })
const disposeSubmenuLifecycle = setupSubmenuLifecycle({
  isSubmenu: props.variant === "submenu",
  parentController,
  submenuItemId,
  triggerRef: el,
})

function bind(element: Element | ComponentPublicInstance | null) {
  const target = resolveElement(element)
  el.value = target
  props.provider.controller.triggerRef.value = target
}

onBeforeUnmount(() => {
  disposeSubmenuLifecycle()
  if (props.provider.controller.triggerRef.value === el.value) {
    props.provider.controller.triggerRef.value = null
  }
})

const elementBindings = computed(() => createElementBindings(props.variant, triggerBindings, parentBindings))
const eventHandlers = createTriggerEventHandlers({
  variant: props.variant,
  provider: props.provider,
  targetController,
  triggerBindings,
  parentBindings,
  pointer: triggerPointer,
  openOnClick,
  openOnContext,
  submenuBridge,
})

const triggerProps = computed(() => ({
  class: props.variant === "submenu" ? "ui-submenu-trigger" : "ui-menu-trigger",
  id: elementBindings.value.id,
  role: elementBindings.value.role,
  tabindex: elementBindings.value.tabIndex,
  "data-state": elementBindings.value.dataState,
  "aria-disabled": elementBindings.value.ariaDisabled,
  "aria-haspopup": elementBindings.value.ariaHaspopup,
  "aria-expanded": elementBindings.value.ariaExpanded,
  "aria-controls": elementBindings.value.ariaControls,
  "data-ui-menu-trigger": "true",
  "data-ui-menu-id": targetController.id,
  "data-ui-root-menu-id": props.provider.rootId,
  onPointerenter: props.variant === "submenu" ? eventHandlers.handlePointerEnter : undefined,
  onPointerleave: props.variant === "submenu" ? eventHandlers.handlePointerLeave : undefined,
  onClick: props.variant === "menu" ? (openOnClick.value ? eventHandlers.handleClick : undefined) : eventHandlers.handleClick,
  onContextmenu: props.variant === "menu" ? (openOnContext.value ? eventHandlers.handleContextMenu : undefined) : undefined,
  onKeydown: eventHandlers.handleKeydown,
}))

const asChildBindings = computed(() => {
  const { class: _class, ...rest } = triggerProps.value
  return {
    ...rest,
    ref: bind,
  }
})

interface TriggerPointerHandlers {
  onPointerEnter: (event: PointerEvent) => void
  onPointerLeave: (event: PointerEvent) => void
}

function resolveElement(element: Element | ComponentPublicInstance | null) {
  if (!element) return null
  if (element instanceof HTMLElement) return element
  if ((element as ComponentPublicInstance | null)?.$el instanceof HTMLElement) {
    return (element as ComponentPublicInstance).$el as HTMLElement
  }
  return null
}

function setupSubmenuLifecycle(options: {
  isSubmenu: boolean
  parentController: MenuController | null
  submenuItemId: string | null
  triggerRef: typeof el
}) {
  if (!options.isSubmenu || !options.parentController || !options.submenuItemId) {
    return () => {}
  }

  const unregister = options.parentController.core.registerItem(options.submenuItemId)
  const stopWatch = watch(
    () => options.parentController?.state.value.activeItemId,
    (activeId) => {
      if (activeId === options.submenuItemId) {
        options.triggerRef.value?.focus({ preventScroll: true })
      }
    },
    { flush: "sync" }
  )

  return () => {
    unregister?.()
    stopWatch()
  }
}

function createElementBindings(
  variant: "menu" | "submenu",
  triggerBindings: ComputedRef<TriggerProps>,
  parentBindings: ComputedRef<ItemProps | null>
) {
  const base = triggerBindings.value
  if (variant !== "submenu" || !parentBindings.value) {
    return {
      id: base.id,
      role: base.role,
      tabIndex: base.tabIndex,
      dataState: undefined,
      ariaDisabled: undefined,
      ariaHaspopup: base["aria-haspopup"],
      ariaExpanded: base["aria-expanded"],
      ariaControls: base["aria-controls"],
    }
  }

  return {
    id: parentBindings.value.id,
    role: parentBindings.value.role,
    tabIndex: parentBindings.value.tabIndex,
    dataState: parentBindings.value["data-state"],
    ariaDisabled: parentBindings.value["aria-disabled"],
    ariaHaspopup: base["aria-haspopup"],
    ariaExpanded: base["aria-expanded"],
    ariaControls: base["aria-controls"],
  }
}

function createTriggerEventHandlers(options: {
  variant: "menu" | "submenu"
  provider: MenuProviderValue
  targetController: MenuController
  triggerBindings: ComputedRef<TriggerProps>
  parentBindings: ComputedRef<ItemProps | null>
  pointer: TriggerPointerHandlers
  openOnClick: ComputedRef<boolean>
  openOnContext: ComputedRef<boolean>
  submenuBridge: SubmenuProviderValue | null
}) {
  const ancestorBridge = options.submenuBridge?.parentSubmenu ?? null

  const resetAnchor = () => options.provider.controller.setAnchor(null)
  const setAnchorFromEvent = (event: MouseEvent) => {
    options.provider.controller.setAnchor({ x: event.clientX, y: event.clientY, width: 0, height: 0 })
  }

  const handleClick = (event: MouseEvent) => {
    if (options.variant === "menu" && !options.openOnClick.value) return
    options.targetController.recordPointer?.({ x: event.clientX, y: event.clientY })
    if (options.variant === "menu") {
      resetAnchor()
    }
    options.triggerBindings.value.onClick?.(event)
  }

  const handleContextMenu = (event: MouseEvent) => {
    if (options.variant !== "menu") {
      options.targetController.recordPointer?.({ x: event.clientX, y: event.clientY })
      options.triggerBindings.value.onClick?.(event)
      return
    }
    if (!options.openOnContext.value) return
    event.preventDefault()
    if (options.provider.controller.state.value.open) {
      options.provider.controller.close("pointer")
      requestAnimationFrame(() => {
        setAnchorFromEvent(event)
        options.provider.controller.open("pointer")
      })
      return
    }
    setAnchorFromEvent(event)
    options.provider.controller.open("pointer")
  }

  const handleKeydown = (event: KeyboardEvent) => {
    if (options.variant === "menu") {
      resetAnchor()
    }

    if (
      options.variant === "submenu" &&
      event.key === "ArrowLeft" &&
      !options.targetController.state.value.open &&
      ancestorBridge
    ) {
      event.preventDefault()
      ancestorBridge.child.controller.close("keyboard")
      ancestorBridge.parent.controller.highlight(ancestorBridge.child.submenuItemId ?? null)
      ancestorBridge.child.controller.triggerRef.value?.focus({ preventScroll: true })
      return
    }

    if (stopPropagationKeys.has(event.key)) {
      event.stopPropagation()
    }

    if (options.variant === "submenu" && options.parentBindings.value) {
      options.parentBindings.value.onKeyDown?.(event)
    }

    options.triggerBindings.value.onKeyDown?.(event)
  }

  const handlePointerEnter = (event: PointerEvent) => {
    if (options.variant === "submenu" && options.parentBindings.value) {
      options.parentBindings.value.onPointerEnter?.(event)
    }
    options.pointer.onPointerEnter(event)
  }

  const handlePointerLeave = (event: PointerEvent) => {
    options.pointer.onPointerLeave(event)
  }

  return {
    handleClick,
    handleContextMenu,
    handleKeydown,
    handlePointerEnter,
    handlePointerLeave,
  }
}
</script>

<template>
  <AsChildRenderer
    v-if="props.asChild"
    :component-label="props.componentLabel"
    :forwarded-props="asChildBindings"
  >
    <slot />
  </AsChildRenderer>
  <button v-else type="button" :ref="bind" v-bind="triggerProps">
    <slot />
    <span v-if="props.variant === 'submenu' || props.showArrow" class="ui-submenu-arrow">▶</span>
  </button>
</template>
