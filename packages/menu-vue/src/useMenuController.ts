import { onBeforeUnmount, ref, shallowRef } from "vue"
import type { Ref, ShallowRef } from "vue"
import type { MenuCallbacks, MenuOptions, MenuState, Rect } from "@affino/menu-core"
import { MenuCore, SubmenuCore } from "@affino/menu-core"

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
  const triggerRef = ref<HTMLElement | null>(null)
  const panelRef = ref<HTMLElement | null>(null)
  const anchorRef = shallowRef<Rect | null>(null)

  const core = createCore(config)

  const state = shallowRef<MenuState>(core.getSnapshot())
  const subscription = core.subscribe((next) => {
    state.value = next
  })

  let disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    subscription.unsubscribe()
    core.destroy()
  }

  const controller: MenuController = {
    kind: config.kind,
    id: core.id,
    core,
    state,
    triggerRef,
    panelRef,
    anchorRef,
    open: (reason) => core.open(reason),
    close: (reason) => core.close(reason),
    toggle: () => core.toggle(),
    highlight: (id) => core.highlight(id),
    select: (id) => core.select(id),
    setAnchor: (rect) => {
      anchorRef.value = rect
    },
    dispose,
    ...createSubmenuAdapters(core),
  }

  onBeforeUnmount(dispose)

  return controller
}

/** Chooses the appropriate core implementation based on the requested controller kind. */
function createCore(config: MenuControllerConfig) {
  if (config.kind === "submenu") {
    const parentCore = "core" in config.parent ? config.parent.core : config.parent
    return new SubmenuCore(parentCore as MenuCore, { ...config.options, parentItemId: config.parentItemId }, config.callbacks)
  }
  return new MenuCore(config.options, config.callbacks)
}

/**
 * Submenus expose extra geometry helpers that the adapter can optionally consume.
 * Root menus ignore these hooks to keep the controller surface minimal.
 */
function createSubmenuAdapters(core: MenuCore | SubmenuCore) {
  if (!(core instanceof SubmenuCore)) {
    return {}
  }
  return {
    recordPointer: (point: { x: number; y: number }) => core.recordPointer(point),
    setTriggerRect: (rect: Rect | null) => core.setTriggerRect(rect),
    setPanelRect: (rect: Rect | null) => core.setPanelRect(rect),
  }
}
