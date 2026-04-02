<script setup lang="ts">
import { computed } from "vue"
import { useTooltipController, useFloatingTooltip } from "@affino/tooltip-vue"

const overlayOwnerId = "tooltip-basic-owner"
const overlayPriority = 15

const controller = useTooltipController(
  {
    id: "tooltip-basic-demo",
    openDelay: 120,
    closeDelay: 120,
    overlayKind: "tooltip",
    overlayEntryTraits: {
      ownerId: overlayOwnerId,
      priority: overlayPriority,
      returnFocus: false,
      data: { demo: "basic" },
    },
  },
)

const state = controller.state
const triggerProps = computed(() => controller.getTriggerProps())
const tooltipProps = computed(() => controller.getTooltipProps())
const { triggerRef, tooltipRef, tooltipStyle, teleportTarget, arrowProps } = useFloatingTooltip(controller, {
  placement: "top",
  align: "center",
  gutter: 12,
  arrow: { size: 12, inset: 10 },
})

const overlaySummary = computed(() => `${overlayOwnerId} · priority ${overlayPriority}`)
</script>

<template>
  <article class="tooltip-card">
    <p class="tooltip-card__eyebrow">Mode 01</p>
    <h3 class="tooltip-card__title">Hover + focus</h3>
    <p class="tooltip-card__text">
      The most familiar tooltip pattern: hover with a pointer, focus with a keyboard, and show the same small piece of
      supporting context in both cases.
    </p>

    <div class="tooltip-stage">
      <button ref="triggerRef" type="button" class="tooltip-trigger" v-bind="triggerProps">
        Inspect SLA
      </button>

      <Teleport :to="teleportTarget">
        <transition name="tooltip-fade">
          <div
            v-if="state.open"
            ref="tooltipRef"
            class="tooltip-bubble"
            v-bind="tooltipProps"
            :style="tooltipStyle"
          >
            <span v-if="arrowProps" class="tooltip-arrow" v-bind="arrowProps" :style="arrowProps.style"></span>
            <p class="tooltip-bubble__title">Always-on</p>
            <p class="tooltip-bubble__body">
              Replies land in under 4 minutes, with coverage carried across 11 regions.
            </p>
          </div>
        </transition>
      </Teleport>
    </div>

    <p class="tooltip-state-chip">
      <span>State · {{ state.open ? "open" : "closed" }}</span>
      <span class="tooltip-state-chip__meta">Kernel · {{ overlaySummary }}</span>
    </p>
  </article>
</template>
