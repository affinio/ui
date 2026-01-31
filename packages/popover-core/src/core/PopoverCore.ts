import { SurfaceCore } from "@affino/surface-core"
import type { SurfaceState } from "@affino/surface-core"
import type {
  PopoverArrowParams,
  PopoverArrowProps,
  PopoverCallbacks,
  PopoverContentOptions,
  PopoverContentProps,
  PopoverInteractOutsideEvent,
  PopoverOptions,
  PopoverRole,
  PopoverState,
  PopoverTriggerOptions,
  PopoverTriggerProps,
} from "../types"

const DEFAULT_ROLE: PopoverRole = "dialog"

export class PopoverCore extends SurfaceCore<PopoverState, PopoverCallbacks> {
  private readonly role: PopoverRole
  private readonly modal: boolean
  private readonly closeOnEscape: boolean
  private readonly closeOnInteractOutside: boolean

  constructor(options: PopoverOptions = {}, callbacks: PopoverCallbacks = {}) {
    super(options, callbacks)
    this.role = options.role ?? DEFAULT_ROLE
    this.modal = options.modal ?? false
    this.closeOnEscape = options.closeOnEscape ?? true
    this.closeOnInteractOutside = options.closeOnInteractOutside ?? true
  }

  protected override composeState(surface: SurfaceState): PopoverState {
    return surface
  }

  getTriggerProps(options: PopoverTriggerOptions = {}): PopoverTriggerProps {
    const disabled = options.disabled ?? false
    const type = options.type ?? "button"
    const role = options.role ?? this.role
    return {
      id: this.triggerId,
      type,
      disabled,
      "aria-haspopup": role,
      "aria-expanded": this.surfaceState.open ? "true" : "false",
      "aria-controls": this.contentId,
      onClick: (event) => {
        if (disabled) return
        event.preventDefault?.()
        this.toggle()
      },
      onKeyDown: (event) => {
        if (disabled) return
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault()
          this.toggle()
        } else if (event.key === "Escape" && this.closeOnEscape) {
          event.stopPropagation()
          this.close("keyboard")
        }
      },
    }
  }

  getContentProps(options: PopoverContentOptions = {}): PopoverContentProps {
    const role = options.role ?? this.role
    const modal = options.modal ?? this.modal
    return {
      id: this.contentId,
      role,
      tabIndex: options.tabIndex ?? -1,
      "aria-modal": modal ? "true" : undefined,
      "data-state": this.surfaceState.open ? "open" : "closed",
      onKeyDown: (event) => {
        if (event.key === "Escape" && this.closeOnEscape) {
          event.stopPropagation()
          this.close("keyboard")
        }
      },
    }
  }

  getArrowProps(params: PopoverArrowParams): PopoverArrowProps {
    return resolveArrowProps(params)
  }

  interactOutside(payload: PopoverInteractOutsideEvent) {
    this.callbacks.onInteractOutside?.(payload)
    if (this.closeOnInteractOutside) {
      this.close("pointer")
    }
  }

  shouldCloseOnInteractOutside(): boolean {
    return this.closeOnInteractOutside
  }

  isModal(): boolean {
    return this.modal
  }

  private get triggerId() {
    return `${this.id}-trigger`
  }

  private get contentId() {
    return `${this.id}-content`
  }
}

const STATIC_SIDES: Record<PopoverArrowProps["data-placement"], "top" | "right" | "bottom" | "left"> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
}

const isVerticalPlacement = (placement: PopoverArrowProps["data-placement"]) => placement === "top" || placement === "bottom"

const clamp = (value: number, min: number, max: number) => {
  if (Number.isNaN(value)) return min
  if (value < min) return min
  if (value > max) return max
  return value
}

function resolveArrowProps({ anchorRect, popoverRect, position, options = {} }: PopoverArrowParams): PopoverArrowProps {
  const placement = position.placement
  const align = position.align
  const isVertical = isVerticalPlacement(placement)
  const size = Math.max(options.size ?? 10, 1)
  const inset = Math.max(options.inset ?? 4, 0)
  const staticOffset = options.staticOffset ?? size / 2
  const half = size / 2
  const surfaceSpan = isVertical ? popoverRect.width : popoverRect.height
  const anchorCenter = isVertical ? anchorRect.x + anchorRect.width / 2 : anchorRect.y + anchorRect.height / 2
  const surfaceStart = isVertical ? position.left : position.top
  const rawCenter = anchorCenter - surfaceStart
  const min = inset + half
  const max = Math.max(min, surfaceSpan - inset - half)
  const center = clamp(rawCenter, min, max)
  const crossOffset = center - half

  const style: Record<string, string | number> = {
    "--popover-arrow-size": `${size}px`,
    "--popover-arrow-align": align,
  }

  if (isVertical) {
    style.left = `${crossOffset}px`
  } else {
    style.top = `${crossOffset}px`
  }

  const staticSide = STATIC_SIDES[placement]
  style[staticSide] = `${-staticOffset}px`

  return {
    "data-placement": placement,
    "data-align": align,
    "data-arrow": placement,
    style,
  }
}
