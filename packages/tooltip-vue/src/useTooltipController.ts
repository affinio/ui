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

type ActiveTooltipRegistry = {
  cores: Map<TooltipCore, () => void>
  onKeyDown: (event: KeyboardEvent) => void
  onWindowBlur: () => void
  onVisibilityChange: () => void
}
const activeTooltipsByDocument = new WeakMap<Document, ActiveTooltipRegistry>()

function setEscapeActive(doc: Document, core: TooltipCore, active: boolean, onBlur: () => void): void {
  let registry = activeTooltipsByDocument.get(doc)
  if (active) {
    if (!registry) {
      const cores = new Map<TooltipCore, () => void>()
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== "Escape") return
        const openCores = Array.from(cores.keys()).reverse()
        const topmost = openCores.find((candidate) => {
          const manager = candidate.getOverlayManager()
          if (!manager) return true
          if (manager.isTopMost(candidate.id)) return true
          return !manager.getStack().length && !manager.getEntry(candidate.id)
        })
        if (!topmost) return
        event.preventDefault()
        event.stopPropagation()
        topmost.close("keyboard")
      }
      const onWindowBlur = () => Array.from(cores.values()).forEach((close) => close())
      const onVisibilityChange = () => {
        if (doc.visibilityState === "hidden") onWindowBlur()
      }
      registry = { cores, onKeyDown, onWindowBlur, onVisibilityChange }
      activeTooltipsByDocument.set(doc, registry)
      doc.addEventListener("keydown", onKeyDown)
      doc.defaultView?.addEventListener("blur", onWindowBlur)
      doc.addEventListener("visibilitychange", onVisibilityChange)
    }
    registry.cores.set(core, onBlur)
    return
  }
  if (!registry || !registry.cores.delete(core)) return
  if (!registry.cores.size) {
    doc.removeEventListener("keydown", registry.onKeyDown)
    doc.defaultView?.removeEventListener("blur", registry.onWindowBlur)
    doc.removeEventListener("visibilitychange", registry.onVisibilityChange)
    activeTooltipsByDocument.delete(doc)
  }
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
  const ownerDocument = typeof document === "undefined" ? null : document
  let disposed = false
  let suppressPointerUntilLeave = false
  let pointerIsOverTrigger = false
  const onWindowBlur = () => {
    if (core.getSnapshot().open && pointerIsOverTrigger) suppressPointerUntilLeave = true
    core.close("pointer")
  }
  const syncEscapeActive = () => {
    const active = Boolean(ownerDocument && (core.getSnapshot().open || pointerIsOverTrigger))
    if (ownerDocument && escapeActive !== active) {
      escapeActive = active
      setEscapeActive(ownerDocument, core, active, onWindowBlur)
    }
  }
  let escapeActive = false
  const subscription = core.subscribe((next) => {
    state.value = next
    syncEscapeActive()
  })
  const dispose = () => {
    if (disposed) return
    disposed = true
    if (ownerDocument && escapeActive) {
      escapeActive = false
      setEscapeActive(ownerDocument, core, false, onWindowBlur)
    }
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
    getTriggerProps: (options?: TooltipTriggerOptions) => mapTriggerProps(core.getTriggerProps(options), {
      shouldSuppressPointerEnter: () => suppressPointerUntilLeave,
      onPointerEnter: () => { pointerIsOverTrigger = true; syncEscapeActive() },
      onPointerLeave: () => { pointerIsOverTrigger = false; suppressPointerUntilLeave = false; syncEscapeActive() },
    }),
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

function mapTriggerProps(
  props: TooltipTriggerProps,
  focusState: { shouldSuppressPointerEnter: () => boolean; onPointerEnter: () => void; onPointerLeave: () => void },
): VueTriggerProps {
  const { onPointerEnter, onPointerLeave, ...rest } = props
  return {
    ...rest,
    onPointerenter: (event) => {
      focusState.onPointerEnter()
      if (!focusState.shouldSuppressPointerEnter()) onPointerEnter?.(event)
    },
    onPointerleave: (event) => {
      onPointerLeave?.(event)
      focusState.onPointerLeave()
    },
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
