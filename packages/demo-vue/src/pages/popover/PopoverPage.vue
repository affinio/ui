<script setup lang="ts">
import QuickDetails from "@/components/QuickDetails.vue"
import PopoverPlayground from "@/components/PopoverPlayground.vue"
import PopoverSnoozeExample from "@/components/PopoverSnoozeExample.vue"

const highlights = [
  {
    title: "Easy inline moments",
    body: "Use popovers when a detail or control should stay close to the trigger instead of taking over the whole page.",
  },
  {
    title: "Predictable placement",
    body: "The helper keeps the surface attached to the trigger, so compact editors and small action sheets feel grounded.",
  },
  {
    title: "Good for product polish",
    body: "Popovers work best when the surface is short, intentional, and visibly connected to the thing people just touched.",
  },
]

const stats = [
  { label: "Focus return", value: "Automatic" },
  { label: "Viewport logic", value: "Collision-aware" },
  { label: "Starter shape", value: "Trigger + panel" },
]

const popoverSnippet = `<script setup lang="ts">
import { usePopoverController, useFloatingPopover } from "@affino/popover-vue"

const controller = usePopoverController({ id: "profile-popover", modal: false })
const { triggerRef, contentRef, contentStyle, teleportTarget } = useFloatingPopover(controller, {
  placement: "bottom",
  align: "start",
  gutter: 12,
})
<\/script>

<template>
  <button ref="triggerRef" v-bind="controller.getTriggerProps()">Open popover</button>

  <Teleport :to="teleportTarget">
    <div
      v-if="controller.state.value.open"
      ref="contentRef"
      v-bind="controller.getContentProps()"
      :style="contentStyle"
    >
      Quick inline content
    </div>
  </Teleport>
</template>`
</script>

<template>
  <section class="popover-page ui-page-shell ui-page-shell--warm">
    <header class="popover-hero ui-copy-stack">
      <div class="hero-copy ui-copy-stack">
        <p class="ui-eyebrow">Floating surfaces</p>
        <h1 class="ui-title">Click “Adjust filters” to open the popover.</h1>
        <p class="ui-lead">The main popover is on screen immediately. Secondary examples and notes are hidden below.</p>
        <div class="hero-actions ui-actions-row">
          <span class="hero-note">A good starter when the UI needs one compact inline surface.</span>
        </div>
      </div>
      <ul class="hero-stats ui-card-grid">
        <li v-for="stat in stats" :key="stat.label">
          <p class="stat-value">{{ stat.value }}</p>
          <p class="stat-label">{{ stat.label }}</p>
        </li>
      </ul>
    </header>

    <section class="popover-demos">
      <PopoverPlayground />
    </section>

    <QuickDetails title="More popover cases" hint="Open to inspect the snooze pattern and a few placement notes.">
      <PopoverSnoozeExample />
      <ul class="popover-highlights ui-card-grid">
        <li v-for="item in highlights" :key="item.title" class="ui-card">
          <p class="highlight-title">{{ item.title }}</p>
          <p class="highlight-body">{{ item.body }}</p>
        </li>
      </ul>
    </QuickDetails>

    <QuickDetails title="Starter code and notes" hint="Open to see the smallest setup and extra implementation notes.">
      <section class="popover-starter">
        <article class="popover-starter__copy ui-card ui-copy-stack">
          <p class="ui-eyebrow">Starter</p>
          <h2>The smallest useful popover setup</h2>
          <p>
            This is the copy-paste baseline: one trigger, one positioned panel, and the default open-close contract.
          </p>
        </article>
        <article class="popover-starter__code ui-code-card ui-code-card--contrast">
          <pre aria-label="Popover starter snippet">{{ popoverSnippet }}</pre>
        </article>
      </section>
      <section class="popover-notes ui-card-grid">
        <article class="ui-card">
          <h3>Flexible control</h3>
          <p>
            The controller gives you a dependable open state and the expected trigger and content props. From there, the
            visual treatment is yours to shape.
          </p>
        </article>
        <article class="ui-card">
          <h3>Works in busy layouts</h3>
          <p>
            Placement, outside interactions, and focus return are already handled, so it is easier to introduce a popover
            into filters, profile cards, or inline editors without adding extra page complexity.
          </p>
        </article>
      </section>
    </QuickDetails>
  </section>
</template>

<style scoped>
.popover-page {
  padding-bottom: 4rem;
}

.popover-hero {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: clamp(1.5rem, 4vw, 3rem);
}

.hero-copy p {
  margin: 0;
  color: #6b4f3a;
}

.hero-note {
  font-size: 0.9rem;
  color: #8b6a55;
}

.hero-stats {
  list-style: none;
  margin: 0;
  padding: 0;
}

.hero-stats li {
  padding: 1.25rem;
  border-radius: 1.25rem;
  border: 1px solid var(--glass-border);
  background: rgba(255, 255, 255, 0.74);
  box-shadow: 0 12px 24px rgba(102, 72, 43, 0.08);
}

.stat-value {
  margin: 0;
  font-size: 1.35rem;
}

.stat-label {
  margin: 0.35rem 0 0;
  font-size: 0.9rem;
  color: #8b6a55;
}

.popover-highlights {
  list-style: none;
  margin: 0;
  padding: 0;
}

.highlight-title {
  margin: 0;
  font-weight: 600;
}

.highlight-body {
  margin: 0.4rem 0 0;
  color: #6b4f3a;
  font-size: 0.95rem;
}

.popover-starter {
  display: grid;
  gap: 1.25rem;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.popover-starter__copy h2,
.popover-starter__copy p,
.popover-starter__code pre {
  margin: 0;
}

.popover-starter__copy p:last-child {
  color: #6b4f3a;
}

.popover-demos {
  display: grid;
  gap: 1.5rem;
}

@media (min-width: 1024px) {
  .popover-demos {
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    align-items: stretch;
  }
}

.popover-notes {
  gap: 1.5rem;
}

.popover-notes h3 {
  margin: 0 0 0.5rem;
  color: #6b4f3a;
}

.popover-notes p {
  margin: 0;
  color: #6b4f3a;
  line-height: 1.55;
}

@media (max-width: 640px) {
  .popover-hero {
    grid-template-columns: 1fr;
  }
}
</style>
