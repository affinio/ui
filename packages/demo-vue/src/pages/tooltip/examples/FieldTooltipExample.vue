<script setup lang="ts">
import { computed, ref } from "vue"
import { useTooltipController, useFloatingTooltip } from "@affino/tooltip-vue"

const email = ref("ops@affino.dev")
const controller = useTooltipController({ id: "tooltip-field-demo", openDelay: 0, closeDelay: 160 })
const state = controller.state
const descriptionId = "tooltip-field-live"
const triggerProps = computed(() => controller.getTriggerProps({ describedBy: descriptionId }))
const descriptionProps = computed(() => controller.getDescriptionProps({ id: descriptionId, politeness: "assertive" }))
const tooltipProps = computed(() => controller.getTooltipProps())
const { triggerRef, tooltipRef, tooltipStyle, teleportTarget, arrowProps } = useFloatingTooltip(controller, {
  placement: "top",
  align: "end",
  gutter: 10,
  arrow: { size: 10, inset: 8 },
})

const handleFocus = () => controller.open("keyboard")
const handleBlur = () => controller.close("keyboard")
const handleInput = (event: Event) => {
  const target = event.target as HTMLInputElement
  email.value = target.value
}
</script>

<template>
  <article class="tooltip-card">
    <p class="tooltip-card__eyebrow">Mode 02</p>
    <h3 class="tooltip-card__title">Form guardrails</h3>
    <p class="tooltip-card__text">
      This version is better suited to inputs and settings forms, where the help needs to appear quickly and stay long
      enough to be read without rushing.
    </p>

    <div class="tooltip-field">
      <label class="tooltip-field__label" for="tooltip-email">
        Work email
        <span class="tooltip-inline-anchor">
          <button
            ref="triggerRef"
            type="button"
            class="tooltip-icon-button"
            aria-label="Field requirements"
            v-bind="triggerProps"
          >
            i
          </button>
          <span class="sr-only" v-bind="descriptionProps">
            Use your company email so access can be provisioned across every workspace instantly.
          </span>

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
                <p class="tooltip-bubble__title">Verified domains</p>
                <p class="tooltip-bubble__body">
                  Use your company email so access can be provisioned across every workspace instantly.
                </p>
              </div>
            </transition>
          </Teleport>
        </span>
      </label>

      <input
        id="tooltip-email"
        class="tooltip-input"
        type="email"
        :value="email"
        autocomplete="email"
        placeholder="you@company.com"
        @focus="handleFocus"
        @blur="handleBlur"
        @input="handleInput"
      />
    </div>

    <p class="tooltip-state-chip">State · {{ state.open ? "open" : "closed" }}</p>
  </article>
</template>
