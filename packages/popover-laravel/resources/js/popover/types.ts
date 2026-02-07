import type { PopoverArrowOptions, PopoverContentOptions, PopoverState, PositionOptions, SurfaceReason } from "@affino/popover-core"

export type PopoverHandle = {
  open: (reason?: SurfaceReason) => void
  close: (reason?: SurfaceReason) => void
  toggle: () => void
  getSnapshot: () => PopoverState
}

export type RootEl = HTMLElement & {
  dataset: DOMStringMap & {
    affinoPopoverRoot?: string
    affinoPopoverPlacement?: string
    affinoPopoverAlign?: string
    affinoPopoverGutter?: string
    affinoPopoverViewportPadding?: string
    affinoPopoverStrategy?: string
    affinoPopoverRole?: string
    affinoPopoverModal?: string
    affinoPopoverCloseEscape?: string
    affinoPopoverCloseOutside?: string
    affinoPopoverReturnFocus?: string
    affinoPopoverLockScroll?: string
    affinoPopoverArrowSize?: string
    affinoPopoverArrowInset?: string
    affinoPopoverArrowOffset?: string
    affinoPopoverPinned?: string
    affinoPopoverDefaultOpen?: string
    affinoPopoverManual?: string
    affinoPopoverState?: string
    affinoPopoverStateSync?: string
    affinoPopoverTeleport?: string
    affinoPopoverOwnerId?: string
  }
  affinoPopover?: PopoverHandle
}

export type RootCleanup = () => void
export type Detachment = () => void

export type PopoverOptions = {
  placement: NonNullable<PositionOptions["placement"]>
  align: NonNullable<PositionOptions["align"]>
  gutter: number
  viewportPadding: number
  strategy: "fixed" | "absolute"
  role: NonNullable<PopoverContentOptions["role"]>
  modal: boolean
  closeOnEscape: boolean
  closeOnInteractOutside: boolean
  returnFocus: boolean
  lockScroll: boolean
  arrow: PopoverArrowOptions | null
  pinned: boolean
  defaultOpen: boolean
  teleportTarget: string | null
}
