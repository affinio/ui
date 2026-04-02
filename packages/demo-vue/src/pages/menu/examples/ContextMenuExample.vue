<script setup lang="ts">
import { computed, ref } from "vue"
import {
  UiMenu,
  UiMenuTrigger,
  UiMenuContent,
  UiMenuItem,
  UiMenuLabel,
  UiMenuSeparator,
} from "@affino/menu-vue"

const canvasActions = [
  { label: "Create sticky", detail: "Drop a note at cursor" },
  { label: "Link block", detail: "Connect nodes with arrows" },
  { label: "Summon command palette", detail: "Open overlay", shortcut: "Ctrl+K" },
]

const destructiveActions = [
  { label: "Clear selection", detail: "Deselect everything" },
  { label: "Delete selection", detail: "Remove highlighted nodes", danger: true },
]

const logs = ref<string[]>([])

function pushLog(entry: string) {
  const stamp = new Date().toLocaleTimeString()
  logs.value = [`${entry} at ${stamp}`, ...logs.value].slice(0, 3)
}

const lastLog = computed(() => logs.value[0] ?? "Awaiting your gesture")
</script>

<template>
  <div class="menu-demo-inline">
    <UiMenu>
      <UiMenuTrigger as-child trigger="contextmenu">
        <button class="menu-demo-trigger">Context Menu (Right-click)</button>
      </UiMenuTrigger>
      <UiMenuContent class="menu-playground-panel">
        <UiMenuLabel>Canvas</UiMenuLabel>
        <UiMenuItem
          v-for="action in canvasActions"
          :key="action.label"
          @select="() => pushLog(action.label)"
        >
          <div class="flex flex-col text-left">
            <span class="text-sm font-semibold">{{ action.label }}</span>
            <span class="text-xs text-(--ui-menu-muted)">{{ action.detail }}</span>
          </div>
          <span v-if="action.shortcut" class="text-xs text-(--ui-menu-muted)">{{ action.shortcut }}</span>
        </UiMenuItem>
        <UiMenuSeparator />
        <UiMenuItem
          v-for="action in destructiveActions"
          :key="action.label"
          :danger="action.danger"
          @select="() => pushLog(action.label)"
        >
          <div class="flex flex-col text-left">
            <span class="text-sm font-semibold">{{ action.label }}</span>
            <span class="text-xs text-(--ui-menu-muted)">{{ action.detail }}</span>
          </div>
        </UiMenuItem>
      </UiMenuContent>
    </UiMenu>

    <div class="demo-last-action">
      <span class="demo-last-action__label">Last action</span>
      <span class="demo-last-action__value">{{ lastLog }}</span>
    </div>
  </div>
</template>
