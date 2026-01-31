import react from "@vitejs/plugin-react"
import { fileURLToPath } from "node:url"
import { createWorkspaceVitestConfig } from "../../config/vitest.base"

export default createWorkspaceVitestConfig(import.meta.url, {
  plugins: [react()],
  test: {
    setupFiles: [fileURLToPath(new URL("./vitest.setup.ts", import.meta.url))],
    coverage: {
      include: ["src/**/*.{ts,tsx}"],
    },
  },
})
