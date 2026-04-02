<script setup lang="ts">
import { computed, reactive, ref, defineComponent, h } from "vue"
import {
  UiMenu,
  UiMenuTrigger,
  UiMenuContent,
  UiMenuItem,
  UiMenuSeparator,
  UiMenuLabel,
  UiSubMenu,
  UiSubMenuTrigger,
  UiSubMenuContent,
} from "@affino/menu-vue"

const itemCounts = [50, 200, 500, 1000]
const selectedCount = ref<number>(200)
const dynamicItems = reactive(
  Array.from({ length: 20 }, (_, index) => ({ id: index + 1, label: `Dynamic ${index + 1}` }))
)

const enableScrollableContainer = ref(false)
const enableTransform = ref(false)
const enableRTL = ref(false)
const enableNested = ref(true)
const nestedDepthOptions = [3, 5, 10] as const
const nestedDepth = ref<(typeof nestedDepthOptions)[number]>(3)
const widthOptions = [280, 340, 420, 520] as const
const menuMaxWidth = ref<(typeof widthOptions)[number]>(340)

const lastEvent = ref("Awaiting selection")

const panelStyle = computed(() => ({
  height: enableScrollableContainer.value ? "320px" : "auto",
  overflow: enableScrollableContainer.value ? "auto" : "visible",
  transform: enableTransform.value ? "scale(0.94)" : "none",
  "--ui-menu-max-width": `${menuMaxWidth.value}px`,
}))

const dirAttr = computed(() => (enableRTL.value ? "rtl" : "ltr"))

const stressStats = computed(() => [
  { label: "Root items", value: selectedCount.value.toString() },
  { label: "Dynamic set", value: dynamicItems.length.toString() },
  { label: "Submenus", value: enableNested.value ? "Enabled" : "Disabled" },
])

const toggles = [
  {
    key: "scroll",
    label: "Scroll container",
    description: "Wrap in a 320px viewport to test parent scrolling.",
    ref: enableScrollableContainer,
  },
  {
    key: "transform",
    label: "Parent transform",
    description: "Scale the parent to surface GPU edge cases.",
    ref: enableTransform,
  },
  {
    key: "rtl",
    label: "RTL",
    description: "Flip layout direction and pointer heuristics.",
    ref: enableRTL,
  },
  {
    key: "nested",
    label: "Nested levels",
    description: "Toggle the submenu chain on/off.",
    ref: enableNested,
  },
] as const

const NestedChain = defineComponent({
  name: "NestedChain",
  props: {
    level: { type: Number, required: true },
    maxLevel: { type: Number, required: true },
  },
  setup(props) {
    return () => {
      const children = [
        h(UiMenuLabel, null, () => `Level ${props.level}`),
        h(UiMenuSeparator),
        h(
          UiMenuItem,
          { onSelect: () => onSelect(`L${props.level}-A`) },
          { default: () => `Level ${props.level} - A` },
        ),
        h(
          UiMenuItem,
          { onSelect: () => onSelect(`L${props.level}-B`) },
          { default: () => `Level ${props.level} - B` },
        ),
      ] as Array<ReturnType<typeof h>>

      if (props.level < props.maxLevel) {
        children.push(
          h(NestedChain, {
            level: props.level + 1,
            maxLevel: props.maxLevel,
          }),
        )
      } else {
        children.push(h(UiMenuSeparator))
        children.push(
          h(
            UiMenuItem,
            { danger: true, onSelect: onDanger },
            { default: () => "Dangerous leaf" },
          ),
        )
      }

      return h(
        UiSubMenu,
        null,
        {
          default: () => [
            h(UiSubMenuTrigger, null, () => `Nested level ${props.level}`),
            h(
              UiSubMenuContent,
              { class: "menu-playground-panel", style: { "--ui-menu-max-width": `${menuMaxWidth.value}px` } },
              { default: () => children },
            ),
          ],
        },
      )
    }
  },
})

function onSelect(label: string | number) {
  const payload = typeof label === "number" ? `Item ${label}` : label
  lastEvent.value = payload
}

function onDanger() {
  lastEvent.value = "Danger invoked"
}

function addDynamic() {
  const nextId = dynamicItems.length + 1
  dynamicItems.push({ id: nextId, label: `Dynamic ${nextId}` })
}

function removeDynamic() {
  if (dynamicItems.length === 0) return
  dynamicItems.pop()
}
</script>

<template>
  <div class="menu-demo-inline" :dir="dirAttr">
    <div class="grid gap-3 sm:grid-cols-3 text-center text-xs uppercase tracking-[0.25em] text-(--text-soft)">
      <div v-for="stat in stressStats" :key="stat.label" class="rounded-2xl border border-(--glass-border) p-4">
        <span class="block text-(--text-muted)">{{ stat.label }}</span>
        <span class="mt-2 block text-lg font-semibold text-(--text-primary)">{{ stat.value }}</span>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-2 text-sm text-(--text-muted)">
      <label class="flex flex-col gap-1">
        Items count
        <select v-model.number="selectedCount" class="dataset-select mt-1 rounded-2xl px-4 py-2 text-base font-semibold">
          <option v-for="count in itemCounts" :key="count" :value="count">{{ count }}</option>
        </select>
      </label>
      <label class="flex flex-col gap-1">
        Nested depth
        <select v-model.number="nestedDepth" class="dataset-select mt-1 rounded-2xl px-4 py-2 text-base font-semibold">
          <option v-for="depth in nestedDepthOptions" :key="depth" :value="depth">{{ depth }} levels</option>
        </select>
      </label>
      <label class="flex flex-col gap-1">
        Menu max width
        <select v-model.number="menuMaxWidth" class="dataset-select mt-1 rounded-2xl px-4 py-2 text-base font-semibold">
          <option v-for="width in widthOptions" :key="width" :value="width">{{ width }} px</option>
        </select>
      </label>
      <div class="flex items-center gap-2">
        <button type="button" class="dataset-button rounded-full px-4 py-2 text-sm font-semibold" @click="addDynamic">
          Add dynamic
        </button>
        <button type="button" class="dataset-button rounded-full px-4 py-2 text-sm font-semibold" @click="removeDynamic">
          Remove
        </button>
      </div>
    </div>

    <div class="flex flex-col gap-3 text-sm text-(--text-muted)">
      <p class="text-xs uppercase tracking-[0.3em] text-(--text-soft)">Edge-case toggles</p>
      <div class="grid gap-3 md:grid-cols-2">
        <button
          v-for="toggle in toggles"
          :key="toggle.key"
          type="button"
          class="stress-toggle"
          :aria-pressed="toggle.ref.value"
          @click="toggle.ref.value = !toggle.ref.value"
        >
          <div class="flex items-center justify-between">
            <span class="text-sm font-semibold">{{ toggle.label }}</span>
            <span class="toggle-indicator" :class="toggle.ref.value ? 'is-on' : 'is-off'"></span>
          </div>
          <p class="text-xs text-(--text-muted)">{{ toggle.description }}</p>
        </button>
      </div>
    </div>

    <div class="flex w-full flex-col items-start gap-6" :style="panelStyle">
      <p class="text-sm text-(--text-soft)">
        {{ enableScrollableContainer ? "Scroll parent" : "Free layout" }} ·
        {{ enableTransform ? "Transformed" : "Normal" }} container
      </p>
      <div v-if="enableScrollableContainer" class="w-full space-y-3 text-left text-sm leading-relaxed text-(--text-muted)">
        <p>
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vestibulum gravida velit non orci bibendum, in
          vulputate odio aliquet.
        </p>
        <p>
          Vivamus non arcu sit amet magna pellentesque efficitur. Donec pharetra sem vitae arcu suscipit, vel
          faucibus nibh fermentum.
        </p>
      </div>
      <UiMenu>
        <UiMenuTrigger trigger="both" as-child>
          <button class="menu-demo-trigger">
            <span>Open stress-test menu</span>
            <span>{{ enableRTL ? "RTL layout" : "LTR layout" }}</span>
          </button>
        </UiMenuTrigger>
        <UiMenuContent class="menu-playground-panel" :style="{ '--ui-menu-max-width': `${menuMaxWidth}px` }">
          <UiMenuLabel>Root items ({{ selectedCount }})</UiMenuLabel>
          <UiMenuSeparator />
          <UiMenuItem v-for="n in selectedCount" :key="`root-${n}`" @select="() => onSelect(n)">
            Item {{ n }}
          </UiMenuItem>
          <UiMenuSeparator />
          <UiMenuLabel>Dynamic items ({{ dynamicItems.length }})</UiMenuLabel>
          <UiMenuItem v-for="item in dynamicItems" :key="item.id" @select="() => onSelect(item.label)">
            {{ item.label }}
          </UiMenuItem>
          <UiMenuSeparator />
          <component v-if="enableNested" :is="NestedChain" :level="1" :max-level="nestedDepth" />
          <UiMenuSeparator />
          <UiMenuItem danger @select="onDanger">Delete something</UiMenuItem>
        </UiMenuContent>
      </UiMenu>
    </div>

    <div class="demo-last-action">
      <span class="demo-last-action__label">Last action</span>
      <span class="demo-last-action__value">{{ lastEvent }}</span>
    </div>
  </div>
</template>
