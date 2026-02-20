<script setup lang="ts">
import type { Alignment, MenuCallbacks, MenuOptions, Placement } from "@affino/menu-core"
import { provideMenuProvider } from "../context"
import { useMenuController } from "../useMenuController"

const props = defineProps<{
  options?: MenuOptions
  callbacks?: MenuCallbacks
  placement?: Placement
  align?: Alignment
  gutter?: number
  viewportPadding?: number
}>()

const controller = useMenuController({ kind: "root", options: props.options, callbacks: props.callbacks })

const provider = provideMenuProvider({
  controller,
  positioning: {
    placement: props.placement,
    align: props.align,
    gutter: props.gutter,
    viewportPadding: props.viewportPadding,
  },
})

defineExpose({ controller })
</script>

<template>
  <div class="ui-menu">
    <slot />
  </div>
</template>
