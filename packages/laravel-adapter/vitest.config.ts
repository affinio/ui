import { createWorkspaceVitestConfig } from "../../config/vitest.base"

export default createWorkspaceVitestConfig(import.meta.url, {
  test: {
    environment: "jsdom",
    coverage: {
      include: ["resources/js/**/*.ts"],
      exclude: ["resources/js/**/*.d.ts"],
    },
  },
})
