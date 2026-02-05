import type { MenuState } from "@affino/menu-core"
import type { SurfaceReason } from "@affino/surface-core"
import type { OverlayKind } from "@affino/overlay-kernel"

export type Cleanup = () => void

export type MenuHandle = {
  open: (reason?: SurfaceReason) => void
  close: (reason?: SurfaceReason) => void
  toggle: () => void
  highlight: (itemId: string | null) => void
  getSnapshot: () => MenuState
}

export type MenuSnapshot = MenuState

export type RootEl = HTMLElement & {
  dataset: DOMStringMap & {
    affinoMenuRoot?: string
    affinoMenuState?: string
    affinoMenuPlacement?: string
    affinoMenuAlign?: string
    affinoMenuGutter?: string
    affinoMenuViewportPadding?: string
    affinoMenuLoop?: string
    affinoMenuCloseSelect?: string
    affinoMenuDefaultOpen?: string
    affinoMenuPortal?: string
    affinoMenuPinned?: string
    affinoMenuOpenDelay?: string
    affinoMenuCloseDelay?: string
    affinoMenuOverlayKind?: OverlayKind
    affinoMenuOverlayOwner?: string
    affinoMenuOverlayPriority?: string
    affinoMenuOverlayReturnFocus?: string
    affinoMenuOverlayModal?: string
    affinoMenuLockScroll?: string
    affinoMenuAutofocus?: string
  }
  affinoMenu?: MenuHandle
}

export type TriggerEl = HTMLElement

export type PanelEl = HTMLElement

export type ItemEl = HTMLElement & {
  dataset: DOMStringMap & {
    affinoMenuItem?: string
  }
}

export type PointerIntent = "pointer" | "keyboard"

export type PositioningOptions = {
  placement: "top" | "bottom" | "left" | "right" | "auto"
  align: "start" | "center" | "end" | "auto"
  gutter: number
  viewportPadding: number
}

export type AutofocusTarget = "panel" | "item" | "none"
