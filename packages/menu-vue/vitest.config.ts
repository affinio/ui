import { fileURLToPath } from "node:url"
import vue from "@vitejs/plugin-vue"
import { createWorkspaceVitestConfig } from "../../config/vitest.base"

export default createWorkspaceVitestConfig(import.meta.url, {
  plugins: [vue()],
  test: {
    setupFiles: [fileURLToPath(new URL("./vitest.setup.ts", import.meta.url))],
    coverage: {
      include: ["src/**/*.{ts,vue}"],
    },
  },
})
