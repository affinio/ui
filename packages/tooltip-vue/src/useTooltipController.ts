import { onBeforeUnmount, shallowRef } from "vue"
import type { ShallowRef } from "vue"
import type {
  TooltipCallbacks,
  TooltipContentProps,
  TooltipOptions,
  TooltipReason,
  TooltipState,
  TooltipTriggerProps,
} from "@affino/tooltip-core"
import { TooltipCore } from "@affino/tooltip-core"

type VueTriggerProps = Omit<TooltipTriggerProps, "onPointerEnter" | "onPointerLeave"> & {
  onPointerenter?: TooltipTriggerProps["onPointerEnter"]
  onPointerleave?: TooltipTriggerProps["onPointerLeave"]
}

type VueTooltipProps = Omit<TooltipContentProps, "onPointerEnter" | "onPointerLeave"> & {
  onPointerenter?: TooltipContentProps["onPointerEnter"]
  onPointerleave?: TooltipContentProps["onPointerLeave"]
}

export interface TooltipController {
  readonly id: string
  readonly core: TooltipCore
  readonly state: ShallowRef<TooltipState>
  readonly getTriggerProps: () => VueTriggerProps
  readonly getTooltipProps: () => VueTooltipProps
  readonly open: (reason?: TooltipReason) => void
  readonly close: (reason?: TooltipReason) => void
  readonly toggle: () => void
  readonly dispose: () => void
}

export function useTooltipController(options?: TooltipOptions, callbacks?: TooltipCallbacks): TooltipController {
  const core = new TooltipCore(options, callbacks)
  const state = shallowRef<TooltipState>(core.getSnapshot())
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

  onBeforeUnmount(dispose)

  return {
    id: core.id,
    core,
    state,
    getTriggerProps: () => mapTriggerProps(core.getTriggerProps()),
    getTooltipProps: () => mapContentProps(core.getTooltipProps()),
    open: (reason?: TooltipReason) => core.open(reason),
    close: (reason?: TooltipReason) => core.close(reason),
    toggle: () => core.toggle(),
    dispose,
  }
}

function mapTriggerProps(props: TooltipTriggerProps): VueTriggerProps {
  const { onPointerEnter, onPointerLeave, ...rest } = props
  return {
    ...rest,
    onPointerenter: onPointerEnter,
    onPointerleave: onPointerLeave,
  }
}

function mapContentProps(props: TooltipContentProps): VueTooltipProps {
  const { onPointerEnter, onPointerLeave, ...rest } = props
  return {
    ...rest,
    onPointerenter: onPointerEnter,
    onPointerleave: onPointerLeave,
  }
}
