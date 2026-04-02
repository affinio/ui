<script setup lang="ts">
import { computed, ref } from "vue"
import type { OverlayKind } from "@affino/overlay-kernel"
import {
  UiMenu,
  UiMenuTrigger,
  UiMenuContent,
  UiMenuItem,
  UiMenuLabel,
  UiMenuSeparator,
} from "@affino/menu-vue"

const primaryActions = [
  { label: "Edit headline", description: "Tweak copy and CTA pairs", shortcut: "E" },
  { label: "Duplicate", description: "Clone layout and preserve bindings", shortcut: "D" },
  { label: "Share preview", description: "Generate signed review links", shortcut: "S" },
]

const secondaryActions = [
  { label: "Archive", description: "Freeze analytics without deleting", shortcut: "A" },
  { label: "Delete", description: "Remove project forever", shortcut: "Cmd+Del", danger: true },
]

const lastAction = ref("None yet")

const overlayKind = ref<OverlayKind>("menu")
const modalLayer = ref(false)
const overlayPriority = ref(70)

const menuOptions = computed(() => ({
  overlayKind: overlayKind.value,
  overlayEntryTraits: {
    modal: modalLayer.value,
    trapsFocus: modalLayer.value,
    blocksPointerOutside: modalLayer.value,
    priority: overlayPriority.value,
    ownerId: modalLayer.value ? "simple-menu-modal" : null,
  },
}))

const menuInstanceKey = computed(
  () => `${overlayKind.value}-${modalLayer.value ? "modal" : "inline"}-${overlayPriority.value}`,
)

function handleSelect(label: string) {
  lastAction.value = label
}
</script>

<template>
  <div class="menu-demo-inline">
    <UiMenu :key="menuInstanceKey" :options="menuOptions">
      <UiMenuTrigger as-child>
        <button class="menu-demo-trigger">Open Vue menu</button>
      </UiMenuTrigger>

      <UiMenuContent class="menu-playground-panel">
        <UiMenuLabel>Project</UiMenuLabel>
        <UiMenuSeparator />

        <UiMenuItem
          v-for="action in primaryActions"
          :key="action.label"
          @select="() => handleSelect(action.label)"
        >
          <div class="flex flex-1 flex-col text-left">
            <span class="text-sm font-semibold">{{ action.label }}</span>
            <span class="text-xs text-(--ui-menu-muted)">
              {{ action.description }}
            </span>
          </div>
          <span class="menu-shortcut">{{ action.shortcut }}</span>
        </UiMenuItem>

        <UiMenuSeparator />

        <UiMenuItem
          v-for="action in secondaryActions"
          :key="action.label"
          :danger="action.danger"
          @select="() => handleSelect(action.label)"
        >
          <div class="flex flex-1 flex-col text-left">
            <span class="text-sm font-semibold">{{ action.label }}</span>
            <span class="text-xs text-(--ui-menu-muted)">
              {{ action.description }}
            </span>
          </div>
          <span class="menu-shortcut">{{ action.shortcut }}</span>
        </UiMenuItem>
      </UiMenuContent>
    </UiMenu>

    <dl class="demo-last-action">
      <dt class="demo-last-action__label">Last action</dt>
      <dd class="demo-last-action__value">{{ lastAction }}</dd>
    </dl>

    <section class="overlay-lab" aria-label="Overlay kernel controls">
      <div class="overlay-lab__control">
        <label for="simple-menu-kind">Overlay kind</label>
        <select id="simple-menu-kind" v-model="overlayKind">
          <option value="menu">menu</option>
          <option value="context-menu">context-menu</option>
          <option value="surface">surface</option>
        </select>
      </div>

      <div class="overlay-lab__control">
        <label for="simple-menu-priority">Priority · {{ overlayPriority }}</label>
        <input
          id="simple-menu-priority"
          v-model.number="overlayPriority"
          type="range"
          min="10"
          max="120"
        />
      </div>

      <label class="overlay-lab__toggle">
        <input type="checkbox" v-model="modalLayer" />
        <span>Modal layer (locks pointer + focus)</span>
      </label>

      <p class="overlay-lab__summary">
        ID · <strong>{{ menuOptions.overlayEntryTraits?.ownerId ?? 'inline-flow' }}</strong>
        · priority <strong>{{ menuOptions.overlayEntryTraits?.priority ?? 'default' }}</strong>
      </p>
    </section>
  </div>
</template>

<style scoped>
.overlay-lab {
  width: 100%;
  display: grid;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-radius: 1.25rem;
  border: 1px solid var(--glass-border);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
}

.overlay-lab__control {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.overlay-lab__control select,
.overlay-lab__control input[type="range"] {
  width: 100%;
  accent-color: var(--accent);
  background: color-mix(in srgb, var(--surface-alt) 75%, transparent);
  border-radius: 0.85rem;
  border: 1px solid var(--glass-border);
  padding: 0.35rem 0.65rem;
  color: var(--text-primary);
  font-weight: 600;
}

.overlay-lab__toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.overlay-lab__toggle input {
  width: 1.1rem;
  height: 1.1rem;
  accent-color: var(--accent);
}

.overlay-lab__summary {
  margin: 0;
  font-size: 0.82rem;
  color: var(--text-soft);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.overlay-lab__summary strong {
  color: var(--text-primary);
}
</style>
