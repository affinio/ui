import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    reporters: "dot",
    globals: true,
    coverage: {
      reporter: ["text", "lcov"],
    },
  },
})
