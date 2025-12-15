import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { MutableRefObject } from "react"
import type { MenuCallbacks, MenuOptions, MenuState, Rect } from "@affino/menu-core"
import { MenuCore, SubmenuCore } from "@affino/menu-core"

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

  const coreRef = useRef<MenuCore | SubmenuCore | null>(null)
  if (!coreRef.current) {
    coreRef.current = createCore(config)
  }
  const core = coreRef.current
  const submenuAdapters = useMemo(() => createSubmenuAdapters(core), [core])

  const [state, setState] = useState<MenuState>(core.getSnapshot())

  const disposeRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    let disposed = false
    const subscription = core.subscribe((next) => {
      setState(next)
    })

    const dispose = () => {
      if (disposed) return
      disposed = true
      subscription.unsubscribe()
      core.destroy()
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
    ...submenuAdapters,
  }), [config.kind, core, state, versions, setAnchor, setTriggerElement, setPanelElement, dispose, submenuAdapters])

  return controller
}

function createCore(config: MenuControllerConfig) {
  if (config.kind === "submenu") {
    const parentCore = "core" in config.parent ? config.parent.core : config.parent
    return new SubmenuCore(parentCore as MenuCore, { ...config.options, parentItemId: config.parentItemId }, config.callbacks)
  }
  return new MenuCore(config.options, config.callbacks)
}

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
