import type { TooltipTriggerProps, TooltipState, TooltipReason } from "@affino/tooltip-core"

export type TooltipHandle = {
  open: (reason?: TooltipReason) => void
  close: (reason?: TooltipReason) => void
  toggle: (reason?: TooltipReason) => void
  getSnapshot: () => TooltipState
}

export type TriggerMode = "hover" | "focus" | "hover-focus" | "click" | "manual"

export type RootEl = HTMLElement & {
  dataset: DOMStringMap & {
    affinoTooltipRoot?: string
    affinoTooltipPlacement?: string
    affinoTooltipAlign?: string
    affinoTooltipGutter?: string
    affinoTooltipStrategy?: string
    affinoTooltipOpenDelay?: string
    affinoTooltipCloseDelay?: string
    affinoTooltipTriggerMode?: string
    affinoTooltipPinned?: string
  }
  affinoTooltip?: TooltipHandle
}

export type Cleanup = (options?: { releaseFocus?: boolean }) => void

export type TriggerEventHandlers = Pick<TooltipTriggerProps, "onPointerEnter" | "onPointerLeave" | "onFocus" | "onBlur">

export type TriggerListenerEvent = keyof HTMLElementEventMap | "focusin" | "focusout"

export type CSSPosition = Extract<CSSStyleDeclaration["position"], "fixed" | "absolute">
