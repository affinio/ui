import { getCurrentInstance, onBeforeUnmount, ref, shallowRef } from "vue"
import type { Ref, ShallowRef } from "vue"
import type { MenuCallbacks, MenuOptions, MenuState, Rect } from "@affino/menu-core"
import { MenuCore, SubmenuCore, createMenuTree } from "@affino/menu-core"
import type { MenuTreeBranch, MenuTreeController } from "@affino/menu-core"
import { getDocumentOverlayManager, type OverlayManager } from "@affino/overlay-kernel"

export type MenuControllerKind = "root" | "submenu"

export interface MenuController {
  readonly kind: MenuControllerKind
  readonly id: string
  readonly core: MenuCore | SubmenuCore
  readonly state: ShallowRef<MenuState>
  readonly triggerRef: Ref<HTMLElement | null>
  readonly panelRef: Ref<HTMLElement | null>
  readonly anchorRef: ShallowRef<Rect | null>
  readonly open: (reason?: "pointer" | "keyboard" | "programmatic") => void
  readonly close: (reason?: "pointer" | "keyboard" | "programmatic") => void
  readonly toggle: () => void
  readonly highlight: (id: string | null) => void
  readonly select: (id: string) => void
  readonly setAnchor: (rect: Rect | null) => void
  readonly recordPointer?: (point: { x: number; y: number }) => void
  readonly setTriggerRect?: (rect: Rect | null) => void
  readonly setPanelRect?: (rect: Rect | null) => void
  readonly dispose: () => void
}

interface RootControllerConfig {
  kind: "root"
  options?: MenuOptions
  callbacks?: MenuCallbacks
}

interface SubmenuControllerConfig {
  kind: "submenu"
  parent: MenuController | MenuCore
  parentItemId: string
  options?: MenuOptions
  callbacks?: MenuCallbacks
}

export type MenuControllerConfig = RootControllerConfig | SubmenuControllerConfig

export function useMenuController(config: MenuControllerConfig): MenuController {
  const normalizedConfig = normalizeControllerConfig(config)
  const { branch, tree, ownsTree } = resolveBranch(normalizedConfig)
  const triggerRef = ref<HTMLElement | null>(null)
  const panelRef = ref<HTMLElement | null>(null)
  const anchorRef = shallowRef<Rect | null>(null)

  const state = shallowRef<MenuState>(branch.getSnapshot())
  const subscription = branch.subscribe((next) => {
    state.value = next
  })

  let disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    subscription.unsubscribe()
    if (ownsTree && tree) {
      tree.destroy()
    } else {
      branch.destroy()
    }
  }

  const controller: MenuController = {
    kind: normalizedConfig.kind,
    id: branch.id,
    core: branch.core,
    state,
    triggerRef,
    panelRef,
    anchorRef,
    open: (reason) => branch.open(reason),
    close: (reason) => branch.close(reason),
    toggle: () => branch.toggle(),
    highlight: (id) => branch.highlight(id),
    select: (id) => branch.select(id),
    setAnchor: (rect) => {
      anchorRef.value = rect
    },
    recordPointer: branch.pointer ? (point) => branch.pointer?.record(point) : undefined,
    setTriggerRect: branch.geometry ? (rect) => branch.geometry?.setTriggerRect(rect) : undefined,
    setPanelRect: branch.geometry ? (rect) => branch.geometry?.setPanelRect(rect) : undefined,
    dispose,
  }

  if (getCurrentInstance()) {
    onBeforeUnmount(dispose)
  }

  return controller
}

interface ResolvedBranch {
  branch: MenuTreeBranch
  tree?: MenuTreeController
  ownsTree: boolean
}

const treeRegistry = new WeakMap<MenuCore | SubmenuCore, MenuTreeController>()

function resolveBranch(config: MenuControllerConfig): ResolvedBranch {
  if (config.kind === "root") {
    const tree = createMenuTree({ options: config.options, callbacks: config.callbacks })
    const branch = tree.root
    treeRegistry.set(branch.core, tree)
    return { branch, tree, ownsTree: true }
  }

  const parentCore = "core" in config.parent ? config.parent.core : config.parent
  const existingTree = treeRegistry.get(parentCore)
  if (existingTree) {
    try {
      const branch = existingTree.createSubmenu({
        parent: parentCore as MenuCore,
        parentItemId: config.parentItemId,
        options: config.options,
        callbacks: config.callbacks,
      })
      treeRegistry.set(branch.core, existingTree)
      return { branch, tree: existingTree, ownsTree: false }
    } catch {
      const fallbackCore = new SubmenuCore(
        parentCore as MenuCore,
        { ...config.options, parentItemId: config.parentItemId },
        config.callbacks,
      )
      return { branch: branchFromCore(fallbackCore, "submenu"), ownsTree: false }
    }
  }

  const fallbackCore = new SubmenuCore(parentCore as MenuCore, { ...config.options, parentItemId: config.parentItemId }, config.callbacks)
  return { branch: branchFromCore(fallbackCore, "submenu"), ownsTree: false }
}

function branchFromCore(core: MenuCore | SubmenuCore, kind: MenuControllerKind): MenuTreeBranch {
  return {
    kind,
    id: core.id,
    core,
    getSnapshot: () => core.getSnapshot(),
    subscribe: (subscriber) => core.subscribe(subscriber),
    getTriggerProps: () => core.getTriggerProps(),
    getPanelProps: () => core.getPanelProps(),
    getItemProps: (id: string) => core.getItemProps(id),
    registerItem: (id: string, options) => core.registerItem(id, options),
    open: (reason) => core.open(reason),
    close: (reason) => core.close(reason),
    toggle: () => core.toggle(),
    highlight: (id) => core.highlight(id),
    moveFocus: (delta) => core.moveFocus(delta),
    select: (id) => core.select(id),
    geometry: core instanceof SubmenuCore ? createGeometryAdapter(core) : null,
    pointer: core instanceof SubmenuCore ? { record: (point) => core.recordPointer(point) } : null,
    destroy: () => core.destroy(),
  }
}

function createGeometryAdapter(core: SubmenuCore) {
  return {
    setTriggerRect: (rect: Rect | null) => core.setTriggerRect(rect),
    setPanelRect: (rect: Rect | null) => core.setPanelRect(rect),
    sync: (rects: { trigger?: Rect | null; panel?: Rect | null }) => {
      if (Object.prototype.hasOwnProperty.call(rects, "trigger")) {
        core.setTriggerRect(rects.trigger ?? null)
      }
      if (Object.prototype.hasOwnProperty.call(rects, "panel")) {
        core.setPanelRect(rects.panel ?? null)
      }
    },
  }
}

function normalizeControllerConfig(config: MenuControllerConfig): MenuControllerConfig {
  if (config.kind === "root") {
    return {
      ...config,
      options: withDefaultOverlayManager(config.options),
    }
  }
  return {
    ...config,
    options: withDefaultOverlayManager(config.options),
  }
}

function withDefaultOverlayManager(options?: MenuOptions): MenuOptions | undefined {
  const hasManager = options?.overlayManager || options?.getOverlayManager
  if (hasManager) {
    return options
  }
  const getManager = () => resolveDocumentOverlayManager()
  if (!options) {
    return { getOverlayManager: getManager }
  }
  return {
    ...options,
    getOverlayManager: getManager,
  }
}

function resolveDocumentOverlayManager(): OverlayManager | null {
  if (typeof document === "undefined") {
    return null
  }
  return getDocumentOverlayManager(document)
}
