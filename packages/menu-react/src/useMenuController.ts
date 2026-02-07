import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { MutableRefObject } from "react"
import type { MenuCallbacks, MenuOptions, MenuState, Rect } from "@affino/menu-core"
import { MenuCore, SubmenuCore, createMenuTree } from "@affino/menu-core"
import type { MenuTreeBranch, MenuTreeController } from "@affino/menu-core"

export type MenuControllerKind = "root" | "submenu"

interface Versions {
  trigger: number
  panel: number
  anchor: number
}

export interface MenuController {
  readonly kind: MenuControllerKind
  readonly id: string
  readonly core: MenuCore | SubmenuCore
  readonly state: MenuState
  readonly triggerRef: MutableRefObject<HTMLElement | null>
  readonly panelRef: MutableRefObject<HTMLElement | null>
  readonly anchorRef: MutableRefObject<Rect | null>
  readonly versions: Versions
  readonly open: (reason?: "pointer" | "keyboard" | "programmatic") => void
  readonly close: (reason?: "pointer" | "keyboard" | "programmatic") => void
  readonly toggle: () => void
  readonly highlight: (id: string | null) => void
  readonly select: (id: string) => void
  readonly setAnchor: (rect: Rect | null) => void
  readonly setTriggerElement: (element: HTMLElement | null) => void
  readonly setPanelElement: (element: HTMLElement | null) => void
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
  const triggerRef = useRef<HTMLElement | null>(null)
  const panelRef = useRef<HTMLElement | null>(null)
  const anchorRef = useRef<Rect | null>(null)
  const versionsRef = useRef<Versions>({ trigger: 0, panel: 0, anchor: 0 })
  const [versions, setVersions] = useState<Versions>(versionsRef.current)

  const resolvedRef = useRef<ResolvedBranch | null>(null)
  if (!resolvedRef.current) {
    resolvedRef.current = resolveBranch(config)
  }
  const resolved = resolvedRef.current
  const { branch, tree, ownsTree } = resolved
  const core = branch.core
  const [state, setState] = useState<MenuState>(branch.getSnapshot())

  const disposeRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    let disposed = false
    const subscription = branch.subscribe((next) => {
      setState(next)
    })

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

    disposeRef.current = dispose

    return () => {
      dispose()
      disposeRef.current = null
    }
  }, [core])

  const bumpVersion = useCallback((key: keyof Versions) => {
    versionsRef.current = { ...versionsRef.current, [key]: versionsRef.current[key] + 1 }
    setVersions(versionsRef.current)
  }, [])

  const setAnchor = useCallback((rect: Rect | null) => {
    const prev = anchorRef.current
    const isSame = (
      prev?.x === rect?.x &&
      prev?.y === rect?.y &&
      prev?.width === rect?.width &&
      prev?.height === rect?.height
    )
    if (isSame) {
      return
    }
    anchorRef.current = rect
    bumpVersion("anchor")
  }, [bumpVersion])

  const setTriggerElement = useCallback((element: HTMLElement | null) => {
    if (triggerRef.current === element) {
      return
    }
    triggerRef.current = element
    bumpVersion("trigger")
  }, [bumpVersion])

  const setPanelElement = useCallback((element: HTMLElement | null) => {
    if (panelRef.current === element) {
      return
    }
    panelRef.current = element
    bumpVersion("panel")
  }, [bumpVersion])

  const dispose = useCallback(() => {
    disposeRef.current?.()
  }, [])

  const controller = useMemo<MenuController>(() => ({
    kind: config.kind,
    id: core.id,
    core,
    state,
    triggerRef,
    panelRef,
    anchorRef,
    versions,
    open: (reason) => core.open(reason),
    close: (reason) => core.close(reason),
    toggle: () => core.toggle(),
    highlight: (id) => core.highlight(id),
    select: (id) => core.select(id),
    setAnchor,
    setTriggerElement,
    setPanelElement,
    dispose,
    recordPointer: branch.pointer ? (point) => branch.pointer?.record(point) : undefined,
    setTriggerRect: branch.geometry ? (rect) => branch.geometry?.setTriggerRect(rect) : undefined,
    setPanelRect: branch.geometry ? (rect) => branch.geometry?.setPanelRect(rect) : undefined,
  }), [config.kind, core, state, versions, setAnchor, setTriggerElement, setPanelElement, dispose, branch])

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
