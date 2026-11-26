# @affino/tabs-vue

Vue adapter for `@affino/tabs-core`, with a controlled workspace-tab strip and a lightweight selection controller.

## Route-backed workspace tabs

`UiWorkspaceTabs` renders a controlled accessible tab list. It does not own the open-tab collection or depend on a router; the application supplies the current route's `activeId`, handles activation/close events, and restores its tab list from its preferred storage.

```vue
<UiWorkspaceTabs
  :tabs="openTabs"
  :active-id="activeTabId"
  @activate="activateTab"
  @close="closeTab"
>
  <template #tab-link="{ tab, attrs }">
    <RouterLink :to="tab.to" custom v-slot="{ href, navigate }">
      <a :href="href" v-bind="attrs" @click="navigate">{{ tab.label }}</a>
    </RouterLink>
  </template>
</UiWorkspaceTabs>
```

Each tab is `{ id, label, to, closable? }`. `activeId` is controlled by the application's route. `activate(tab, source)` fires for pointer activation and keyboard selection; `close(tab)` only fires for closable tabs. The custom link slot lets the application use its router while preserving normal modified-click behavior. Without the slot, the component renders native anchors using `to` as `href`. Set `panel-id` to match the route content's `id`; every tab then exposes that relationship through `aria-controls`.

Set `reorderable` to enable pointer drag and drop. A visible insertion marker shows whether the tab will land before or after the hovered tab. The left and right thirds select those positions; the center selects the direction that changes the current order. After a successful drop, `reorder` emits `{ tabId, fromIndex, toIndex }`; the component does not change the controlled `tabs` array. `toIndex` is the tab's resulting index. Reordering is disabled by default.

The tab list uses `role="tablist"` and `role="tab"`, exposes selection with `aria-selected`, keeps one roving tab stop, and supports Left/Right, Home/End, and Delete/Backspace for closable tabs. Close buttons have per-tab accessible labels.

## Selection controller

`useTabsController` remains available for simple single-value selection:

```ts
const tabs = useTabsController("overview")
tabs.select("settings")
```

## Scripts

```bash
pnpm --filter @affino/tabs-vue build
pnpm --filter @affino/tabs-vue test
```
