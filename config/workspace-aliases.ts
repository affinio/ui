import { existsSync } from "node:fs"
import { dirname, join, parse } from "node:path"
import { fileURLToPath, URL } from "node:url"

const WORKSPACE_ALIAS_TARGETS: Record<string, string> = {
  "@": "demo-vue/src",
  "@affino/dialog-core": "packages/dialog-core/src/index.ts",
  "@affino/dialog-vue": "packages/dialog-vue/src/index.ts",
  "@affino/grid-selection-core": "packages/grid-selection-core/src/index.ts",
  "@affino/grid-selection-vue": "packages/grid-selection-vue/src/index.ts",
  "@affino/listbox-core": "packages/listbox-core/src/index.ts",
  "@affino/menu-core": "packages/menu-core/src/index.ts",
  "@affino/menu-react/styles.css": "packages/menu-react/src/styles.css",
  "@affino/menu-react": "packages/menu-react/src/index.ts",
  "@affino/menu-vue/styles.css": "packages/menu-vue/src/styles.css",
  "@affino/menu-vue": "packages/menu-vue/src/index.ts",
  "@affino/selection-core": "packages/selection-core/src/index.ts",
  "@affino/selection-vue": "packages/selection-vue/src/index.ts",
  "@affino/tabs-core": "packages/tabs-core/src/index.ts",
  "@affino/tabs-vue": "packages/tabs-vue/src/index.ts",
  "@affino/disclosure-core": "packages/disclosure-core/src/index.ts",
  "@affino/disclosure-vue": "packages/disclosure-vue/src/index.ts",
  "@affino/surface-core": "packages/surface-core/src/index.ts",
  "@affino/tooltip-core": "packages/tooltip-core/src/index.ts",
  "@affino/tooltip-vue": "packages/tooltip-vue/src/index.ts",
  "@affino/vue-adapter": "packages/vue-adapter/src/index.ts",
  "@affino/popover-core": "packages/popover-core/src/index.ts",
  "@affino/popover-vue": "packages/popover-vue/src/index.ts",
  "@affino/virtualization-core": "packages/virtualization-core/src/index.ts",
  "@affino/overlay-host": "packages/overlay-host/src/index.ts",
  "@affino/overlay-kernel": "packages/overlay-kernel/src/index.ts",
  "@affino/focus-utils": "packages/focus-utils/src/index.ts",
  "@affino/aria-utils": "packages/aria-utils/src/index.ts",
  "@affino/dialog-laravel": "packages/dialog-laravel/resources/js/index.ts",
  "@affino/tooltip-laravel": "packages/tooltip-laravel/resources/js/index.ts",
  "@affino/popover-laravel": "packages/popover-laravel/resources/js/index.ts",
  "@affino/listbox-laravel": "packages/listbox-laravel/resources/js/index.ts",
  "@affino/combobox-laravel": "packages/combobox-laravel/resources/js/index.ts",
  "@affino/menu-laravel": "packages/menu-laravel/resources/js/index.ts",
  "@affino/tabs-laravel": "packages/tabs-laravel/resources/js/index.ts",
  "@affino/disclosure-laravel": "packages/disclosure-laravel/resources/js/index.ts",
}

export type AliasOverrides = Record<string, string>

export function createWorkspaceAliases(fromUrl: string | URL, overrides: AliasOverrides = {}): Record<string, string> {
  const workspaceRoot = findWorkspaceRootDir(fromUrl)
  const resolvedEntries = Object.entries({ ...WORKSPACE_ALIAS_TARGETS, ...overrides }).map(([alias, relativePath]) => {
    const targetUrl = new URL(relativePath, workspaceRoot)
    return [alias, fileURLToPath(targetUrl)] as const
  })
  return Object.fromEntries(resolvedEntries)
}

function findWorkspaceRootDir(fromUrl: string | URL): URL {
  let currentDir = dirname(fileURLToPath(fromUrl instanceof URL ? fromUrl : new URL(fromUrl)))
  const { root } = parse(currentDir)
  while (currentDir && currentDir !== root) {
    if (existsSync(join(currentDir, "pnpm-workspace.yaml"))) {
      return new URL(`${currentDir}/`, "file://")
    }
    currentDir = dirname(currentDir)
  }
  return new URL(`${currentDir}/`, "file://")
}
