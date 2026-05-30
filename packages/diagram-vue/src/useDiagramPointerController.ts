import { getCurrentScope, onScopeDispose, shallowRef } from "vue"
import type { ShallowRef } from "vue"
import { createDiagramInteractionController, type DiagramInteractionController, type DiagramInteractionSnapshot, type DiagramInteractionTool, type DiagramPoint } from "@affino/diagram-core"
import type { DiagramEngineController } from "./useDiagramEngine.js"

export type DiagramPointerController = Readonly<{
  interaction: DiagramInteractionController
  state: ShallowRef<DiagramInteractionSnapshot>
  setTool: (tool: DiagramInteractionTool) => void
  getSvgPointerProps: () => {
    onPointerdown: (event: PointerEvent) => void
    onPointermove: (event: PointerEvent) => void
    onPointerup: (event: PointerEvent) => void
    onPointercancel: () => void
  }
  dispose: () => void
}>

export type DiagramPointerControllerOptions = Readonly<{
  toWorldPoint?: (event: PointerEvent) => DiagramPoint
  setPointerCapture?: (event: PointerEvent) => void
  releasePointerCapture?: (event: PointerEvent) => void
}>

export function useDiagramPointerController(controller: DiagramEngineController, options: DiagramPointerControllerOptions = {}): DiagramPointerController {
  let refresh = () => {}
  const interaction = createDiagramInteractionController(controller.engine, {
    scheduleFrame: (callback) => {
      requestAnimationFrame(() => {
        callback()
        refresh()
      })
    },
  })
  const state = shallowRef(interaction.getSnapshot())
  let disposed = false
  refresh = () => {
    state.value = interaction.getSnapshot()
  }
  const toEvent = (event: PointerEvent) => ({ id: event.pointerId, point: toWorldPoint(event, options.toWorldPoint), shiftKey: event.shiftKey })
  const api: DiagramPointerController = {
    interaction,
    state,
    setTool: (tool) => {
      interaction.setTool(tool)
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
    }),
    dispose: () => {
      if (disposed) {
        return
      }
      disposed = true
      interaction.cancel()
      refresh()
    },
  }
  if (getCurrentScope()) {
    onScopeDispose(api.dispose)
  }
  return api
}

function toWorldPoint(event: PointerEvent, mapper?: (event: PointerEvent) => DiagramPoint): DiagramPoint {
  if (mapper) {
    return mapper(event)
  }
  return { x: event.clientX, y: event.clientY }
}
