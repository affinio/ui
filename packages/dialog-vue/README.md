# @affino/dialog-vue

Vue 3 bindings for [`@affino/dialog-core`](../dialog-core) that expose a lightweight Composition API for wiring dialogs into templates without re-implementing state machines.

## Installation

```bash
pnpm add @affino/dialog-vue
```

Make sure `vue` and `@affino/dialog-core` are also available in your project.

## Usage

```ts
<script setup lang="ts">
import { ref } from "vue"
import { useDialogController, createDialogFocusOrchestrator } from "@affino/dialog-vue"

const triggerRef = ref<HTMLElement | null>(null)
const dialogRef = ref<HTMLElement | null>(null)

const orchestrator = createDialogFocusOrchestrator({
  dialog: dialogRef,
  returnFocus: triggerRef,
})

const dialog = useDialogController({ focusOrchestrator: orchestrator })
</script>

<template>
  <button ref="triggerRef" @click="dialog.open()">Open</button>
  <dialog ref="dialogRef" v-if="dialog.snapshot.isOpen">
    <p>Dialog content</p>
    <button @click="dialog.close()">Close</button>
  </dialog>
</template>
```

## API

- `useDialogController(options?: DialogControllerOptions)`
  - Returns the underlying `DialogController`, a reactive `snapshot`, helpers for `open`, `close`, and a `dispose` method that unsubscribes the internal listener.
- `createDialogFocusOrchestrator(options)`
  - Creates a `DialogFocusOrchestrator` that can focus a dialog container on open and restore focus to a trigger (or the previously focused element) on close.

These bindings stay intentionally small: they keep the core controller unmodified and work alongside your existing UI/layout system.
