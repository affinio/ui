<script setup lang="ts">
import type { Alignment, MenuCallbacks, MenuOptions, Placement } from "@affino/menu-core"
import { provideMenuProvider, provideSubmenuProvider, useMenuProvider } from "../context"
import { uid } from "../id"
import { useMenuController } from "../useMenuController"
import { usePointerRecorder } from "../usePointerRecorder"

const props = defineProps<{
  id?: string
  options?: MenuOptions
  callbacks?: MenuCallbacks
  placement?: Placement
  align?: Alignment
  gutter?: number
  viewportPadding?: number
}>()

const parentProvider = useMenuProvider()
const submenuItemId = props.id ?? uid("ui-submenu-item")

const controller = useMenuController({
  kind: "submenu",
  parent: parentProvider.controller,
  parentItemId: submenuItemId,
  options: props.options,
  callbacks: props.callbacks,
})

const provider = provideMenuProvider({
  controller,
  parent: parentProvider,
  submenuItemId,
  positioning: {
    placement: props.placement,
    align: props.align,
    gutter: props.gutter,
    viewportPadding: props.viewportPadding,
  },
})

provideSubmenuProvider({
  parent: parentProvider,
  child: provider,
})

usePointerRecorder(controller.recordPointer)

defineExpose({ controller })
</script>

<template>
  <slot />
</template>
