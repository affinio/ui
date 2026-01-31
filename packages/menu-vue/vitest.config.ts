import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"
import vue from "@vitejs/plugin-vue"

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@affino/overlay-host": fileURLToPath(new URL("../overlay-host/src/index.ts", import.meta.url)),
      "@affino/focus-utils": fileURLToPath(new URL("../focus-utils/src/index.ts", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: [fileURLToPath(new URL("./vitest.setup.ts", import.meta.url))],
    css: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,vue}"]
    },
  },
})
