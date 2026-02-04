import { getCurrentScope, onScopeDispose, shallowRef } from "vue"
import type { ShallowRef } from "vue"
import type {
  TooltipCallbacks,
  TooltipContentProps,
  TooltipDescriptionOptions,
  TooltipDescriptionProps,
  TooltipOptions,
  TooltipReason,
  TooltipState,
  TooltipTriggerOptions,
  TooltipTriggerProps,
} from "@affino/tooltip-core"
import { TooltipCore } from "@affino/tooltip-core"
import { getDocumentOverlayManager, type OverlayManager } from "@affino/overlay-kernel"

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
  readonly getTriggerProps: (options?: TooltipTriggerOptions) => VueTriggerProps
  readonly getTooltipProps: () => VueTooltipProps
  readonly getDescriptionProps: (options?: TooltipDescriptionOptions) => TooltipDescriptionProps
  readonly open: (reason?: TooltipReason) => void
  readonly close: (reason?: TooltipReason) => void
  readonly toggle: () => void
  readonly dispose: () => void
}

export function useTooltipController(options?: TooltipOptions, callbacks?: TooltipCallbacks): TooltipController {
  const resolvedOptions = withDefaultOverlayManager(options)
  const core = new TooltipCore(resolvedOptions, callbacks)
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

  if (getCurrentScope()) {
    onScopeDispose(dispose)
  }

  return {
    id: core.id,
    core,
    state,
    getTriggerProps: (options?: TooltipTriggerOptions) => mapTriggerProps(core.getTriggerProps(options)),
    getTooltipProps: () => mapContentProps(core.getTooltipProps()),
    getDescriptionProps: (options?: TooltipDescriptionOptions) => core.getDescriptionProps(options),
    open: (reason?: TooltipReason) => core.open(reason),
    close: (reason?: TooltipReason) => core.close(reason),
    toggle: () => core.toggle(),
    dispose,
  }
}

function withDefaultOverlayManager(options?: TooltipOptions): TooltipOptions | undefined {
  if (options?.overlayManager || options?.getOverlayManager) {
    return options
  }
  const getOverlayManager = () => resolveDocumentOverlayManager()
  if (!options) {
    return { getOverlayManager }
  }
  return {
    ...options,
    getOverlayManager,
  }
}

function resolveDocumentOverlayManager(): OverlayManager | null {
  if (typeof document === "undefined") {
    return null
  }
  return getDocumentOverlayManager(document)
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
