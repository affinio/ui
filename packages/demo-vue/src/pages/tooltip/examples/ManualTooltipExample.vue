<script setup lang="ts">
import { computed, ref, watch } from "vue"
import { useTooltipController, useFloatingTooltip } from "@affino/tooltip-vue"

const controller = useTooltipController({ id: "tooltip-manual-demo", openDelay: 240, closeDelay: 220 })
const state = controller.state
const triggerProps = computed(() => controller.getTriggerProps())
const tooltipProps = computed(() => controller.getTooltipProps())
const pinned = ref(false)
const { triggerRef, tooltipRef, tooltipStyle, teleportTarget, arrowProps } = useFloatingTooltip(controller, {
  placement: "top",
  align: "center",
  gutter: 14,
  arrow: { size: 12, inset: 10 },
})

watch(pinned, (next) => {
  if (next) {
    controller.open("programmatic")
  } else {
    controller.close("programmatic")
  }
})

const openNow = () => {
  pinned.value = false
  controller.open("programmatic")
}

const closeNow = () => {
  pinned.value = false
  controller.close("programmatic")
}
</script>

<template>
  <article class="tooltip-card">
    <p class="tooltip-card__eyebrow">Mode 03</p>
    <h3 class="tooltip-card__title">Programmatic control</h3>
    <p class="tooltip-card__text">
      Sometimes the product needs to decide when help stays visible. This example shows a pinned state alongside simple
      open and close actions.
    </p>

    <div class="tooltip-stage tooltip-stage--manual">
      <span ref="triggerRef" class="tooltip-pill" v-bind="triggerProps">Latency SLA</span>

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
            <p class="tooltip-bubble__title">Pinned tooltips</p>
            <p class="tooltip-bubble__body">
              Open the tooltip directly when a guided flow or a longer explanation needs to stay visible.
            </p>
          </div>
        </transition>
      </Teleport>
    </div>

    <div class="tooltip-manual-controls">
      <button type="button" class="tooltip-control" @click="openNow">Open now</button>
      <button type="button" class="tooltip-control" @click="closeNow">Close</button>
      <label class="tooltip-toggle">
        <input type="checkbox" v-model="pinned" />
        Keep open
      </label>
    </div>

    <p class="tooltip-state-chip">
      State ·
      <span :class="{ 'tooltip-state-chip__value': state.open }">{{ state.open ? "open" : "closed" }}</span>
    </p>
  </article>
</template>
