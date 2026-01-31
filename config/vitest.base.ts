import { defineConfig } from "vitest/config"
import type { UserConfig } from "vite"
import { createWorkspaceAliases } from "./workspace-aliases"

export function createWorkspaceVitestConfig(fromUrl: string | URL, overrides: UserConfig = {}) {
  const baseConfig: UserConfig = {
    resolve: {
      alias: createWorkspaceAliases(fromUrl),
    },
    test: {
      environment: "jsdom",
      css: false,
      coverage: {
        provider: "v8",
        reporter: ["text", "html"],
      },
    },
  }

  return defineConfig(mergeVitestConfig(baseConfig, overrides))
}

function mergeVitestConfig(baseConfig: UserConfig, overrides: UserConfig): UserConfig {
  return {
    ...baseConfig,
    ...overrides,
    resolve: {
      alias: {
        ...(baseConfig.resolve?.alias ?? {}),
        ...(overrides.resolve?.alias ?? {}),
      },
    },
    test: {
      ...baseConfig.test,
      ...overrides.test,
      coverage: {
        ...(baseConfig.test?.coverage ?? {}),
        ...(overrides.test?.coverage ?? {}),
      },
    },
  }
}
