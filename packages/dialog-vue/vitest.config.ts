import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const dialogCoreEntry = fileURLToPath(new URL("../dialog-core/src/index.ts", import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      "@affino/dialog-core": dialogCoreEntry,
    },
  },
  test: {
    environment: "jsdom",
    css: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
    },
  },
})
