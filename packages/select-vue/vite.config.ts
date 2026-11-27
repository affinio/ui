import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"

export default defineConfig({
  plugins: [vue({ script: { defineModel: true } })],
  build: {
    lib: { entry: "src/index.ts", formats: ["es"], fileName: "index", cssFileName: "styles" },
    rollupOptions: {
      external: ["vue", "@affino/listbox-core", "@affino/popover-vue"],
      output: { inlineDynamicImports: true },
    },
  },
})
