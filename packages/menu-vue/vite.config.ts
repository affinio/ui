import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"
import { resolve } from "node:path"

export default defineConfig({
  plugins: [vue()],

  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      formats: ["es"],
      fileName: "index",
      cssFileName: "styles"
    },

    rollupOptions: {
      // Do NOT bundle Vue or shared workspace packages
      external: ["vue", "@affino/menu-core", "@affino/overlay-host", "@affino/focus-utils"],

      output: {
        exports: "named"
      }
    }
  }
})
