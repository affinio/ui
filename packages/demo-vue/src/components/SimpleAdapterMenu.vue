<script setup lang="ts">
import { ref } from "vue"
import {
  UiMenu,
  UiMenuTrigger,
  UiMenuContent,
  UiMenuItem,
  UiMenuLabel,
  UiMenuSeparator,
} from "@affino/menu-vue"

type Action = {
  label: string
  description: string
  shortcut: string
  tone?: "danger"
}

const primaryActions: Action[] = [
  { label: "Invite collaborator", description: "Send a quick, expiring link", shortcut: "I" },
  { label: "Duplicate", description: "Clone surface with bindings", shortcut: "⇧⌘D" },
  { label: "Share preview", description: "Copy live review URL", shortcut: "⇧⌘S" },
]

const secondaryActions: Action[] = [
  { label: "Archive", description: "Freeze analytics without deleting", shortcut: "A" },
  { label: "Delete", description: "Remove project forever", shortcut: "⌘⌫", tone: "danger" },
]

const lastAction = ref("None yet")

function handleSelect(action: string) {
  lastAction.value = action
}
</script>

<template>
  <section class="adapter-demo ui-demo-shell">
    <UiMenu>
      <UiMenuTrigger as-child>
        <button type="button" class="adapter-trigger ui-button ui-button--primary">Open project menu</button>
      </UiMenuTrigger>

      <UiMenuContent class="adapter-panel" side-offset="8">
        <UiMenuLabel class="adapter-label">Project</UiMenuLabel>
        <UiMenuSeparator />

        <UiMenuItem
          v-for="action in primaryActions"
          :key="action.label"
          class="adapter-item"
          @select="() => handleSelect(action.label)"
        >
          <div class="adapter-item__copy">
            <strong>{{ action.label }}</strong>
            <span>{{ action.description }}</span>
          </div>
          <span class="adapter-item__shortcut">{{ action.shortcut }}</span>
        </UiMenuItem>

        <UiMenuSeparator />

        <UiMenuItem
          v-for="action in secondaryActions"
          :key="action.label"
          class="adapter-item"
          :danger="action.tone === 'danger'"
          @select="() => handleSelect(action.label)"
        >
          <div class="adapter-item__copy">
            <strong>{{ action.label }}</strong>
            <span>{{ action.description }}</span>
          </div>
          <span class="adapter-item__shortcut">{{ action.shortcut }}</span>
        </UiMenuItem>
      </UiMenuContent>
    </UiMenu>

    <dl class="adapter-log">
      <dt>Last action</dt>
      <dd>{{ lastAction }}</dd>
    </dl>
  </section>
</template>

<style scoped>
.adapter-demo {
  width: 100%;
  max-width: 360px;
}

.adapter-trigger {
  width: 100%;
  padding-inline: 1.2rem;
}

.adapter-panel {
  width: var(--ui-menu-max-width, 320px);
  border-radius: 1.25rem;
  border: 1px solid var(--glass-border);
  background: #fffaf2;
  color: var(--text-primary);
  padding: 0.35rem 0;
  box-shadow: 0 22px 50px rgba(116, 89, 58, 0.12);
}

.adapter-label {
  padding: 0.35rem 1rem;
  font-size: 0.75rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--text-soft);
}

.adapter-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 1rem;
  font-size: 0.9rem;
  color: var(--text-primary);
}

.adapter-item[data-danger="true"],
.adapter-item[data-danger="true"]:hover {
  color: #b44d35;
}

.adapter-item__copy {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  flex: 1;
}

.adapter-item__copy strong {
  font-size: 0.92rem;
}

.adapter-item__copy span {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.adapter-item__shortcut {
  font-size: 0.75rem;
  color: var(--text-soft);
}

.adapter-log {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.adapter-log dt {
  font-size: 0.75rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--text-soft);
}

.adapter-log dd {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}
</style>
