<script setup lang="ts">
import { Teleport, computed, nextTick, onBeforeUnmount, onMounted, ref, watch, useAttrs } from "vue"
import type { PositionResult } from "@affino/menu-core"
import type { MenuProviderValue } from "../context"
import { useMenuPointerHandlers } from "../useMenuPointerHandlers"
import { useMenuFocus } from "../useMenuFocus"
import { useMenuPositioning } from "../useMenuPositioning"
import { toRect } from "../dom"
import { useSubmenuBridge } from "../useSubmenuBridge"
import { ensureOverlayHost } from "@affino/overlay-host"

const MENU_HOST_ID = "affino-menu-host"
const MENU_HOST_ATTRIBUTE = "data-affino-menu-host"

const props = defineProps<{
  provider: MenuProviderValue
  variant: "menu" | "submenu"
  teleportTo?: string
  className?: string
}>()

const root = ref<HTMLElement | null>(null)
const bindings = computed(() => props.provider.controller.core.getPanelProps())
const pointerHandlers = useMenuPointerHandlers(props.provider)
const submenuBridge = useSubmenuBridge(props.variant)
const panelPointer = pointerHandlers.makePanelHandlers({ bindings, bridge: submenuBridge })
const focus = useMenuFocus(props.provider.controller.panelRef)
const lastPlacement = ref<PositionResult["placement"] | null>(null)
const isOpen = computed(() => props.provider.controller.state.value.open)
const shouldRender = ref(isOpen.value)
const panelState = ref<"open" | "closed">(isOpen.value ? "open" : "closed")
const resolvedSide = computed<PositionResult["placement"]>(() =>
  lastPlacement.value ?? (props.variant === "submenu" ? "right" : "bottom")
)
const resolvedMotion = computed(() => motionFromSide(resolvedSide.value))
defineOptions({ inheritAttrs: false })
const attrs = useAttrs()

const syncSubmenuGeometry = () => {
  if (props.variant !== "submenu" || !submenuBridge) {
    return
  }
  const triggerRect = toRect(props.provider.controller.triggerRef.value)
  props.provider.controller.setTriggerRect?.(triggerRect ?? null)
  const panelRect = toRect(root.value)
  props.provider.controller.setPanelRect?.(panelRect ?? null)
}

const preferredPlacement: PositionResult["placement"] = props.variant === "submenu" ? "right" : "bottom"

const updatePosition = useMenuPositioning(props.provider.controller, {
  placement: preferredPlacement,
  afterUpdate: (position) => {
    lastPlacement.value = position.placement
    syncSubmenuGeometry()
  },
})

const teleportTarget = computed(() => props.teleportTo ?? getMenuOverlayHost() ?? "body")
const parentMenuId = props.provider.parentController?.id ?? ""

const refreshGeometry = () => {
  syncSubmenuGeometry()
  updatePosition()
}

const playOpenAnimation = () => {
  panelState.value = "closed"
  if (typeof window === "undefined") {
    panelState.value = "open"
    return
  }
  window.requestAnimationFrame(() => {
    panelState.value = "open"
  })
}

watch(
  isOpen,
  async (open) => {
    if (open) {
      shouldRender.value = true
      panelState.value = "closed"
      await nextTick()
      props.provider.controller.panelRef.value = root.value
      playOpenAnimation()
      refreshGeometry()
      if (props.variant === "submenu") {
        focus.focusFirst()
      } else {
        root.value?.focus({ preventScroll: true })
      }
    } else {
      if (props.provider.controller.panelRef.value === root.value) {
        props.provider.controller.panelRef.value = null
        props.provider.controller.setAnchor(null)
      }
      panelState.value = "closed"
      shouldRender.value = false
    }
  }
)

watch(
  () => props.provider.controller.anchorRef.value,
  () => {
    if (isOpen.value) {
      refreshGeometry()
    }
  }
)

onMounted(() => {
  if (isOpen.value) {
    refreshGeometry()
  }
})

onBeforeUnmount(() => {
  if (props.provider.controller.panelRef.value === root.value) {
    props.provider.controller.panelRef.value = null
  }
})

function handlePointerEnter(event: PointerEvent) {
  panelPointer.onPointerEnter(event)
}

function handlePointerLeave(event: PointerEvent) {
  if (props.variant !== "submenu") {
    return
  }
  panelPointer.onPointerLeave(event)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Tab") {
    event.preventDefault()
    if (props.variant === "submenu") {
      event.shiftKey ? focus.focusLast() : focus.focusFirst()
      return
    }
    props.provider.controller.close("keyboard")
    props.provider.controller.setAnchor(null)
    props.provider.controller.triggerRef.value?.focus()
    return
  }
  bindings.value.onKeyDown?.(event)
}

function motionFromSide(side: PositionResult["placement"]) {
  switch (side) {
    case "top":
      return "from-top"
    case "left":
      return "from-left"
    case "right":
      return "from-right"
    case "bottom":
    default:
      return "from-bottom"
  }
}

function getMenuOverlayHost(): HTMLElement | null {
  return ensureOverlayHost({ id: MENU_HOST_ID, attribute: MENU_HOST_ATTRIBUTE })
}
</script>

<template>
  <Teleport :to="teleportTarget">
    <div
      v-if="shouldRender"
      ref="root"
      :class="props.className ?? (props.variant === 'submenu' ? 'ui-submenu-content' : 'ui-menu-content')"
      :id="bindings.id"
      role="menu"
      tabindex="-1"
      data-ui-menu-panel="true"
      :data-state="panelState"
      :data-side="resolvedSide"
      :data-motion="resolvedMotion"
      :data-ui-root-menu-id="props.provider.rootId"
      :data-ui-menu-id="props.provider.controller.id"
      :data-ui-parent-menu-id="parentMenuId"
      v-bind="attrs"
      @pointerenter="handlePointerEnter"
      @pointerleave="handlePointerLeave"
      @keydown="handleKeydown"
    >
      <slot />
    </div>
  </Teleport>
</template>
