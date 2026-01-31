import type {
  ItemProps,
  MenuCallbacks,
  MenuOptions,
  MenuState,
  MenuSubscriber,
  PanelProps,
  Point,
  Rect,
  TriggerProps,
} from "./types"
import { MenuCore } from "./core/MenuCore"
import { SubmenuCore } from "./core/SubmenuCore"

export type MenuTreeBranchKind = "root" | "submenu"

export interface MenuTreeBranch {
  readonly kind: MenuTreeBranchKind
  readonly id: string
  readonly core: MenuCore | SubmenuCore
  readonly getSnapshot: () => MenuState
  readonly subscribe: (subscriber: MenuSubscriber) => ReturnType<MenuCore["subscribe"]>
  readonly getTriggerProps: () => TriggerProps
  readonly getPanelProps: () => PanelProps
  readonly getItemProps: (id: string) => ItemProps
  readonly registerItem: (id: string, options?: Parameters<MenuCore["registerItem"]>[1]) => () => void
  readonly open: (reason?: Parameters<MenuCore["open"]>[0]) => void
  readonly close: (reason?: Parameters<MenuCore["close"]>[0]) => void
  readonly toggle: () => void
  readonly highlight: (id: string | null) => void
  readonly moveFocus: (delta: 1 | -1) => void
  readonly select: (id: string) => void
  readonly geometry: SubmenuGeometryAdapter | null
  readonly pointer: SubmenuPointerAdapter | null
  readonly destroy: () => void
}

export interface SubmenuGeometryAdapter {
  setTriggerRect: (rect: Rect | null) => void
  setPanelRect: (rect: Rect | null) => void
  sync: (rects: { trigger?: Rect | null; panel?: Rect | null }) => void
}

export interface SubmenuPointerAdapter {
  record: (point: Point) => void
}

export interface CreateMenuTreeOptions {
  options?: MenuOptions
  callbacks?: MenuCallbacks
}

export interface CreateSubmenuBranchOptions {
  parent: MenuTreeBranch | MenuCore
  parentItemId: string
  options?: MenuOptions
  callbacks?: MenuCallbacks
}

export interface MenuTreeController {
  readonly root: MenuTreeBranch
  createSubmenu(options: CreateSubmenuBranchOptions): MenuTreeBranch
  destroy(): void
}

export function createMenuTree(config: CreateMenuTreeOptions = {}): MenuTreeController {
  const branches = new Set<MenuTreeBranch>()

  const unregister = (branch: MenuTreeBranch) => {
    branches.delete(branch)
  }

  const rootCore = new MenuCore(config.options, config.callbacks)
  const rootBranch = createBranch(rootCore, "root", unregister)
  branches.add(rootBranch)

  return {
    root: rootBranch,
    createSubmenu: (options) => {
      const parentCore = "core" in options.parent ? options.parent.core : options.parent
      const submenuCore = new SubmenuCore(parentCore as MenuCore, { ...options.options, parentItemId: options.parentItemId }, options.callbacks)
      const branch = createBranch(submenuCore, "submenu", unregister)
      branches.add(branch)
      return branch
    },
    destroy: () => {
      for (const branch of Array.from(branches)) {
        branch.destroy()
      }
      branches.clear()
    },
  }
}

function createBranch(
  core: MenuCore | SubmenuCore,
  kind: MenuTreeBranchKind,
  unregister: (branch: MenuTreeBranch) => void,
): MenuTreeBranch {
  let destroyed = false
  const geometry = core instanceof SubmenuCore ? createGeometryAdapter(core) : null
  const pointer = core instanceof SubmenuCore ? createPointerAdapter(core) : null

  const branch: MenuTreeBranch = {
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
    geometry,
    pointer,
    destroy: () => {
      if (destroyed) return
      destroyed = true
      core.destroy()
      unregister(branch)
    },
  }

  return branch
}

function createGeometryAdapter(core: SubmenuCore): SubmenuGeometryAdapter {
  return {
    setTriggerRect: (rect) => core.setTriggerRect(rect),
    setPanelRect: (rect) => core.setPanelRect(rect),
    sync: (rects) => {
      if (Object.prototype.hasOwnProperty.call(rects, "trigger")) {
        core.setTriggerRect(rects.trigger ?? null)
      }
      if (Object.prototype.hasOwnProperty.call(rects, "panel")) {
        core.setPanelRect(rects.panel ?? null)
      }
    },
  }
}

function createPointerAdapter(core: SubmenuCore): SubmenuPointerAdapter {
  return {
    record: (point) => core.recordPointer(point),
  }
}
