import { SurfaceCore } from "@affino/surface-core"
import type { SurfaceState } from "@affino/surface-core"
import type {
  TooltipCallbacks,
  TooltipContentProps,
  TooltipOptions,
  TooltipState,
  TooltipTriggerProps,
} from "../types"

export class TooltipCore extends SurfaceCore<TooltipState, TooltipCallbacks> {
  constructor(options: TooltipOptions = {}, callbacks: TooltipCallbacks = {}) {
    super(options, callbacks)
  }

  protected override composeState(surface: SurfaceState): TooltipState {
    return surface
  }

  getTriggerProps(): TooltipTriggerProps {
    return {
      id: `${this.id}-trigger`,
      tabIndex: 0,
      "aria-describedby": `${this.id}-content`,
      onPointerEnter: (event) => {
        this.handlePointerEnter(event)
        this.timers.scheduleOpen(() => this.open("pointer"))
      },
      onPointerLeave: (event) => this.handlePointerLeave(event),
      onFocus: () => this.open("keyboard"),
      onBlur: () => this.close("keyboard"),
    }
  }

  getTooltipProps(): TooltipContentProps {
    return {
      id: `${this.id}-content`,
      role: "tooltip",
      "data-state": this.getSnapshot().open ? "open" : "closed",
      onPointerEnter: (event) => this.handlePointerEnter(event),
      onPointerLeave: (event) => this.handlePointerLeave(event),
    }
  }
}
