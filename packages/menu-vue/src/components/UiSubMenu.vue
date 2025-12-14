<script setup lang="ts">
import type { MenuCallbacks, MenuOptions, SubmenuCore } from "@affino/menu-core"
import { provideMenuProvider, provideSubmenuProvider, useMenuProvider } from "../context"
import { uid } from "../id"
import { useMenuController } from "../useMenuController"
import { usePointerRecorder } from "../usePointerRecorder"

const props = defineProps<{ id?: string; options?: MenuOptions; callbacks?: MenuCallbacks }>()

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
})

provideSubmenuProvider({
  parent: parentProvider,
  child: provider,
})

usePointerRecorder(controller.core as SubmenuCore)

defineExpose({ controller })
</script>

<template>
  <slot />
</template>
