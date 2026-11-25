<script setup lang="ts">
import { ref } from "vue"
import {
  UiMenu,
  UiMenuBar,
  UiMenuContent,
  UiMenuItem,
  UiMenuLabel,
  UiMenuSeparator,
  UiMenuTrigger,
  UiSubMenu,
  UiSubMenuContent,
  UiSubMenuTrigger,
} from "@affino/menu-vue"

const lastAction = ref("Choose a command")

function select(action: string): void {
  lastAction.value = action
}
</script>

<template>
  <section class="menubar-demo">
    <header class="menubar-demo__intro">
      <p class="menubar-demo__eyebrow">Shared root state</p>
      <h2>One menubar, four root menus</h2>
      <p>Click a menu to open it, then hover another label to switch. Use the arrow keys to move between roots and Escape to close.</p>
    </header>

    <div class="menubar-demo__surface">
      <UiMenuBar aria-label="Document commands" class="menubar-demo__bar">
        <UiMenu>
          <UiMenuTrigger as-child>
            <button class="menubar-demo__trigger" type="button">File</button>
          </UiMenuTrigger>
          <UiMenuContent class="menubar-demo__panel">
            <UiMenuLabel>File</UiMenuLabel>
            <UiMenuSeparator />
            <UiMenuItem @select="select('New document')">New document <kbd>⌘N</kbd></UiMenuItem>
            <UiMenuItem @select="select('Open document')">Open… <kbd>⌘O</kbd></UiMenuItem>
            <UiMenuSeparator />
            <UiSubMenu>
              <UiSubMenuTrigger>Export <kbd>›</kbd></UiSubMenuTrigger>
              <UiSubMenuContent class="menubar-demo__panel">
                <UiMenuItem @select="select('Export as PDF')">PDF document</UiMenuItem>
                <UiMenuItem @select="select('Export as PNG')">PNG image</UiMenuItem>
              </UiSubMenuContent>
            </UiSubMenu>
          </UiMenuContent>
        </UiMenu>

        <UiMenu>
          <UiMenuTrigger as-child>
            <button class="menubar-demo__trigger" type="button">Edit</button>
          </UiMenuTrigger>
          <UiMenuContent class="menubar-demo__panel">
            <UiMenuLabel>Edit</UiMenuLabel>
            <UiMenuSeparator />
            <UiMenuItem @select="select('Undo')">Undo <kbd>⌘Z</kbd></UiMenuItem>
            <UiMenuItem @select="select('Redo')">Redo <kbd>⇧⌘Z</kbd></UiMenuItem>
            <UiMenuSeparator />
            <UiMenuItem @select="select('Copy')">Copy <kbd>⌘C</kbd></UiMenuItem>
            <UiMenuItem @select="select('Paste')">Paste <kbd>⌘V</kbd></UiMenuItem>
          </UiMenuContent>
        </UiMenu>

        <UiMenu>
          <UiMenuTrigger as-child>
            <button class="menubar-demo__trigger" type="button">View</button>
          </UiMenuTrigger>
          <UiMenuContent class="menubar-demo__panel">
            <UiMenuLabel>View</UiMenuLabel>
            <UiMenuSeparator />
            <UiMenuItem @select="select('Zoom in')">Zoom in <kbd>⌘+</kbd></UiMenuItem>
            <UiMenuItem @select="select('Zoom out')">Zoom out <kbd>⌘−</kbd></UiMenuItem>
            <UiMenuItem @select="select('Reset zoom')">Reset zoom</UiMenuItem>
          </UiMenuContent>
        </UiMenu>

        <UiMenu>
          <UiMenuTrigger as-child>
            <button class="menubar-demo__trigger" type="button">Help</button>
          </UiMenuTrigger>
          <UiMenuContent class="menubar-demo__panel">
            <UiMenuLabel>Help</UiMenuLabel>
            <UiMenuSeparator />
            <UiMenuItem @select="select('Documentation')">Documentation</UiMenuItem>
            <UiMenuItem @select="select('Keyboard shortcuts')">Keyboard shortcuts</UiMenuItem>
          </UiMenuContent>
        </UiMenu>
      </UiMenuBar>

      <p class="menubar-demo__result" aria-live="polite">
        <span>Last action</span>
        <strong>{{ lastAction }}</strong>
      </p>
    </div>

    <p class="menubar-demo__hint">Try File → Export, then press Left Arrow to return to File. The active child item clears when you return.</p>
  </section>
</template>

<style scoped>
.menubar-demo {
  display: grid;
  gap: 1.5rem;
}

.menubar-demo__intro {
  display: grid;
  justify-items: center;
  gap: 0.55rem;
  text-align: center;
}

.menubar-demo__intro h2,
.menubar-demo__intro p,
.menubar-demo__hint {
  margin: 0;
}

.menubar-demo__intro h2 {
  font-size: 1.5rem;
  font-weight: 650;
  color: var(--text-primary);
}

.menubar-demo__intro p,
.menubar-demo__hint {
  max-width: 48rem;
  color: var(--text-muted);
  line-height: 1.6;
}

.menubar-demo__eyebrow {
  color: var(--accent-strong) !important;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}

.menubar-demo__surface {
  display: grid;
  gap: 2rem;
  min-height: 17rem;
  align-content: start;
  padding: 1.5rem;
  border: 1px solid var(--glass-border);
  border-radius: 1.5rem;
  background: color-mix(in srgb, var(--surface-solid) 82%, transparent);
}

.menubar-demo__bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  width: fit-content;
  padding: 0.35rem;
  border: 1px solid var(--glass-border);
  border-radius: 0.85rem;
  background: color-mix(in srgb, var(--surface-solid) 72%, transparent);
}

.menubar-demo__trigger {
  min-width: 4.25rem;
  padding: 0.55rem 0.85rem;
  border: 0;
  border-radius: 0.55rem;
  color: var(--text-primary);
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.menubar-demo__trigger:hover,
.menubar-demo__trigger:focus-visible {
  outline: none;
  background: color-mix(in srgb, var(--accent) 22%, transparent);
}

.menubar-demo__panel {
  min-width: 14rem;
  padding: 0.4rem;
  border: 1px solid var(--glass-border);
  border-radius: 0.85rem;
  color: var(--text-primary);
  background: var(--surface-solid);
  box-shadow: 0 16px 42px rgb(0 0 0 / 30%);
}

.menubar-demo__panel kbd {
  margin-left: auto;
  color: var(--text-soft);
  font: inherit;
  font-size: 0.75rem;
}

.menubar-demo__result {
  display: flex;
  gap: 0.5rem;
  margin: 0;
  color: var(--text-muted);
  font-size: 0.875rem;
}

.menubar-demo__result strong {
  color: var(--text-primary);
  font-weight: 600;
}

.menubar-demo__hint {
  justify-self: center;
  text-align: center;
  font-size: 0.875rem;
}
</style>
