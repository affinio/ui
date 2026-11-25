<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { RouterLink, RouterView, useRoute, useRouter } from "vue-router"
import { UiWorkspaceTabs } from "@affino/tabs-vue"
import type { WorkspaceTab, WorkspaceTabActivationSource } from "@affino/tabs-vue"

const STORAGE_KEY = "affino.demo.workspace-tabs.v1"
const EMPTY_ROUTE_STORAGE_KEY = "affino.demo.workspace-empty-route.v1"
const emptyRouteOptions = [
  { label: "Home", to: "/" },
  { label: "Tabs demo", to: "/tabs" },
]
const settingsTab: WorkspaceTab = {
  id: "settings",
  label: "Settings",
  to: "/workspace/settings",
  closable: true,
}

function defaultTabs(): WorkspaceTab[] {
  return [
    settingsTab,
    { id: "document-alpha", label: "Document Alpha", to: "/workspace/documents/alpha", closable: true },
    { id: "document-beta", label: "Document Beta", to: "/workspace/documents/beta", closable: true },
  ]
}

function readTabs(): WorkspaceTab[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return defaultTabs()
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return defaultTabs()
    const restored = parsed.filter((tab): tab is WorkspaceTab =>
      typeof tab?.id === "string" &&
      typeof tab?.label === "string" &&
      typeof tab?.to === "string" &&
      tab.to.startsWith("/workspace/") &&
      (tab.id === "settings" || tab.id.startsWith("document-")),
    )
    return restored
  } catch {
    return defaultTabs()
  }
}

const route = useRoute()
const router = useRouter()
const tabs = ref<WorkspaceTab[]>(readTabs())
const nextDocumentNumber = ref(1)
const emptyRoute = ref(readEmptyRoute())

function readEmptyRoute(): string {
  try {
    const stored = localStorage.getItem(EMPTY_ROUTE_STORAGE_KEY)
    return emptyRouteOptions.some((option) => option.to === stored) ? stored! : "/"
  } catch {
    return "/"
  }
}

const routeTab = computed<WorkspaceTab | null>(() => {
  if (route.name === "workspace-settings") return settingsTab
  if (route.name !== "workspace-document") return null
  const documentId = String(route.params.documentId ?? "")
  if (!documentId) return null
  return {
    id: `document-${documentId}`,
    label: `Document ${documentId}`,
    to: `/workspace/documents/${encodeURIComponent(documentId)}`,
    closable: true,
  }
})

const activeId = computed(() => routeTab.value?.id ?? null)
const activeTabDomId = computed(() => activeId.value ? `workspace-tab-${encodeURIComponent(activeId.value)}` : undefined)

function includeCurrentRoute(): void {
  const current = routeTab.value
  if (!current || tabs.value.some((tab) => tab.id === current.id)) return
  tabs.value = [...tabs.value, current]
}

watch(() => route.fullPath, includeCurrentRoute, { immediate: true })
watch(tabs, (value) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // The tab strip remains usable when browser storage is unavailable.
  }
}, { deep: true, immediate: true })
watch(emptyRoute, (value) => {
  try {
    localStorage.setItem(EMPTY_ROUTE_STORAGE_KEY, value)
  } catch {
    // The workspace keeps its default route when browser storage is unavailable.
  }
}, { immediate: true })

function activateTab(tab: WorkspaceTab, source: WorkspaceTabActivationSource): void {
  if (source === "keyboard" && tab.id !== activeId.value) void router.push(tab.to)
}

function closeTab(tab: WorkspaceTab): void {
  if (!tab.closable) return
  const index = tabs.value.findIndex((item) => item.id === tab.id)
  const wasActive = activeId.value === tab.id
  const remaining = tabs.value.filter((item) => item.id !== tab.id)
  tabs.value = remaining
  if (wasActive) {
    const neighbor = remaining[index] ?? remaining[index - 1] ?? settingsTab
    if (remaining.length) void router.push(neighbor.to)
    else void router.push(emptyRoute.value)
  }
}

function openDocument(): void {
  const usedNumbers = tabs.value
    .map((tab) => Number(tab.id.replace("document-", "")))
    .filter(Number.isFinite)
  nextDocumentNumber.value = Math.max(0, ...usedNumbers) + 1
  const documentId = String(nextDocumentNumber.value)
  const tab: WorkspaceTab = {
    id: `document-${documentId}`,
    label: `Document ${documentId}`,
    to: `/workspace/documents/${documentId}`,
    closable: true,
  }
  tabs.value = [...tabs.value, tab]
  void router.push(tab.to)
}
</script>

<template>
  <section class="workspace-tabs-page">
    <header class="workspace-tabs-page__heading">
      <div>
        <p class="ui-eyebrow">Route-backed workspace</p>
        <h1>Keep documents open while switching routes</h1>
        <p>Settings and documents are separate routes. The workspace shell and tab strip stay mounted while the active view changes.</p>
      </div>
      <div class="workspace-tabs-page__actions">
        <label class="workspace-tabs-page__fallback">
          <span>After the last tab</span>
          <select v-model="emptyRoute" aria-label="Route after closing the last tab">
            <option v-for="option in emptyRouteOptions" :key="option.to" :value="option.to">{{ option.label }}</option>
          </select>
        </label>
        <button type="button" class="workspace-tabs-page__new" @click="openDocument">＋ New document</button>
      </div>
    </header>

    <div class="workspace-tabs-page__surface">
      <UiWorkspaceTabs
        :tabs="tabs"
        :active-id="activeId"
        aria-label="Open workspace tabs"
        @activate="activateTab"
        @close="closeTab"
      >
        <template #tab-link="{ tab, attrs }">
          <RouterLink :to="tab.to" custom v-slot="{ href, navigate }">
            <a :href="href" v-bind="attrs" @click="navigate">{{ tab.label }}</a>
          </RouterLink>
        </template>
      </UiWorkspaceTabs>

      <div id="workspace-tab-panel" class="workspace-tabs-page__panel" role="tabpanel" tabindex="0" :aria-labelledby="activeTabDomId">
        <RouterView v-slot="{ Component }">
          <component :is="Component" />
        </RouterView>
      </div>
    </div>
    <p class="workspace-tabs-page__hint">Open this URL directly or use Back/Forward to verify that the selected tab follows the route.</p>
  </section>
</template>

<style scoped>
.workspace-tabs-page {
  display: grid;
  gap: 1.25rem;
}

.workspace-tabs-page__heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
}

.workspace-tabs-page__heading h1 {
  margin: 0.35rem 0;
  font-size: clamp(1.75rem, 4vw, 2.5rem);
}

.workspace-tabs-page__heading p:last-child,
.workspace-tabs-page__hint {
  margin: 0;
  color: var(--text-muted);
  line-height: 1.55;
}

.workspace-tabs-page__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 0.75rem;
}

.workspace-tabs-page__fallback {
  display: grid;
  gap: 0.25rem;
  color: var(--text-muted);
  font-size: 0.72rem;
}

.workspace-tabs-page__fallback select {
  min-height: 2.6rem;
  padding: 0.5rem 0.65rem;
  border: 1px solid var(--glass-border);
  border-radius: 0.65rem;
  color: var(--text-primary);
  background: var(--surface-alt);
  font: inherit;
}

.workspace-tabs-page__panel {
  min-width: 0;
  outline: none;
}

.workspace-tabs-page__new {
  flex: none;
  padding: 0.65rem 0.9rem;
  border: 1px solid var(--glass-border);
  border-radius: 0.75rem;
  color: var(--text-primary);
  background: var(--surface-alt);
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}

.workspace-tabs-page__surface {
  display: grid;
  gap: 1.25rem;
  min-height: 24rem;
  padding: 1rem;
  border: 1px solid var(--glass-border);
  border-radius: 1.25rem;
  background: color-mix(in srgb, var(--surface-alt) 86%, transparent);
}

.workspace-tabs-page__hint {
  justify-self: center;
  text-align: center;
  font-size: 0.85rem;
}

:deep(.ui-workspace-tabs) {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 0.35rem;
  min-height: 2.9rem;
  border-bottom: 1px solid var(--glass-border);
}

:deep(.ui-workspace-tabs__item) {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  min-width: 0;
  padding: 0.15rem 0.35rem;
  border: 1px solid transparent;
  border-bottom: 0;
  border-radius: 0.65rem 0.65rem 0 0;
}

:deep(.ui-workspace-tabs__item.is-active) {
  border-color: var(--glass-border);
  background: var(--surface-alt);
}

:deep(.ui-workspace-tabs__link) {
  overflow: hidden;
  max-width: 16rem;
  padding: 0.45rem 0.55rem;
  color: var(--text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
  text-decoration: none;
}

:deep(.ui-workspace-tabs__link[aria-selected="true"]) {
  color: var(--text-primary);
  font-weight: 700;
}

:deep(.ui-workspace-tabs__link:focus-visible),
:deep(.ui-workspace-tabs__close:focus-visible) {
  outline: 2px solid var(--accent-strong);
  outline-offset: 2px;
}

:deep(.ui-workspace-tabs__close) {
  width: 1.7rem;
  height: 1.7rem;
  border: 0;
  border-radius: 50%;
  color: var(--text-muted);
  background: transparent;
  font: inherit;
  cursor: pointer;
}

:deep(.ui-workspace-tabs__close:hover) {
  color: var(--text-primary);
  background: color-mix(in srgb, var(--accent) 18%, transparent);
}

@media (max-width: 640px) {
  .workspace-tabs-page__heading {
    align-items: start;
    flex-direction: column;
  }
}
</style>
