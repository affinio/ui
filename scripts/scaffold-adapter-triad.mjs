#!/usr/bin/env node

import { mkdir, writeFile, access } from "node:fs/promises"
import path from "node:path"
import process from "node:process"

const cwd = process.cwd()
const featureArg = process.argv[2]

if (!featureArg) {
  console.error("Usage: node scripts/scaffold-adapter-triad.mjs <feature-kebab>")
  process.exit(1)
}

const feature = toKebabCase(featureArg)
if (!/^[a-z][a-z0-9-]*$/.test(feature)) {
  console.error(`Invalid feature name "${featureArg}". Use kebab-case like "tabs" or "disclosure".`)
  process.exit(1)
}

const pascal = toPascalCase(feature)
const camel = toCamelCase(feature)
const featureAttr = feature

await scaffoldCore()
await scaffoldVue()
await scaffoldLaravel()

console.log(`Scaffolded packages for "${feature}":`)
console.log(`- packages/${feature}-core`)
console.log(`- packages/${feature}-vue`)
console.log(`- packages/${feature}-laravel`)

async function scaffoldCore() {
  const pkgDir = path.join(cwd, "packages", `${feature}-core`)
  await ensureDir(pkgDir)
  await ensureDir(path.join(pkgDir, "src"))
  await ensureDir(path.join(pkgDir, "src", "__tests__"))

  await write(path.join(pkgDir, "package.json"), corePackageJson())
  await write(path.join(pkgDir, "tsconfig.json"), coreTsconfig())
  await write(path.join(pkgDir, "vitest.config.ts"), vitestConfig())
  await write(path.join(pkgDir, "README.md"), readme("core"))
  await write(path.join(pkgDir, "CHANGELOG.md"), changelog())
  await write(path.join(pkgDir, "src", "index.ts"), coreIndex())
  await write(path.join(pkgDir, "src", "types.ts"), coreTypes())
  await write(path.join(pkgDir, "src", `${pascal}Core.ts`), coreController())
  await write(path.join(pkgDir, "src", "__tests__", `${camel}Core.test.ts`), coreTest())
}

async function scaffoldVue() {
  const pkgDir = path.join(cwd, "packages", `${feature}-vue`)
  await ensureDir(pkgDir)
  await ensureDir(path.join(pkgDir, "src"))
  await ensureDir(path.join(pkgDir, "src", "__tests__"))

  await write(path.join(pkgDir, "package.json"), vuePackageJson())
  await write(path.join(pkgDir, "tsconfig.json"), vueTsconfig())
  await write(path.join(pkgDir, "vitest.config.ts"), vitestConfig())
  await write(path.join(pkgDir, "README.md"), readme("vue"))
  await write(path.join(pkgDir, "CHANGELOG.md"), changelog())
  await write(path.join(pkgDir, "src", "index.ts"), vueIndex())
  await write(path.join(pkgDir, "src", `use${pascal}Controller.ts`), vueController())
  await write(path.join(pkgDir, "src", "__tests__", "indexExports.test.ts"), vueIndexTest())
  await write(path.join(pkgDir, "src", "__tests__", `use${pascal}Controller.test.ts`), vueControllerTest())
}

async function scaffoldLaravel() {
  const pkgDir = path.join(cwd, "packages", `${feature}-laravel`)
  await ensureDir(pkgDir)
  await ensureDir(path.join(pkgDir, "resources", "js"))

  await write(path.join(pkgDir, "package.json"), laravelPackageJson())
  await write(path.join(pkgDir, "tsconfig.json"), laravelTsconfig())
  await write(path.join(pkgDir, "vitest.config.ts"), vitestConfig())
  await write(path.join(pkgDir, "README.md"), readme("laravel"))
  await write(path.join(pkgDir, "CHANGELOG.md"), changelog())
  await write(path.join(pkgDir, "resources", "js", "index.ts"), laravelIndex())
  await write(path.join(pkgDir, "resources", "js", "index.spec.ts"), laravelTest())
}

async function write(filePath, content) {
  if (await exists(filePath)) {
    return
  }
  await writeFile(filePath, content, "utf8")
}

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true })
}

async function exists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

function corePackageJson() {
  return `{
  "name": "@affino/${feature}-core",
  "version": "0.0.1",
  "author": "Anton Pavlov <a.pavlov@affino.dev>",
  "type": "module",
  "description": "Headless ${feature} controller for Affino primitives",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": [
    "dist"
  ],
  "sideEffects": false,
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "license": "MIT",
  "devDependencies": {
    "vitest": "^4.0.15"
  }
}
`
}

function vuePackageJson() {
  return `{
  "name": "@affino/${feature}-vue",
  "version": "0.0.1",
  "author": "Anton Pavlov <a.pavlov@affino.dev>",
  "type": "module",
  "description": "Vue 3 composables for @affino/${feature}-core",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": [
    "dist"
  ],
  "sideEffects": false,
  "peerDependencies": {
    "vue": "^3.3.0"
  },
  "dependencies": {
    "@affino/${feature}-core": "workspace:^"
  },
  "scripts": {
    "build": "tsc --build tsconfig.json",
    "test": "vitest run"
  },
  "license": "MIT",
  "devDependencies": {
    "vue": "^3.4.0",
    "vitest": "^4.0.15"
  }
}
`
}

function laravelPackageJson() {
  return `{
  "name": "@affino/${feature}-laravel",
  "version": "0.0.1",
  "description": "Livewire ${feature} helper wired to @affino/${feature}-core",
  "type": "module",
  "main": "dist/index.cjs",
  "module": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsup resources/js/index.ts --format esm,cjs --dts --clean",
    "test": "vitest run"
  },
  "dependencies": {
    "@affino/${feature}-core": "workspace:*"
  },
  "devDependencies": {
    "tsup": "^8.5.1",
    "vitest": "^4.0.15"
  }
}
`
}

function coreTsconfig() {
  return `{
  "extends": "../../tsconfig.core.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "declaration": true,
    "emitDeclarationOnly": false,
    "declarationMap": true
  },
  "include": ["src"],
  "exclude": ["src/__tests__"]
}
`
}

function vueTsconfig() {
  return `{
  "extends": "../../tsconfig.core.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "declaration": true,
    "emitDeclarationOnly": false,
    "declarationMap": true
  },
  "include": ["src"],
  "references": [{ "path": "../${feature}-core" }]
}
`
}

function laravelTsconfig() {
  return `{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "declaration": true,
    "declarationDir": "dist",
    "emitDeclarationOnly": false,
    "moduleResolution": "bundler",
    "types": ["node"]
  },
  "include": ["resources/js/**/*"]
}
`
}

function vitestConfig() {
  return `import { createWorkspaceVitestConfig } from "../../config/vitest.base"

export default createWorkspaceVitestConfig(import.meta.url, {
  test: {
    coverage: {
      include: ["src/**/*.ts", "resources/js/**/*.ts"],
      exclude: ["src/**/*.d.ts"],
    },
  },
})
`
}

function coreIndex() {
  return `export type * from "./types"
export { ${pascal}Core } from "./${pascal}Core"
`
}

function coreTypes() {
  return `export type ${pascal}State = {
  open: boolean
}

export type ${pascal}Subscriber = (state: ${pascal}State) => void
`
}

function coreController() {
  return `import type { ${pascal}State, ${pascal}Subscriber } from "./types"

export class ${pascal}Core {
  private state: ${pascal}State
  private subscribers = new Set<${pascal}Subscriber>()

  constructor(defaultOpen = false) {
    this.state = { open: defaultOpen }
  }

  open(): void {
    this.patch({ open: true })
  }

  close(): void {
    this.patch({ open: false })
  }

  toggle(): void {
    this.patch({ open: !this.state.open })
  }

  getSnapshot(): ${pascal}State {
    return this.state
  }

  subscribe(subscriber: ${pascal}Subscriber): { unsubscribe: () => void } {
    this.subscribers.add(subscriber)
    subscriber(this.state)
    return {
      unsubscribe: () => {
        this.subscribers.delete(subscriber)
      },
    }
  }

  destroy(): void {
    this.subscribers.clear()
  }

  private patch(next: ${pascal}State): void {
    this.state = next
    this.subscribers.forEach((subscriber) => subscriber(this.state))
  }
}
`
}

function coreTest() {
  return `import { describe, expect, it } from "vitest"
import { ${pascal}Core } from "../${pascal}Core"

describe("${pascal}Core", () => {
  it("tracks open/close state", () => {
    const core = new ${pascal}Core()
    expect(core.getSnapshot().open).toBe(false)
    core.open()
    expect(core.getSnapshot().open).toBe(true)
    core.close()
    expect(core.getSnapshot().open).toBe(false)
  })

  it("notifies subscribers", () => {
    const core = new ${pascal}Core()
    const states: boolean[] = []
    const subscription = core.subscribe((state) => {
      states.push(state.open)
    })
    core.toggle()
    core.toggle()
    subscription.unsubscribe()
    expect(states).toEqual([false, true, false])
  })
})
`
}

function vueIndex() {
  return `export * from "@affino/${feature}-core"
export { use${pascal}Controller } from "./use${pascal}Controller"
export type { ${pascal}Controller } from "./use${pascal}Controller"
`
}

function vueController() {
  return `import { getCurrentScope, onScopeDispose, shallowRef } from "vue"
import type { ShallowRef } from "vue"
import { ${pascal}Core, type ${pascal}State } from "@affino/${feature}-core"

export interface ${pascal}Controller {
  readonly core: ${pascal}Core
  readonly state: ShallowRef<${pascal}State>
  readonly open: () => void
  readonly close: () => void
  readonly toggle: () => void
  readonly dispose: () => void
}

export function use${pascal}Controller(defaultOpen = false): ${pascal}Controller {
  const core = new ${pascal}Core(defaultOpen)
  const state = shallowRef<${pascal}State>(core.getSnapshot())
  const subscription = core.subscribe((next) => {
    state.value = next
  })

  let disposed = false
  const dispose = () => {
    if (disposed) {
      return
    }
    disposed = true
    subscription.unsubscribe()
    core.destroy()
  }

  if (getCurrentScope()) {
    onScopeDispose(dispose)
  }

  return {
    core,
    state,
    open: () => core.open(),
    close: () => core.close(),
    toggle: () => core.toggle(),
    dispose,
  }
}
`
}

function vueIndexTest() {
  return `import { describe, expect, it } from "vitest"
import * as api from "../index"

describe("${feature}-vue index exports", () => {
  it("exposes core and controller helpers", () => {
    expect(typeof api.${pascal}Core).toBe("function")
    expect(typeof api.use${pascal}Controller).toBe("function")
  })
})
`
}

function vueControllerTest() {
  return `import { describe, expect, it } from "vitest"
import { effectScope } from "vue"
import { use${pascal}Controller } from "../use${pascal}Controller"

describe("use${pascal}Controller", () => {
  it("syncs reactive state with core", () => {
    const scope = effectScope()
    let controller!: ReturnType<typeof use${pascal}Controller>
    scope.run(() => {
      controller = use${pascal}Controller(false)
    })
    controller.open()
    expect(controller.state.value.open).toBe(true)
    scope.stop()
  })
})
`
}

function laravelIndex() {
  return `import { ${pascal}Core, type ${pascal}State } from "@affino/${feature}-core"

type ${pascal}Handle = {
  open: () => void
  close: () => void
  toggle: () => void
  getSnapshot: () => ${pascal}State
}

type RootEl = HTMLElement & {
  dataset: DOMStringMap & {
    affino${pascal}Root?: string
    affino${pascal}DefaultOpen?: string
  }
  affino${pascal}?: ${pascal}Handle
}

type Cleanup = () => void

const registry = new WeakMap<RootEl, Cleanup>()

export function bootstrapAffino${pascal}(): void {
  if (typeof document === "undefined") {
    return
  }
  scan(document)
  setupMutationObserver()
}

export function hydrate${pascal}(root: RootEl): void {
  const trigger = root.querySelector<HTMLElement>("[data-affino-${featureAttr}-trigger]")
  const content = root.querySelector<HTMLElement>("[data-affino-${featureAttr}-content]")
  if (!trigger || !content) {
    return
  }

  registry.get(root)?.()

  const core = new ${pascal}Core(readBoolean(root.dataset.affino${pascal}DefaultOpen, false))
  const subscription = core.subscribe((state) => {
    content.hidden = !state.open
    content.dataset.state = state.open ? "open" : "closed"
    root.dataset.affino${pascal}State = state.open ? "open" : "closed"
  })

  const onClick = () => core.toggle()
  trigger.addEventListener("click", onClick)

  root.affino${pascal} = {
    open: () => core.open(),
    close: () => core.close(),
    toggle: () => core.toggle(),
    getSnapshot: () => core.getSnapshot(),
  }

  registry.set(root, () => {
    trigger.removeEventListener("click", onClick)
    subscription.unsubscribe()
    core.destroy()
    if (root.affino${pascal}) {
      delete root.affino${pascal}
    }
    registry.delete(root)
  })
}

function scan(node: ParentNode): void {
  if (node instanceof HTMLElement && node.matches("[data-affino-${featureAttr}-root]")) {
    hydrate${pascal}(node as RootEl)
  }
  node.querySelectorAll<RootEl>("[data-affino-${featureAttr}-root]").forEach((root) => {
    hydrate${pascal}(root)
  })
}

function setupMutationObserver(): void {
  if (typeof window === "undefined") {
    return
  }
  const scope = window as unknown as Record<string, unknown>
  const key = "__affino${pascal}Observer"
  if (scope[key]) {
    return
  }
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement || node instanceof DocumentFragment) {
          scan(node)
        }
      })
    })
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
  scope[key] = observer
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === "true") {
    return true
  }
  if (value === "false") {
    return false
  }
  return fallback
}
`
}

function laravelTest() {
  return `import { describe, expect, it } from "vitest"
import { hydrate${pascal} } from "./index"

describe("${feature}-laravel", () => {
  it("hydrates root and toggles content visibility", () => {
    const root = document.createElement("div")
    root.setAttribute("data-affino-${featureAttr}-root", "test-${feature}")

    const trigger = document.createElement("button")
    trigger.setAttribute("data-affino-${featureAttr}-trigger", "")
    const content = document.createElement("div")
    content.setAttribute("data-affino-${featureAttr}-content", "")
    content.hidden = true

    root.appendChild(trigger)
    root.appendChild(content)
    hydrate${pascal}(root as HTMLElement & { dataset: DOMStringMap })

    trigger.click()
    expect(content.hidden).toBe(false)
    expect(content.dataset.state).toBe("open")
  })
})
`
}

function readme(kind) {
  const title = `@affino/${feature}-${kind}`
  return `# ${title}

Scaffolded ${kind} package for the Affino ${pascal} primitive.

## Scripts

\`\`\`bash
pnpm --filter ${title} build
pnpm --filter ${title} test
\`\`\`
`
}

function changelog() {
  return `# Changelog

## 0.0.1

- Initial scaffold.
`
}

function toKebabCase(value) {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase()
}

function toPascalCase(value) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")
}

function toCamelCase(value) {
  const pascalName = toPascalCase(value)
  return pascalName.charAt(0).toLowerCase() + pascalName.slice(1)
}
