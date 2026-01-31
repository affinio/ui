import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    reporters: "dot",
    coverage: {
      reporter: ["text", "lcov"],
    },
  },
})
