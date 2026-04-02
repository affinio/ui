<script setup lang="ts">
import { ref } from "vue"
import {
  UiMenu,
  UiMenuTrigger,
  UiMenuContent,
  UiMenuItem,
  UiMenuLabel,
  UiMenuSeparator,
  UiSubMenu,
  UiSubMenuTrigger,
  UiSubMenuContent,
} from "@affino/menu-vue"

const stacks = [
  {
    label: "Analytics",
    code: "AN",
    note: "Funnels, retention, pulse",
    items: ["Sessions", "Funnel analysis", "Cohort compare", "Pulse alerts"],
  },
  {
    label: "Automation",
    code: "AU",
    note: "Playbooks and jobs",
    items: ["Create schedule", "Sync segments", "Trigger webhooks"],
  },
  {
    label: "Access",
    code: "AC",
    note: "Teams, roles, audit",
    items: ["Invite teammate", "Promote to admin", "Transfer ownership"],
  },
]

const lastSelection = ref("Waiting for highlight")

function handleSelect(label: string) {
  lastSelection.value = label
}
</script>

<template>
  <div class="menu-demo-inline">
    <UiMenu :options="{ openDelay: 60, closeDelay: 140 }">
      <UiMenuTrigger as-child>
        <button class="menu-demo-trigger">Browse stacks</button>
      </UiMenuTrigger>
      <UiMenuContent class="menu-playground-panel">
        <UiMenuLabel>Stacks</UiMenuLabel>
        <UiMenuSeparator />
        <UiSubMenu v-for="stack in stacks" :key="stack.label">
          <UiSubMenuTrigger>
            <div class="flex flex-1 items-center gap-3 text-left">
              <span class="stack-code-pill">{{ stack.code }}</span>
              <div class="flex flex-col">
                <span class="text-sm font-semibold">{{ stack.label }}</span>
                <span class="text-xs text-(--ui-menu-muted)">{{ stack.note }}</span>
              </div>
            </div>
          </UiSubMenuTrigger>
          <UiSubMenuContent class="menu-playground-panel">
            <UiMenuItem
              v-for="item in stack.items"
              :key="item"
              @select="() => handleSelect(item)"
            >
              <span class="text-sm font-semibold">{{ item }}</span>
              <span class="text-xs text-(--ui-menu-muted)">Enter</span>
            </UiMenuItem>
          </UiSubMenuContent>
        </UiSubMenu>
      </UiMenuContent>
    </UiMenu>

    <div class="demo-last-action">
      <span class="demo-last-action__label">Last action</span>
      <span class="demo-last-action__value">{{ lastSelection }}</span>
    </div>
  </div>
</template>
