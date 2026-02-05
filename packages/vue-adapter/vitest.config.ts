import { createWorkspaceVitestConfig } from "../../config/vitest.base"

export default createWorkspaceVitestConfig(import.meta.url, {
  test: {
    environment: "jsdom",
    coverage: {
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts"],
    },
  },
})
