import type { DiagramClipboard, DiagramEdge, DiagramEdgeEndpoint, DiagramId, DiagramNode, DiagramPoint, DiagramSelection, DiagramShape, DiagramText } from "../types.js"
import type { InternalState, Patch } from "./model.js"

type DeletePatchFactory = (ids: ReadonlyArray<DiagramId>) => Patch
type NormalizeSelection = (selection: Partial<DiagramSelection> | undefined) => DiagramSelection

export class DiagramClipboardService {
  exportSubgraph(state: InternalState, ids: ReadonlyArray<DiagramId>, normalizeSelection: NormalizeSelection): DiagramClipboard {
    const selected = new Set(ids)
    const nodes = state.order.nodeIds
      .map((id) => state.entities.nodesById.get(id))
      .filter((entity): entity is DiagramNode => entity !== undefined && selected.has(entity.id))
    const ports = [...state.entities.portsById.values()].filter((port) => selected.has(port.id) || selected.has(port.nodeId))
    const included = new Set<DiagramId>([...selected, ...ports.map((port) => port.id)])
    const edges = state.order.edgeIds
      .map((id) => state.entities.edgesById.get(id))
      .filter((edge): edge is DiagramEdge => edge !== undefined && (selected.has(edge.id) || (endpointIncluded(edge.source, included) && endpointIncluded(edge.target, included))))
    return {
      nodes,
      ports,
      edges,
      texts: state.order.textIds
        .map((id) => state.entities.textsById.get(id))
        .filter((entity): entity is DiagramText => entity !== undefined && selected.has(entity.id)),
      shapes: state.order.shapeIds
        .map((id) => state.entities.shapesById.get(id))
        .filter((entity): entity is DiagramShape => entity !== undefined && selected.has(entity.id)),
      selection: normalizeSelection({ ids: [...selected], primaryId: state.selection.primaryId }),
      viewport: state.viewport,
    }
  }

  createPastePatch(state: InternalState, clipboard: DiagramClipboard, offset: DiagramPoint, createDeletePatch: DeletePatchFactory, normalizeSelection: NormalizeSelection): Patch | null {
    const remap = new Map<DiagramId, DiagramId>()
    const reserve = (id: DiagramId) => {
      const next = uniqueId(state, `${id}-copy`, remap.size + 1)
      remap.set(id, next)
      return next
    }
    for (const entity of [...clipboard.nodes, ...clipboard.ports, ...clipboard.edges, ...clipboard.texts, ...clipboard.shapes]) reserve(entity.id)
    const nodes = clipboard.nodes.map((node) => ({ ...node, id: remap.get(node.id)!, x: node.x + offset.x, y: node.y + offset.y, portIds: node.portIds?.map((id) => remap.get(id) ?? id) }))
    const ports = clipboard.ports.map((port) => ({ ...port, id: remap.get(port.id)!, nodeId: remap.get(port.nodeId) ?? port.nodeId }))
    const edges = clipboard.edges.map((edge) => ({ ...edge, id: remap.get(edge.id)!, source: remapEndpoint(edge.source, remap), target: remapEndpoint(edge.target, remap), points: edge.points?.map((point) => ({ x: point.x + offset.x, y: point.y + offset.y })) }))
    const texts = clipboard.texts.map((text) => ({ ...text, id: remap.get(text.id)!, x: text.x + offset.x, y: text.y + offset.y }))
    const shapes = clipboard.shapes.map((shape) => ({ ...shape, id: remap.get(shape.id)!, x: shape.x + offset.x, y: shape.y + offset.y }))
    const pastedIds = [...nodes, ...ports, ...edges, ...texts, ...shapes].map((entity) => entity.id)
    if (!pastedIds.length) return null
    return {
      apply: (next) => {
        for (const node of nodes) { next.entities.nodesById.set(node.id, node); next.order.nodeIds.push(node.id); next.versions.set(node.id, 0) }
        for (const port of ports) { next.entities.portsById.set(port.id, port); next.versions.set(port.id, 0) }
        for (const edge of edges) { next.entities.edgesById.set(edge.id, edge); next.order.edgeIds.push(edge.id); next.versions.set(edge.id, 0) }
        for (const text of texts) { next.entities.textsById.set(text.id, text); next.order.textIds.push(text.id); next.versions.set(text.id, 0) }
        for (const shape of shapes) { next.entities.shapesById.set(shape.id, shape); next.order.shapeIds.push(shape.id); next.versions.set(shape.id, 0) }
        next.selection = normalizeSelection({ ids: pastedIds.filter((id) => !next.entities.portsById.has(id)), primaryId: nodes[0]?.id ?? texts[0]?.id ?? shapes[0]?.id ?? edges[0]?.id ?? null })
        return new Set([...pastedIds, "selection"])
      },
      inverse: createDeletePatch(pastedIds),
    }
  }
}

function endpointIncluded(endpoint: DiagramEdgeEndpoint, ids: ReadonlySet<DiagramId>): boolean {
  if (endpoint.kind === "point") return true
  if (endpoint.kind === "node") return ids.has(endpoint.nodeId)
  return ids.has(endpoint.portId)
}

function remapEndpoint(endpoint: DiagramEdgeEndpoint, remap: ReadonlyMap<DiagramId, DiagramId>): DiagramEdgeEndpoint {
  if (endpoint.kind === "point") return { kind: "point", point: endpoint.point }
  if (endpoint.kind === "node") return { kind: "node", nodeId: remap.get(endpoint.nodeId) ?? endpoint.nodeId }
  return { kind: "port", portId: remap.get(endpoint.portId) ?? endpoint.portId }
}

function uniqueId(state: InternalState, base: string, seed: number): DiagramId {
  let id = `${base}-${seed}`
  let index = seed
  while (hasEntity(state, id)) {
    index += 1
    id = `${base}-${index}`
  }
  return id
}

function hasEntity(state: InternalState, id: DiagramId): boolean {
  return state.entities.nodesById.has(id) || state.entities.edgesById.has(id) || state.entities.textsById.has(id) || state.entities.shapesById.has(id) || state.entities.portsById.has(id)
}
