import { getCurrentScope, onScopeDispose, shallowRef, toValue, watch } from "vue"
import type { MaybeRefOrGetter, ShallowRef } from "vue"
import type { DiagramConnectorRenderOptions } from "@affino/diagram-core"
import type { DiagramEngineController } from "./useDiagramEngine.js"
import { createDiagramEnginePresentationSource } from "@affino/diagram-core"
import type { DiagramPresentationSource } from "@affino/diagram-core"
import type { DiagramConnectorRenderEntity } from "./types.js"
import { connectorCommandsToSvgPath } from "./useDiagramRenderer.js"

export type DiagramConnectorRenderingController = Readonly<{
  connectors: ShallowRef<ReadonlyArray<DiagramConnectorRenderEntity>>
  refresh: () => void
  dispose: () => void
}>

/** Reactive SVG-ready connector paths. Options affect rendering only and are not written to the scene or history. */
export function useDiagramConnectorRendering(input: DiagramEngineController | DiagramPresentationSource, options: MaybeRefOrGetter<DiagramConnectorRenderOptions> = {}): DiagramConnectorRenderingController {
  const editable = "dispatch" in input
  const source = editable ? createDiagramEnginePresentationSource(input.engine) : input
  const connectors = shallowRef<ReadonlyArray<DiagramConnectorRenderEntity>>(Object.freeze([]))
  const refresh = () => {
    const selected = new Set(editable ? input.scene.value.selection.ids : [])
    connectors.value = Object.freeze(source.getConnectorRenderGeometry(toValue(options)).map((geometry) => Object.freeze({
      id: geometry.id,
      pathData: connectorCommandsToSvgPath(geometry.commands),
      ...(geometry.style ? { style: geometry.style } : {}),
      bridges: geometry.bridges,
      junctions: geometry.junctions,
      selected: selected.has(geometry.id),
    })))
  }
  const subscription = source.subscribe(() => refresh())
  const stopOptionsWatch = watch(() => toValue(options), refresh, { deep: true })
  let disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    subscription.unsubscribe()
    stopOptionsWatch()
    if (editable) source.dispose()
  }
  if (getCurrentScope()) onScopeDispose(dispose)
  refresh()
  return { connectors, refresh, dispose }
}
