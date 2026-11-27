<script setup lang="ts">
import { ref } from "vue"
import { AffinoSelect } from "@affino/select-vue"
import "@affino/select-vue/styles.css"
import type { SelectOption } from "@affino/select-vue"

type Paper = "A0" | "A1" | "A2" | "A3" | "A4"
const paper = ref<Paper>("A3")
const basic = ref("Draft")
type NumericChoice = 1 | 2 | 3
const numeric = ref<NumericChoice>(2)
const orientation = ref("Portrait")
const font = ref("Inter")
const port = ref("Input")
const line = ref("Solid")
const alignment = ref("Left")
const external = ref("Missing value")
const expanded = ref(false)
const dialogOpen = ref(false)
const papers: SelectOption<Paper>[] = ["A0", "A1", "A2", "A3", "A4"].map(value => ({ value: value as Paper, label: value }))
const basics: SelectOption<string>[] = ["Draft", "Review", "Final"].map(value => ({ value, label: value }))
const numbers: SelectOption<NumericChoice>[] = [{ value: 1, label: "One" }, { value: 2, label: "Two" }, { value: 3, label: "Three" }]
const orientations: SelectOption<string>[] = [{ value: "Portrait", label: "Portrait" }, { value: "Landscape", label: "Landscape" }]
const fonts: SelectOption<string>[] = [{ value: "Inter", label: "Inter" }, { value: "Georgia", label: "Georgia" }, { value: "Monospace", label: "Monospace" }]
const ports: SelectOption<string>[] = [{ value: "Input", label: "Input" }, { value: "Output", label: "Output" }, { value: "Bidirectional", label: "Bidirectional" }]
const lines: SelectOption<string>[] = [{ value: "Solid", label: "Solid" }, { value: "Dashed", label: "Dashed" }, { value: "Dotted", label: "Dotted" }]
const alignments: SelectOption<string>[] = ["Left", "Center", "Right"].map(value => ({ value, label: value }))
const dynamicOptions = ref<SelectOption<string>[]>(basics)
const longOptions: SelectOption<string>[] = [{ value: "long", label: "A very long option label that should wrap inside the popup without breaking a narrow inspector" }]
</script>

<template>
  <main class="select-demo">
    <header><p class="eyebrow">Affino component</p><h1>Select</h1><p>Single-value selection with a listbox popup, compact sizing, typed values, and controlled state.</p></header>
    <section class="select-demo__grid">
      <article class="demo-card"><h2>Basic and typed values</h2>
        <label>Basic Select<AffinoSelect v-model="basic" :options="basics" aria-label="Basic Select" /></label>
        <label>Numeric value<AffinoSelect v-model="numeric" :options="numbers" aria-label="Numeric value" /></label>
        <p>Numeric model remains number: <code>{{ typeof numeric }} / {{ numeric }}</code></p>
        <button @click="numeric = 3">External model update</button>
        <label>Controlled open state<AffinoSelect v-model="basic" v-model:open="expanded" :options="basics" aria-label="Controlled open Select" /></label>
      </article>
      <article class="demo-card"><h2>Compact Inspector</h2><div class="inspector">
        <label>Paper size<AffinoSelect v-model="paper" :options="papers" aria-label="Paper size" size="compact" /></label>
        <label>Orientation<AffinoSelect v-model="orientation" :options="orientations" aria-label="Orientation" size="compact" /></label>
        <label>Font family<AffinoSelect v-model="font" :options="fonts" aria-label="Font family" size="compact" /></label>
        <label>Port direction<AffinoSelect v-model="port" :options="ports" aria-label="Port direction" size="compact" /></label>
        <label>Line style<AffinoSelect v-model="line" :options="lines" aria-label="Line style" size="compact" /></label>
        <label>Text alignment<AffinoSelect v-model="alignment" :options="alignments" aria-label="Text alignment" size="compact" /></label>
      </div></article>
      <article class="demo-card"><h2>Interaction states</h2>
        <label>Disabled control<AffinoSelect :model-value="'Draft'" :options="basics" disabled aria-label="Disabled control" /></label>
        <label>Disabled option<AffinoSelect v-model="basic" :options="[{value:'Draft',label:'Draft'},{value:'Review',label:'Review (locked)',disabled:true},{value:'Final',label:'Final'}]" aria-label="Disabled option" /></label>
        <label>Empty selection<AffinoSelect :model-value="null" :options="basics" placeholder="Choose a stage" aria-label="Empty selection" /></label>
        <label>Unknown selected value<AffinoSelect v-model="external" :options="basics" aria-label="Unknown selected value" /></label>
        <label>Empty options<AffinoSelect :model-value="null" :options="[]" aria-label="Empty options" /></label>
        <label>Long label<AffinoSelect :model-value="'long'" :options="longOptions" aria-label="Long label" /></label>
        <label>Dynamic options<AffinoSelect v-model="basic" :options="dynamicOptions" aria-label="Dynamic options" /></label>
        <button @click="dynamicOptions = [...basics, {value:'Archived',label:'Archived'}]">Add option dynamically</button>
      </article>
      <article class="demo-card"><h2>Dialog overlay</h2>
        <button @click="dialogOpen = true">Open dialog scenario</button>
        <div v-if="dialogOpen" role="dialog" aria-modal="true" aria-label="Document settings" class="select-dialog">
          <h3>Document settings</h3>
          <label>Orientation<AffinoSelect v-model="orientation" :options="orientations" aria-label="Dialog orientation" size="compact" /></label>
          <button @click="dialogOpen = false">Close dialog</button>
        </div>
      </article>
    </section>
    <p class="hint">Try Arrow keys, Home/End, typeahead, Enter/Space, and Escape. Scroll the page to check popup positioning.</p>
  </main>
</template>

<style scoped>
.select-demo{max-width:1100px;margin:0 auto;padding:2rem;color:#202938}.select-demo header{max-width:680px;margin-bottom:1.5rem}.eyebrow{color:#52647a;text-transform:uppercase;letter-spacing:.08em;font-size:.75rem}.select-demo__grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1rem}.demo-card{border:1px solid #d9e0e9;border-radius:.75rem;padding:1rem;background:#fff}.demo-card h2{font-size:1.05rem;margin:0 0 1rem}.demo-card label,.inspector label{display:grid;gap:.35rem;margin:.8rem 0;font-size:.9rem}.inspector{max-width:250px;max-height:330px;overflow:auto;padding:.65rem;border:1px solid #d9e0e9;border-radius:.5rem;background:#f7f9fc}.select-dialog{position:fixed;z-index:2200;inset:20% auto auto 35%;width:min(360px,80vw);padding:1.25rem;background:#fff;border:1px solid #aeb7c4;border-radius:.6rem;box-shadow:0 12px 32px #17203344}.hint{color:#58677a}button{padding:.4rem .65rem}
</style>
