import { getCurrentScope, onScopeDispose, shallowRef } from "vue"
import type { ShallowRef } from "vue"
import { createDiagramInteractionController, type DiagramBezierCreationOptions, type DiagramPathCreationOptions, type DiagramBezierHandleKind, type DiagramDynamicInputState, type DiagramInteractionController, type DiagramInteractionSnapOptions, type DiagramInteractionSnapshot, type DiagramInteractionTool, type DiagramPoint, type DiagramPointerEvent, type DiagramOrthogonalRouteOptions, type DiagramViewportConstraints, type DiagramId, type DiagramTableResizeAxis, type DiagramPortCreationOptions, type DiagramResizeHandle } from "@affino/diagram-core"
import type { DiagramEngineController } from "./useDiagramEngine.js"

export type DiagramPointerController = Readonly<{
  interaction: DiagramInteractionController
  state: ShallowRef<DiagramInteractionSnapshot>
  getPreviewGeometry: (id: string) => ReturnType<DiagramInteractionController["getPreviewGeometry"]>
  setTool: (tool: DiagramInteractionTool) => void
  setDynamicInput: (values: Partial<DiagramDynamicInputState>) => boolean
  confirmDynamicInput: () => boolean
  cancelDynamicInput: () => void
  beginEdgeCreation: (id: string, event: PointerEvent, routeOptions?: DiagramOrthogonalRouteOptions) => boolean
  beginEdgePathCreation: (id: string, event: PointerEvent, routeOptions?: DiagramOrthogonalRouteOptions) => boolean
  finishEdgePathCreation: (point?: DiagramPoint) => boolean
  beginLineCreation: (id: string, event: PointerEvent) => boolean
  beginPathCreation: (id: string, event: PointerEvent, modeOrOptions?: "line" | "path" | DiagramPathCreationOptions) => boolean
  beginBezierCreation: (id: DiagramId, event: PointerEvent, options?: DiagramBezierCreationOptions) => boolean
  finishBezierCreation: (closed?: boolean) => boolean
  beginBezierHandle: (id: DiagramId, contourIndex: number, segmentIndex: number, handle: DiagramBezierHandleKind, event: PointerEvent, anchorSide?: "start" | "end") => boolean
  beginPortCreation: (id: DiagramId, event: PointerEvent, options?: DiagramPortCreationOptions) => boolean
  beginPathVertexHandle: (id: string, index: number, event: PointerEvent) => boolean
  beginEdgeWaypointHandle: (id: string, index: number, event: PointerEvent) => boolean
  beginEdgeSegmentHandle: (id: string, segmentIndex: number, event: PointerEvent) => boolean
  beginResizeHandle: (id: DiagramId, handle: DiagramResizeHandle, event: PointerEvent) => boolean
  beginResizeSelectionHandle: (handle: DiagramResizeHandle, event: PointerEvent) => boolean
  addPathVertex: (point?: DiagramPoint, finish?: boolean) => boolean
  finishPathCreation: () => boolean
  beginTableResizeHandle: (id: DiagramId, axis: DiagramTableResizeAxis, index: number, event: PointerEvent) => boolean
  cancel: () => void
  getSvgPointerProps: () => {
    onPointerdown: (event: PointerEvent) => void
    onPointermove: (event: PointerEvent) => void
    onPointerup: (event: PointerEvent) => void
    onPointercancel: () => void
    onKeydown: (event: KeyboardEvent) => void
  }
  dispose: () => void
}>

export type DiagramPointerControllerOptions = Readonly<{
  toWorldPoint?: (event: PointerEvent) => DiagramPoint
  setPointerCapture?: (event: PointerEvent) => void
  releasePointerCapture?: (event: PointerEvent) => void
  snap?: DiagramInteractionSnapOptions
  viewportConstraints?: DiagramViewportConstraints
}>

export function useDiagramPointerController(controller: DiagramEngineController, options: DiagramPointerControllerOptions = {}): DiagramPointerController {
  let refresh = () => {}
  const interaction = createDiagramInteractionController(controller.engine, {
    snap: options.snap,
    viewportConstraints: options.viewportConstraints,
    scheduleFrame: (callback) => {
      const schedule = typeof globalThis.requestAnimationFrame === "function"
        ? globalThis.requestAnimationFrame.bind(globalThis)
        : (next: FrameRequestCallback) => globalThis.setTimeout(next, 0)
      schedule(() => {
        if (disposed) {
          return
        }
        callback()
        refresh()
      })
    },
  })
  let lastSnapshot = interaction.getSnapshot()
  const state = shallowRef(lastSnapshot)
  let disposed = false
  refresh = () => {
    const next = interaction.getSnapshot()
    if (sameSnapshot(lastSnapshot, next)) {
      return
    }
    lastSnapshot = next
    state.value = next
  }
  const editingLockSubscription = controller.engine.subscribeEditingLock(() => refresh())
  const toEvent = (event: PointerEvent) => ({ id: event.pointerId, point: toWorldPoint(event, options.toWorldPoint), shiftKey: event.shiftKey, altKey: event.altKey, clickCount: event.detail })
  const api: DiagramPointerController = {
    interaction,
    state,
    getPreviewGeometry: (id) => interaction.getPreviewGeometry(id),
    setTool: (tool) => {
      interaction.setTool(tool)
      refresh()
    },
    setDynamicInput: (values) => {
      const accepted = interaction.setDynamicInput(values)
      refresh()
      return accepted
    },
    confirmDynamicInput: () => {
      const accepted = interaction.confirmDynamicInput()
      refresh()
      return accepted
    },
    cancelDynamicInput: () => {
      interaction.cancelDynamicInput()
      refresh()
    },
    beginEdgeCreation: (id, event, routeOptions) => {
      options.setPointerCapture?.(event)
      const pointerEvent: DiagramPointerEvent = toEvent(event)
      const accepted = interaction.beginEdgeCreation(id, pointerEvent, routeOptions)
      refresh()
      return accepted
    },
    beginEdgePathCreation: (id, event, routeOptions) => { options.setPointerCapture?.(event); const accepted = interaction.beginEdgePathCreation(id, toEvent(event), routeOptions); refresh(); return accepted },
    finishEdgePathCreation: (point) => { const accepted = interaction.finishEdgePathCreation(point); refresh(); return accepted },
    beginLineCreation: (id, event) => {
      options.setPointerCapture?.(event)
      const accepted = interaction.beginLineCreation(id, toEvent(event))
      refresh()
      return accepted
    },
    beginPathCreation: (id, event, modeOrOptions) => {
      options.setPointerCapture?.(event)
      const accepted = interaction.beginPathCreation(id, toEvent(event), modeOrOptions)
      refresh()
      return accepted
    },
    beginBezierCreation: (id, event, bezierOptions) => { options.setPointerCapture?.(event); const accepted = interaction.beginBezierCreation(id, toEvent(event), bezierOptions); refresh(); return accepted },
    finishBezierCreation: (closed) => { const accepted = interaction.finishBezierCreation(closed); refresh(); return accepted },
    beginBezierHandle: (id, contourIndex, segmentIndex, handle, event, anchorSide) => { options.setPointerCapture?.(event); const accepted = interaction.beginBezierHandle(id, contourIndex, segmentIndex, handle, toEvent(event), anchorSide); refresh(); return accepted },
    beginPortCreation: (id, event, portOptions) => {
      const accepted = interaction.beginPortCreation(id, toEvent(event), portOptions)
      refresh()
      return accepted
    },
    beginPathVertexHandle: (id, index, event) => { const accepted = interaction.beginPathVertexHandle(id, index, toEvent(event)); refresh(); return accepted },
    beginEdgeWaypointHandle: (id, index, event) => { const accepted = interaction.beginEdgeWaypointHandle(id, index, toEvent(event)); refresh(); return accepted },
    beginEdgeSegmentHandle: (id, segmentIndex, event) => { options.setPointerCapture?.(event); const accepted = interaction.beginEdgeSegmentHandle(id, segmentIndex, toEvent(event)); refresh(); return accepted },
    beginResizeHandle: (id, handle, event) => { options.setPointerCapture?.(event); const accepted = interaction.beginResizeHandle(id, handle, toEvent(event)); refresh(); return accepted },
    beginResizeSelectionHandle: (handle, event) => { options.setPointerCapture?.(event); const accepted = interaction.beginResizeSelectionHandle(handle, toEvent(event)); refresh(); return accepted },
    addPathVertex: (point, finish) => { const accepted = interaction.addPathVertex(point, finish); refresh(); return accepted },
    finishPathCreation: () => { const accepted = interaction.finishPathCreation(); refresh(); return accepted },
    beginTableResizeHandle: (id, axis, index, event) => {
      if (options.setPointerCapture) options.setPointerCapture(event)
      else (event.currentTarget as Element | null)?.setPointerCapture?.(event.pointerId)
      const accepted = interaction.beginTableResizeHandle(id, axis, index, toEvent(event))
      refresh()
      return accepted
    },
    cancel: () => {
      interaction.cancel()
      refresh()
    },
    getSvgPointerProps: () => ({
      onPointerdown: (event) => {
        options.setPointerCapture?.(event)
        interaction.pointerDown(toEvent(event))
        refresh()
      },
      onPointermove: (event) => {
        interaction.pointerMove(toEvent(event))
        refresh()
      },
      onPointerup: (event) => {
        interaction.pointerUp(toEvent(event))
        options.releasePointerCapture?.(event)
        refresh()
      },
      onPointercancel: () => {
        interaction.cancel()
        refresh()
      },
      onKeydown: (event) => {
        if (event.key === "Escape") {
          if (interaction.getSnapshot().active) event.preventDefault()
          interaction.cancel()
          refresh()
        } else if (event.key === "Enter" && interaction.getSnapshot().tool === "draw-bezier") {
          event.preventDefault()
          interaction.finishBezierCreation()
          refresh()
        } else if (event.key === "Enter" && interaction.getSnapshot().tool === "draw-path" && interaction.getSnapshot().pathCreationPreview) {
          event.preventDefault()
          interaction.finishPathCreation()
          refresh()
        }
      },
    }),
    dispose: () => {
      if (disposed) {
        return
      }
      disposed = true
      interaction.dispose()
      editingLockSubscription.unsubscribe()
      refresh()
    },
  }
  if (getCurrentScope()) {
    onScopeDispose(api.dispose)
  }
  return api
}

function sameSnapshot(previous: DiagramInteractionSnapshot, next: DiagramInteractionSnapshot): boolean {
  return previous.tool === next.tool
    && previous.active === next.active
    && previous.editingLocked === next.editingLocked
    && previous.previewDelta === next.previewDelta
    && previous.resizePreview === next.resizePreview
    && previous.resizePreviewEntries === next.resizePreviewEntries
    && previous.tableResizePreview === next.tableResizePreview
    && previous.edgeEndpointPreview === next.edgeEndpointPreview
    && previous.edgeSegmentPreview === next.edgeSegmentPreview
    && previous.snapGuides === next.snapGuides
    && previous.snapResult === next.snapResult
    && previous.snapMarkers === next.snapMarkers
    && previous.constraint === next.constraint
    && previous.dynamicInput === next.dynamicInput
    && previous.edgeCreationPreview === next.edgeCreationPreview
    && previous.shapeCreationPreview === next.shapeCreationPreview
    && previous.pathCreationPreview === next.pathCreationPreview
    && previous.bezierCreationPreview === next.bezierCreationPreview
    && previous.bezierHandlePreview === next.bezierHandlePreview
    && previous.portCreationPreview === next.portCreationPreview
    && previous.edgeWaypointPreview === next.edgeWaypointPreview
    && previous.pathVertexPreview === next.pathVertexPreview
    && previous.shapeCreationPreview === next.shapeCreationPreview
    && previous.marquee === next.marquee
}

function toWorldPoint(event: PointerEvent, mapper?: (event: PointerEvent) => DiagramPoint): DiagramPoint {
  if (mapper) {
    return mapper(event)
  }
  return { x: event.clientX, y: event.clientY }
}
