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
      // Do NOT bundle Vue or menu-core
      external: ["vue", "@affino/menu-core"],

      output: {
        exports: "named"
      }
    }
  }
})
