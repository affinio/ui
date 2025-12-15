import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import { fileURLToPath } from "node:url"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    css: false,
    setupFiles: [fileURLToPath(new URL("./vitest.setup.ts", import.meta.url))],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
    },
  },
})
