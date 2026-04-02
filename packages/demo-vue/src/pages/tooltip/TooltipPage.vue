<script setup lang="ts">
import QuickDetails from "@/components/QuickDetails.vue"
import BasicTooltipExample from "./examples/BasicTooltipExample.vue"
import FieldTooltipExample from "./examples/FieldTooltipExample.vue"
import ManualTooltipExample from "./examples/ManualTooltipExample.vue"

const highlights = [
  {
    title: "Comfortable by default",
    body: "Hover and focus behave the way people expect, so simple help text feels quiet instead of distracting.",
  },
  {
    title: "Useful in forms",
    body: "Tooltip help can sit next to labels and inputs without becoming a second UI system to maintain.",
  },
  {
    title: "Scriptable when needed",
    body: "When a flow needs it, you can still open and close tooltips directly for tours, hints, or guided reveals.",
  },
]

const tooltipSnippet = `<script setup lang="ts">
import { computed } from "vue"
import { useTooltipController, useFloatingTooltip } from "@affino/tooltip-vue"

const controller = useTooltipController({ id: "help-tooltip" })
const triggerProps = computed(() => controller.getTriggerProps())
const tooltipProps = computed(() => controller.getTooltipProps())
const { triggerRef, tooltipRef, tooltipStyle, teleportTarget } = useFloatingTooltip(controller)
<\/script>

<template>
  <button ref="triggerRef" v-bind="triggerProps">Need help?</button>

  <Teleport :to="teleportTarget">
    <div v-if="controller.state.value.open" ref="tooltipRef" v-bind="tooltipProps" :style="tooltipStyle">
      Helpful supporting copy
    </div>
  </Teleport>
</template>`
</script>

<template>
  <section class="tooltip-page ui-page-shell ui-page-shell--warm">
    <header class="tooltip-hero ui-copy-stack">
      <p class="ui-eyebrow">Affino tooltip</p>
      <h1 class="ui-title">Hover or focus the example below.</h1>
      <p class="ui-lead">One basic tooltip is visible first. Form and programmatic cases stay hidden until you want them.</p>
    </header>

    <div class="tooltip-grid tooltip-grid--primary">
      <BasicTooltipExample />
    </div>

    <QuickDetails title="More tooltip cases" hint="Open to inspect form-help and programmatic tooltip behavior.">
      <div class="tooltip-grid">
        <FieldTooltipExample />
        <ManualTooltipExample />
      </div>
    </QuickDetails>

    <QuickDetails title="Starter code and notes" hint="Open to see the starter snippet and a few quick usage notes.">
      <section class="tooltip-starter">
        <article class="tooltip-starter__copy ui-card ui-copy-stack">
          <p class="ui-eyebrow">Starter</p>
          <h2>The simplest copy-paste setup</h2>
          <p>One trigger, one floating help surface, and the default behavior people already understand.</p>
        </article>
        <article class="tooltip-starter__code ui-code-card ui-code-card--contrast">
          <pre aria-label="Tooltip starter snippet">{{ tooltipSnippet }}</pre>
        </article>
      </section>
      <ul class="tooltip-highlights ui-card-grid">
        <li v-for="item in highlights" :key="item.title" class="ui-card">
          <p class="tooltip-highlights__title">{{ item.title }}</p>
          <p class="tooltip-highlights__body">{{ item.body }}</p>
        </li>
      </ul>
    </QuickDetails>
  </section>
</template>

<style scoped>
.tooltip-page {
  gap: 1.75rem;
}

.tooltip-hero {
}

.tooltip-hero p:last-child {
  color: #6b4f3a;
  max-width: 56ch;
}

.tooltip-highlights {
  list-style: none;
  margin: 0;
  padding: 0;
}

.tooltip-highlights__title {
  margin: 0 0 0.35rem;
  font-weight: 700;
}

.tooltip-highlights__body {
  margin: 0;
  color: #6b4f3a;
  line-height: 1.55;
}

.tooltip-starter {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.tooltip-starter__copy p:last-child {
  color: #6b4f3a;
}

.tooltip-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}

.tooltip-grid--primary {
  grid-template-columns: minmax(0, 360px);
}
</style>
