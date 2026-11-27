import { createDiagramEngine, deserializeDiagramDocument } from "./DiagramEngine.js"
import type { DiagramEngine } from "./DiagramEngine.js"
import type { DiagramContentOverrides, DiagramConnectorRenderGeometry, DiagramConnectorRenderOptions, DiagramGeometry, DiagramId, DiagramRect, DiagramRenderOrderOptions, DiagramScene, DiagramSceneInput, DiagramSubscriber, DiagramTextMeasurementProvider, DiagramDocument, SerializedDiagramScene } from "./types.js"
import type { DiagramTableLayout, DiagramTableLayoutOptions } from "./geometry.js"

/** Read-only geometry and layout access used by graphical presentation consumers. */
export type DiagramPresentationSource = Readonly<{
  /** Unique to this source instance. Use it with entity IDs when combining render projections. */
  sourceId: string
  readonly: true
  getScene: () => DiagramScene
  subscribe: (listener: DiagramSubscriber) => { unsubscribe: () => void }
  queryVisible: (bounds: DiagramRect) => DiagramId[]
  getRenderOrder: (options?: DiagramRenderOrderOptions) => DiagramId[]
  getGeometrySnapshot: (id: DiagramId) => DiagramGeometry | null
  getPresentedGeometrySnapshot: (id: DiagramId, overrides: DiagramContentOverrides) => DiagramGeometry | null
  getTableLayout: (id: DiagramId, textMeasurementProvider?: DiagramTextMeasurementProvider) => DiagramTableLayout | null
  getPresentedTableLayout: (id: DiagramId, options?: DiagramTableLayoutOptions) => DiagramTableLayout | null
  getConnectorRenderGeometry: (options?: DiagramConnectorRenderOptions) => ReadonlyArray<DiagramConnectorRenderGeometry>
  dispose: () => void
}>

let nextSourceId = 1

/** Wraps an engine with a read-only surface. Disposing this source unsubscribes its listeners but leaves the engine alive. */
export function createDiagramEnginePresentationSource(engine: DiagramEngine): DiagramPresentationSource {
  return createSource(engine)
}

/** Creates an isolated read-only presentation context. Input is validated and copied into a private Core computation engine. */
export function createDiagramDocumentPresentationSource(document: DiagramSceneInput | DiagramDocument | SerializedDiagramScene): DiagramPresentationSource {
  const scene = "format" in document ? deserializeDiagramDocument(document as DiagramDocument) : document as DiagramSceneInput
  const engine = createDiagramEngine(scene)
  return createSource(engine)
}

function createSource(engine: DiagramEngine): DiagramPresentationSource {
  let backing: DiagramEngine | null = engine
  let disposed = false
  const subscriptions = new Set<{ unsubscribe: () => void }>()
  const activeEngine = () => {
    if (disposed || !backing) throw new Error("Diagram presentation source has been disposed")
    return backing
  }
  const subscribe = (listener: DiagramSubscriber) => {
    const subscription = activeEngine().subscribe(listener)
    subscriptions.add(subscription)
    return { unsubscribe: () => { subscription.unsubscribe(); subscriptions.delete(subscription) } }
  }
  return Object.freeze({
    sourceId: `diagram-presentation-${nextSourceId++}`,
    readonly: true as const,
    getScene: () => activeEngine().getScene(),
    subscribe,
    queryVisible: (bounds) => activeEngine().queryVisible(bounds),
    getRenderOrder: (options) => activeEngine().getRenderOrder(options),
    getGeometrySnapshot: (id) => activeEngine().getGeometrySnapshot(id),
    getPresentedGeometrySnapshot: (id, overrides) => activeEngine().getPresentedGeometrySnapshot(id, overrides),
    getTableLayout: (id, provider) => activeEngine().getTableLayout(id, provider),
    getPresentedTableLayout: (id, options) => activeEngine().getPresentedTableLayout(id, options),
    getConnectorRenderGeometry: (options) => activeEngine().getConnectorRenderGeometry(options),
    dispose: () => { if (disposed) return; disposed = true; for (const subscription of subscriptions) subscription.unsubscribe(); subscriptions.clear(); backing = null },
  })
}
