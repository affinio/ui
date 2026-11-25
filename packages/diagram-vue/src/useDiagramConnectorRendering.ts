import { getCurrentScope, onScopeDispose, shallowRef, toValue, watch } from "vue"
import type { MaybeRefOrGetter, ShallowRef } from "vue"
import type { DiagramConnectorRenderOptions } from "@affino/diagram-core"
import type { DiagramEngineController } from "./useDiagramEngine.js"
import type { DiagramConnectorRenderEntity } from "./types.js"
import { connectorCommandsToSvgPath } from "./useDiagramRenderer.js"

export type DiagramConnectorRenderingController = Readonly<{
  connectors: ShallowRef<ReadonlyArray<DiagramConnectorRenderEntity>>
  refresh: () => void
  dispose: () => void
}>

/** Reactive SVG-ready connector paths. Options affect rendering only and are not written to the scene or history. */
export function useDiagramConnectorRendering(controller: DiagramEngineController, options: MaybeRefOrGetter<DiagramConnectorRenderOptions> = {}): DiagramConnectorRenderingController {
  const connectors = shallowRef<ReadonlyArray<DiagramConnectorRenderEntity>>(Object.freeze([]))
  const refresh = () => {
    const selected = new Set(controller.scene.value.selection.ids)
    connectors.value = Object.freeze(controller.engine.getConnectorRenderGeometry(toValue(options)).map((geometry) => Object.freeze({
      id: geometry.id,
      pathData: connectorCommandsToSvgPath(geometry.commands),
      ...(geometry.style ? { style: geometry.style } : {}),
      bridges: geometry.bridges,
      junctions: geometry.junctions,
      selected: selected.has(geometry.id),
    })))
  }
  const subscription = controller.engine.subscribe(() => refresh())
  const stopOptionsWatch = watch(() => toValue(options), refresh, { deep: true })
  let disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    subscription.unsubscribe()
    stopOptionsWatch()
  }
  if (getCurrentScope()) onScopeDispose(dispose)
  refresh()
  return { connectors, refresh, dispose }
}
