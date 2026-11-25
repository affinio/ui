<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue"
import type { MenuController } from "../useMenuController"
import { provideMenuBar } from "../menuBarContext"

const menus = shallowRef<MenuController[]>([])
const activeMenuId = ref<string | null>(null)
const focusedMenuId = ref<string | null>(null)
let keepFocusOnTriggerFor: string | null = null
let pointerCloseTimer: ReturnType<typeof setTimeout> | null = null

function cancelPointerClose(): void {
  if (pointerCloseTimer !== null) {
    clearTimeout(pointerCloseTimer)
    pointerCloseTimer = null
  }
}

function getRootMenuId(target: EventTarget | null): string | undefined {
  return target instanceof HTMLElement
    ? target.closest<HTMLElement>("[data-ui-root-menu-id]")?.dataset.uiRootMenuId
    : undefined
}

function handleDocumentPointerOver(event: PointerEvent): void {
  if (event.pointerType && event.pointerType !== "mouse") return
  if (getRootMenuId(event.target) === activeMenuId.value) cancelPointerClose()
}

onMounted(() => document.addEventListener("pointerover", handleDocumentPointerOver, true))
onBeforeUnmount(() => {
  document.removeEventListener("pointerover", handleDocumentPointerOver, true)
  cancelPointerClose()
})

function open(controller: MenuController, reason: "pointer" | "keyboard" | "programmatic" = "programmatic", preserveFocus = false): void {
  cancelPointerClose()
  if (preserveFocus) keepFocusOnTriggerFor = controller.id
  else if (reason !== "keyboard") keepFocusOnTriggerFor = null
  const previous = menus.value.find((menu) => menu.id === activeMenuId.value && menu.id !== controller.id)
  activeMenuId.value = controller.id
  previous?.close("programmatic")
  if (!controller.state.value.open) controller.open(reason)
}

function close(controller: MenuController, reason: "pointer" | "keyboard" | "programmatic" = "programmatic"): void {
  cancelPointerClose()
  controller.close(reason)
  if (activeMenuId.value === controller.id) activeMenuId.value = null
}

function register(controller: MenuController): () => void {
  if (!menus.value.some((menu) => menu.id === controller.id)) menus.value = [...menus.value, controller]
  const stop = watch(
    () => controller.state.value.open,
    (isOpen) => {
      if (isOpen) {
        const previous = menus.value.find((menu) => menu.id === activeMenuId.value && menu.id !== controller.id)
        activeMenuId.value = controller.id
        previous?.close("programmatic")
      } else if (activeMenuId.value === controller.id) {
        activeMenuId.value = null
      }
    },
    { flush: "sync" },
  )
  if (controller.state.value.open) open(controller)
  return () => {
    stop()
    menus.value = menus.value.filter((menu) => menu.id !== controller.id)
    if (activeMenuId.value === controller.id) activeMenuId.value = null
    if (focusedMenuId.value === controller.id) focusedMenuId.value = menus.value[0]?.id ?? null
  }
}

function toggle(controller: MenuController): void {
  if (activeMenuId.value === controller.id && controller.state.value.open) close(controller, "pointer")
  else open(controller, "pointer")
}

function pointerEnter(controller: MenuController, event: PointerEvent): void {
  if (event.pointerType && event.pointerType !== "mouse") return
  cancelPointerClose()
  if (activeMenuId.value && activeMenuId.value !== controller.id) {
    const active = menus.value.find((menu) => menu.id === activeMenuId.value)
    const focusedMenuId = typeof document !== "undefined"
      ? document.activeElement?.closest<HTMLElement>("[data-ui-root-menu-id]")?.dataset.uiRootMenuId
      : undefined
    if (active && focusedMenuId === active.id) active.triggerRef.value?.focus({ preventScroll: true })
    open(controller, "pointer", true)
  }
}

function pointerLeave(event: PointerEvent): void {
  if (event.pointerType && event.pointerType !== "mouse") return
  const activeId = activeMenuId.value
  if (!activeId || getRootMenuId(event.relatedTarget) === activeId) return
  cancelPointerClose()
  pointerCloseTimer = setTimeout(() => {
    pointerCloseTimer = null
    const active = menus.value.find((menu) => menu.id === activeId)
    if (active && activeMenuId.value === activeId) close(active, "pointer")
  }, 140)
}

function focus(controller: MenuController): void {
  focusedMenuId.value = controller.id
  if (activeMenuId.value && activeMenuId.value !== controller.id) open(controller, "keyboard")
}

function moveFocus(controller: MenuController, direction: -1 | 1 | "first" | "last"): void {
  if (!menus.value.length) return
  const currentIndex = menus.value.findIndex((menu) => menu.id === controller.id)
  const nextIndex = direction === "first"
    ? 0
    : direction === "last"
      ? menus.value.length - 1
      : (currentIndex + direction + menus.value.length) % menus.value.length
  const next = menus.value[nextIndex]!
  focusedMenuId.value = next.id
  if (activeMenuId.value && activeMenuId.value !== next.id) keepFocusOnTriggerFor = next.id
  next.triggerRef.value?.focus({ preventScroll: true })
  if (activeMenuId.value) open(next, "keyboard")
}

function shouldFocusPanel(controller: MenuController): boolean {
  if (keepFocusOnTriggerFor !== controller.id) return true
  keepFocusOnTriggerFor = null
  return false
}

function tabIndex(controller: MenuController): 0 | -1 {
  const tabStopId = focusedMenuId.value ?? menus.value[0]?.id
  return controller.id === tabStopId ? 0 : -1
}

provideMenuBar({ activeMenuId, register, open, toggle, close, pointerEnter, focus, pointerLeave, moveFocus, shouldFocusPanel, tabIndex })
</script>

<template>
  <div class="ui-menu-bar" role="menubar" aria-orientation="horizontal" @pointerleave="pointerLeave">
    <slot />
  </div>
</template>
