import { getCurrentScope, onScopeDispose, shallowRef } from "vue"
import type { ShallowRef } from "vue"
import type {
  PopoverCallbacks,
  PopoverContentOptions,
  PopoverContentProps,
  PopoverInteractOutsideEvent,
  PopoverOptions,
  PopoverState,
  PopoverTriggerOptions,
  PopoverTriggerProps,
  SurfaceReason,
} from "@affino/popover-core"
import { PopoverCore } from "@affino/popover-core"

type VueTriggerProps = Omit<PopoverTriggerProps, "onClick" | "onKeyDown"> & {
  onClick?: PopoverTriggerProps["onClick"]
  onKeydown?: PopoverTriggerProps["onKeyDown"]
}

type VueContentProps = Omit<PopoverContentProps, "onKeyDown"> & {
  onKeydown?: PopoverContentProps["onKeyDown"]
}

export interface PopoverController {
  readonly id: string
  readonly core: PopoverCore
  readonly state: ShallowRef<PopoverState>
  readonly getTriggerProps: (options?: PopoverTriggerOptions) => VueTriggerProps
  readonly getContentProps: (options?: PopoverContentOptions) => VueContentProps
  readonly open: (reason?: SurfaceReason) => void
  readonly close: (reason?: SurfaceReason) => void
  readonly toggle: () => void
  readonly interactOutside: (event: PopoverInteractOutsideEvent) => void
  readonly dispose: () => void
}

export function usePopoverController(options?: PopoverOptions, callbacks?: PopoverCallbacks): PopoverController {
  const core = new PopoverCore(options, callbacks)
  const state = shallowRef<PopoverState>(core.getSnapshot())
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

  if (getCurrentScope()) {
    onScopeDispose(dispose)
  }

  return {
    id: core.id,
    core,
    state,
    getTriggerProps: (options?: PopoverTriggerOptions) => mapTriggerProps(core.getTriggerProps(options)),
    getContentProps: (options?: PopoverContentOptions) => mapContentProps(core.getContentProps(options)),
    open: (reason?: SurfaceReason) => core.open(reason),
    close: (reason?: SurfaceReason) => core.close(reason),
    toggle: () => core.toggle(),
    interactOutside: (event: PopoverInteractOutsideEvent) => core.interactOutside(event),
    dispose,
  }
}

function mapTriggerProps(props: PopoverTriggerProps): VueTriggerProps {
  const { onKeyDown, ...rest } = props
  return {
    ...rest,
    onKeydown: onKeyDown,
  }
}

function mapContentProps(props: PopoverContentProps): VueContentProps {
  const { onKeyDown, ...rest } = props
  return {
    ...rest,
    onKeydown: onKeyDown,
  }
}
